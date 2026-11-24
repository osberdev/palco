import { cents } from '../domain/money'
import type { PaymentSummary } from '../domain/payment'
import type { MuseumFeeKind } from '../domain/purchase'
import type { CalendarDate, CinemaFilm, CinemaFormatId, Purchase, TimeOfDay } from '../../types'
import { formatIsoDate } from '../../utils/date'
import { getDatabase, type Database, type Queryable } from './client.ts'
import { requireIsoDate } from './iso-date.ts'

/**
 * Confirmed purchases, their tickets and their request keys. The columns hold what
 * the three categories share and `details` only what is specific to each one;
 * reading rebuilds the same `Purchase` that `confirmPurchase` recorded (PU1). The
 * user, the key and the fingerprint never leave this module: they do not travel to
 * the client. The database can be injected to test it with PGlite.
 */

/** What is remembered about a recorded confirmation (RN-CON-07). */
export interface StoredRequest {
  readonly fingerprint: string
  readonly folio: string
}

export interface PurchaseRecord {
  readonly userId: number
  /** The folio counter: `nextSequence()` at confirmation time. */
  readonly sequence: number
  readonly requestId: string
  readonly fingerprint: string
  readonly purchase: Purchase
  /** One per ticket, in order: the first is "Boleto 1 de M" (RN-BOL-01). */
  readonly ticketIds: readonly string[]
}

/** An issued ticket, for the gate. */
export interface IssuedTicket {
  /** 16 characters of Crockford base32, without hyphens. */
  readonly id: string
  readonly folio: string
  readonly userId: number
  /** From 1 to the purchase quantity: "Boleto N de M". */
  readonly number: number
}

interface PurchaseRow {
  readonly folio: string
  readonly venue_id: string
  readonly category: Purchase['category']
  readonly venue_name: string
  readonly city: string
  readonly restrictions: string
  readonly event_date: string
  readonly event_time: string
  readonly quantity: number
  readonly subtotal_cents: number
  readonly fee_cents: number
  readonly total_cents: number
  readonly currency: Purchase['currency']
  readonly payment_summary: PaymentSummary
  readonly details: unknown
  readonly purchased_on: string
}

// What is specific to each category, as stored in `details`. Amounts are stored
// as numbers and turned back into `Cents` with `cents()`.
interface TheaterDetails {
  readonly play: string
  readonly section: { readonly name: string, readonly price: number }
  readonly dressCode: string
}

interface CinemaDetails {
  readonly film: CinemaFilm
  readonly formatId: CinemaFormatId
  readonly formatPrice: number
  readonly seats: readonly number[]
  readonly serviceFee: number
}

interface MuseumDetails {
  readonly feeKind: MuseumFeeKind
  readonly fee: number
  readonly entryNote: string
}

const PURCHASE_COLUMNS = `folio, venue_id, category, venue_name, city, restrictions, event_date, event_time,
  quantity, subtotal_cents, fee_cents, total_cents, currency, payment_summary, details, purchased_on`

function clock(time: TimeOfDay): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
}

function isoParts(text: string): readonly [number, number, number] {
  const [year, month, day] = text.split('-').map(Number)
  return [year ?? 0, month ?? 0, day ?? 0]
}

// Two key orders on purpose: the event date comes from `parseDate` as day, month
// and year, and the purchase date from `toCalendarDate` as year, month and day.
// Reproducing them keeps the API response byte-for-byte identical (PU1).
function eventDate(text: string): CalendarDate {
  const [year, month, day] = isoParts(text)
  return { day, month, year }
}

function purchaseDate(text: string): CalendarDate {
  const [year, month, day] = isoParts(text)
  return { year, month, day }
}

function parseClock(text: string): TimeOfDay {
  const [hour, minute] = text.split(':').map(Number)
  return { hour: hour ?? 0, minute: minute ?? 0 }
}

/** `details` and the purchase's total fee; the rest goes into columns. */
function ownColumns(purchase: Purchase): { readonly details: TheaterDetails | CinemaDetails | MuseumDetails, readonly feeTotal: number } {
  switch (purchase.category) {
    case 'teatro':
      return { details: { play: purchase.play, section: purchase.section, dressCode: purchase.dressCode }, feeTotal: 0 }
    case 'cine':
      return {
        details: {
          film: purchase.film,
          formatId: purchase.formatId,
          formatPrice: purchase.formatPrice,
          seats: purchase.seats,
          serviceFee: purchase.serviceFee,
        },
        feeTotal: purchase.feeTotal,
      }
    case 'museo':
      return { details: { feeKind: purchase.feeKind, fee: purchase.fee, entryNote: purchase.entryNote }, feeTotal: 0 }
  }
}

// `jsonb` sorts keys by length and does not keep `confirmPurchase`'s order: these
// two rebuild it, like `section` (PU1).
function paymentOf(summary: PaymentSummary): PaymentSummary {
  return summary.method === 'paypal'
    ? { method: summary.method, email: summary.email }
    : { method: summary.method, brand: summary.brand, maskedNumber: summary.maskedNumber, holder: summary.holder }
}

function filmOf(film: CinemaFilm): CinemaFilm {
  return { title: film.title, classification: film.classification, durationMinutes: film.durationMinutes }
}

/**
 * The `Purchase` of a row, with keys in `confirmPurchase`'s order: the API
 * response does not change even in that detail.
 */
function toPurchase(row: PurchaseRow): Purchase {
  const shared = {
    folio: row.folio,
    venueId: row.venue_id,
    venueName: row.venue_name,
    city: row.city,
    currency: row.currency,
    payment: paymentOf(row.payment_summary),
    restrictions: row.restrictions,
    purchasedOn: purchaseDate(row.purchased_on),
  }
  const common = {
    date: eventDate(row.event_date),
    time: parseClock(row.event_time),
    quantity: row.quantity,
    amount: cents(row.total_cents),
  }

  switch (row.category) {
    case 'teatro': {
      const details = row.details as TheaterDetails
      return {
        ...shared,
        category: 'teatro',
        ...common,
        play: details.play,
        section: { name: details.section.name, price: cents(details.section.price) },
        dressCode: details.dressCode,
      }
    }
    case 'cine': {
      const details = row.details as CinemaDetails
      return {
        ...shared,
        category: 'cine',
        ...common,
        film: filmOf(details.film),
        formatId: details.formatId,
        formatPrice: cents(details.formatPrice),
        seats: details.seats,
        subtotal: cents(row.subtotal_cents),
        serviceFee: cents(details.serviceFee),
        feeTotal: cents(row.fee_cents),
      }
    }
    case 'museo': {
      const details = row.details as MuseumDetails
      return {
        ...shared,
        category: 'museo',
        ...common,
        feeKind: details.feeKind,
        fee: cents(details.fee),
        entryNote: details.entryNote,
      }
    }
  }
}

/** The counter the next purchase will get. It does not consume it. */
export async function nextSequence(database: Queryable = getDatabase()): Promise<number> {
  const { rows } = await database.query<{ readonly next: number }>('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM purchases')
  return rows[0]?.next ?? 1
}

/** Inserts the purchase with its request key and its tickets in a single transaction. */
export async function insertPurchase(record: PurchaseRecord, database: Database = getDatabase()): Promise<void> {
  await database.withTransaction((tx) => insertPurchaseRows(tx, record))
}

/** A purchase's rows, inside the caller's transaction: `tx` is mandatory. */
export async function insertPurchaseRows(tx: Queryable, record: PurchaseRecord): Promise<void> {
  const { purchase } = record
  const { details, feeTotal } = ownColumns(purchase)
  const eventDay = requireIsoDate(formatIsoDate(purchase.date))
  const purchasedOn = requireIsoDate(formatIsoDate(purchase.purchasedOn))
  await tx.query(
    `INSERT INTO purchases (sequence, folio, user_id, venue_id, request_id, fingerprint, category, venue_name, city,
       restrictions, event_date, event_time, quantity, subtotal_cents, fee_cents, total_cents, currency,
       payment_method, payment_summary, details, purchased_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21)`,
    [
      record.sequence,
      purchase.folio,
      record.userId,
      purchase.venueId,
      record.requestId,
      record.fingerprint,
      purchase.category,
      purchase.venueName,
      purchase.city,
      purchase.restrictions,
      eventDay,
      clock(purchase.time),
      purchase.quantity,
      purchase.amount - feeTotal,
      feeTotal,
      purchase.amount,
      purchase.currency,
      purchase.payment.method,
      JSON.stringify(purchase.payment),
      JSON.stringify(details),
      purchasedOn,
    ],
  )
  for (const [index, id] of record.ticketIds.entries()) {
    await tx.query('INSERT INTO tickets (id, folio, ordinal) VALUES ($1, $2, $3)', [id, purchase.folio, index + 1])
  }
}

/**
 * A missing folio and another user's folio look the same: telling them apart
 * would reveal which folios were issued (RN-CON-06).
 */
export async function findPurchaseByFolio(userId: number, folio: string, database: Queryable = getDatabase()): Promise<Purchase | null> {
  const { rows } = await database.query<PurchaseRow>(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE user_id = $1 AND folio = $2`, [userId, folio])
  return rows[0] ? toPurchase(rows[0]) : null
}

/** Most recent first. */
export async function listPurchases(userId: number, database: Queryable = getDatabase()): Promise<Purchase[]> {
  const { rows } = await database.query<PurchaseRow>(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE user_id = $1 ORDER BY sequence DESC`, [userId])
  return rows.map(toPurchase)
}

/** The same `requestId` from another user is a different purchase (RN-CON-07). */
export async function findRequest(userId: number, requestId: string, database: Queryable = getDatabase()): Promise<StoredRequest | null> {
  const { rows } = await database.query<StoredRequest>('SELECT fingerprint, folio FROM purchases WHERE user_id = $1 AND request_id = $2', [userId, requestId])
  return rows[0] ? { fingerprint: rows[0].fingerprint, folio: rows[0].folio } : null
}

/** The ticket ids in order, or null alike for another user's purchase and a missing one. */
export async function findTicketsByFolio(userId: number, folio: string, database: Queryable = getDatabase()): Promise<string[] | null> {
  if (!(await findPurchaseByFolio(userId, folio, database))) return null
  const { rows } = await database.query<{ readonly id: string }>('SELECT id FROM tickets WHERE folio = $1 ORDER BY ordinal', [folio])
  return rows.map((row) => row.id)
}

export async function findTicket(id: string, database: Queryable = getDatabase()): Promise<IssuedTicket | null> {
  const { rows } = await database.query<{ readonly id: string, readonly folio: string, readonly user_id: number, readonly ordinal: number }>(
    'SELECT t.id, t.folio, p.user_id, t.ordinal FROM tickets t JOIN purchases p ON p.folio = t.folio WHERE t.id = $1',
    [id],
  )
  const row = rows[0]
  return row ? { id: row.id, folio: row.folio, userId: row.user_id, number: row.ordinal } : null
}

/**
 * A ticket's purchase, by ticket id, with its place in the purchase: what the gate
 * needs to admit and display it. No user: the gate is not the buyer, and the
 * response carries nothing personal and nothing about the payment.
 */
export async function findPurchaseByTicket(id: string, database: Queryable = getDatabase()): Promise<{ readonly purchase: Purchase, readonly number: number } | null> {
  const { rows } = await database.query<PurchaseRow & { readonly ordinal: number }>(
    `SELECT ${PURCHASE_COLUMNS}, t.ordinal FROM tickets t JOIN purchases p USING (folio) WHERE t.id = $1`,
    [id],
  )
  const row = rows[0]
  return row ? { purchase: toPurchase(row), number: row.ordinal } : null
}

export async function ticketExists(id: string, database: Queryable = getDatabase()): Promise<boolean> {
  const { rows } = await database.query('SELECT 1 AS found FROM tickets WHERE id = $1', [id])
  return rows.length > 0
}

/**
 * The tickets the user already bought at a venue for an event date, in ISO like
 * `event_date` (RN-CAN-07). Only recorded purchases count: a rejected one never
 * reached the table. The purchase reads it inside its transaction, under the venue
 * lock: two concurrent purchases cannot both pass.
 */
export async function purchasedQuantity(userId: number, venueId: string, eventDateIso: string, database: Queryable = getDatabase()): Promise<number> {
  const { rows } = await database.query<{ readonly purchased: number }>(
    'SELECT COALESCE(SUM(quantity), 0) AS purchased FROM purchases WHERE user_id = $1 AND venue_id = $2 AND event_date = $3',
    [userId, venueId, requireIsoDate(eventDateIso)],
  )
  return rows[0]?.purchased ?? 0
}

/** Tickets sold at a venue. A purchase reads it under the venue lock; elsewhere it waits for no one. */
export async function soldInVenue(venueId: string, database: Queryable = getDatabase()): Promise<number> {
  const { rows } = await database.query<{ readonly sold: number }>('SELECT COALESCE(SUM(quantity), 0) AS sold FROM purchases WHERE venue_id = $1', [venueId])
  return rows[0]?.sold ?? 0
}

/** Tickets sold per venue, for the availability of the whole catalog. */
export async function soldByVenue(database: Queryable = getDatabase()): Promise<Map<string, number>> {
  const { rows } = await database.query<{ readonly venue_id: string, readonly sold: number }>('SELECT venue_id, SUM(quantity) AS sold FROM purchases GROUP BY venue_id')
  return new Map(rows.map((row) => [row.venue_id, row.sold]))
}

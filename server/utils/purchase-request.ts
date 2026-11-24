import type { StoredRequest } from '../db/purchases.repository'
import type { TicketsInput } from '../domain/confirmation'
import { maskCardNumber, PAYMENT_METHODS, type PaymentInput } from '../domain/payment'
import { err, type Result } from '../domain/result'
import type { CategorySlug, PaymentMethod } from '../../types'
import { isPlainRecord, isUuid } from './shape'

/**
 * Narrows the `POST /api/purchases` body from `unknown` to the types the domain
 * receives, without ever throwing. It only checks the shape: an out-of-range
 * index, a format outside the list or a seat count different from the quantity
 * reach the domain, which rejects them with their own code. Every shape rejection
 * is `ERR_INPUT_INVALID` on its field.
 */
export type Shaped<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly field: string | null; readonly seatIndex: number | null; readonly result: Result }

type Fields = Readonly<Record<string, unknown>>

function malformed<T>(field: string | null, seatIndex: number | null = null): Shaped<T> {
  return { ok: false, field, seatIndex, result: err('ERR_INPUT_INVALID') }
}

interface ScheduleFields {
  readonly date: string
  readonly time: string
  readonly quantity: string
}

/** Date, time and quantity, shared by the three categories. */
function parseSchedule(value: Fields): Shaped<ScheduleFields> {
  const { date, time, quantity } = value
  if (typeof date !== 'string') return malformed('date')
  if (typeof time !== 'string') return malformed('time')
  if (typeof quantity !== 'string') return malformed('quantity')
  return { ok: true, value: { date, time, quantity } }
}

function parseSeats(value: unknown): Shaped<readonly string[]> {
  if (!Array.isArray(value)) return malformed('seats')
  const seats: string[] = []
  for (const [index, seat] of value.entries()) {
    if (typeof seat !== 'string') return malformed('seats', index)
    seats.push(seat)
  }
  return { ok: true, value: seats }
}

/**
 * Every field is required and only known fields are copied: an extra one is
 * ignored. Indexes accept any number; the domain rejects `1.5` or `99` with its
 * own code.
 */
export function parseTicketsInput(category: CategorySlug, value: unknown): Shaped<TicketsInput> {
  if (!isPlainRecord(value)) return malformed(null)

  switch (category) {
    case 'teatro': {
      const { playIndex, sectionIndex } = value
      if (typeof playIndex !== 'number') return malformed('play')
      if (typeof sectionIndex !== 'number') return malformed('section')
      const schedule = parseSchedule(value)
      if (!schedule.ok) return schedule
      return { ok: true, value: { category, input: { playIndex, sectionIndex, ...schedule.value } } }
    }
    case 'cine': {
      const { filmIndex, age, formatId } = value
      if (typeof filmIndex !== 'number') return malformed('film')
      if (typeof age !== 'string') return malformed('age')
      if (typeof formatId !== 'string') return malformed('format')
      const schedule = parseSchedule(value)
      if (!schedule.ok) return schedule
      const seats = parseSeats(value.seats)
      if (!seats.ok) return seats
      return { ok: true, value: { category, input: { filmIndex, age, formatId, ...schedule.value, seats: seats.value } } }
    }
    case 'museo': {
      const { isResident } = value
      if (typeof isResident !== 'boolean') return malformed('residency')
      const schedule = parseSchedule(value)
      if (!schedule.ok) return schedule
      return { ok: true, value: { category, input: { isResident, ...schedule.value } } }
    }
  }
}

const PAYMENT_TEXTS = ['cardNumber', 'holder', 'expiry', 'securityCode', 'email'] as const

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method === value)
}

/**
 * Payment with a saved method as it arrives in the body: only its id and the
 * security code, which is `''` for PayPal. The endpoint looks it up among the
 * user's methods before `confirmPurchase`.
 */
export interface SavedPaymentBody {
  readonly kind: 'saved'
  readonly savedMethodId: string
  readonly securityCode: string
}

/** The two payment shapes in the body: typed in, unchanged, or saved. */
export type PaymentBody = PaymentInput | SavedPaymentBody

export function isSavedPaymentBody(payment: PaymentBody): payment is SavedPaymentBody {
  return 'kind' in payment
}

/**
 * A missing text is taken as `''`: with PayPal the card fields are not sent, and
 * the domain rejects or ignores the empty value depending on the method. A body
 * with `savedMethodId` is the second shape, a saved method.
 */
export function parsePaymentInput(value: unknown): Shaped<PaymentBody> {
  if (!isPlainRecord(value)) return malformed(null)
  if ('savedMethodId' in value) return parseSavedPayment(value)
  if (!isPaymentMethod(value.method)) return malformed('method')

  const texts: Record<(typeof PAYMENT_TEXTS)[number], string> = {
    cardNumber: '',
    holder: '',
    expiry: '',
    securityCode: '',
    email: '',
  }
  for (const key of PAYMENT_TEXTS) {
    const text = value[key]
    if (text === undefined) continue
    if (typeof text !== 'string') return malformed(key)
    texts[key] = text
  }
  return { ok: true, value: { method: value.method, ...texts } }
}

function parseSavedPayment(value: Fields): Shaped<PaymentBody> {
  if (typeof value.savedMethodId !== 'string') return malformed('savedMethod')
  const securityCode = value.securityCode ?? ''
  if (typeof securityCode !== 'string') return malformed('securityCode')
  return { ok: true, value: { kind: 'saved', savedMethodId: value.savedMethodId, securityCode } }
}

// ── Confirmation idempotency (RN-CON-07) ──────────────────────────────────

/** Lowercase UUID v4, the shape `formatRequestId` builds on the client. */
export function isRequestId(value: unknown): value is string {
  return isUuid(value)
}

/**
 * The purchase a `requestId` identifies, as a deterministic string. It is built
 * from object literals in a fixed order rather than serializing the input as is:
 * the key order of the body must not change the fingerprint.
 *
 * The number goes in masked and the security code does not go in: the fingerprint
 * is kept in memory and never contains what RN-CON-05 forbids storing. A body that
 * differs only in that data is the same retry. With a saved method, only its id
 * goes in from the payment.
 */
export function purchaseFingerprint(venueId: string, tickets: TicketsInput, payment: PaymentBody): string {
  if (isSavedPaymentBody(payment)) {
    return JSON.stringify({ venueId, tickets: ticketsFingerprint(tickets), payment: { savedMethodId: payment.savedMethodId } })
  }
  return JSON.stringify({
    venueId,
    tickets: ticketsFingerprint(tickets),
    payment: {
      method: payment.method,
      maskedNumber: maskCardNumber(payment.cardNumber),
      holder: payment.holder,
      expiry: payment.expiry,
      email: payment.email,
    },
  })
}

function ticketsFingerprint(tickets: TicketsInput): Readonly<Record<string, unknown>> {
  switch (tickets.category) {
    case 'teatro': {
      const { playIndex, sectionIndex, date, time, quantity } = tickets.input
      return { category: tickets.category, playIndex, sectionIndex, date, time, quantity }
    }
    case 'cine': {
      const { filmIndex, age, formatId, date, time, quantity, seats } = tickets.input
      return { category: tickets.category, filmIndex, age, formatId, date, time, quantity, seats: [...seats] }
    }
    case 'museo': {
      const { isResident, date, time, quantity } = tickets.input
      return { category: tickets.category, isResident, date, time, quantity }
    }
  }
}

export type RequestReplay =
  | { readonly kind: 'new' }
  | { readonly kind: 'replay'; readonly folio: string }
  | { readonly kind: 'conflict' }

/**
 * Without a record it is a new purchase; with the same fingerprint, the retry of
 * an already recorded purchase; with another fingerprint, the same identifier for
 * another purchase, which is rejected.
 */
export function requestReplay(stored: StoredRequest | null, fingerprint: string): RequestReplay {
  if (stored === null) return { kind: 'new' }
  return stored.fingerprint === fingerprint ? { kind: 'replay', folio: stored.folio } : { kind: 'conflict' }
}

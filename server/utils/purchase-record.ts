import { findPaymentMethod } from '../db/payment-methods.repository'
import { lockFolio, lockVenue } from '../db/locks'
import { freeSeats } from '../data/availability'
import { CATEGORIES } from '../data/catalog'
import { getDatabase, type Database, type Queryable } from '../db/client'
import {
  findRequest,
  insertPurchaseRows,
  nextSequence,
  purchasedQuantity,
  soldInVenue,
  ticketExists,
} from '../db/purchases.repository'
import { remainingUserLimit } from '../domain/booking'
import { confirmPurchase, type TicketsInput } from '../domain/confirmation'
import { parseDate } from '../domain/input'
import type { Result } from '../domain/result'
import type { PaymentRequest } from '../domain/saved-payment'
import { TICKET_ID_BYTES, encodeBase32, issueTickets } from '../domain/ticket'
import type { CalendarDate, Purchase, PurchaseStep, Venue } from '../../types'
import { formatIsoDate } from '../../utils/date'
import { randomBytes } from 'node:crypto'
import { isSavedPaymentBody, requestReplay, type PaymentBody } from './purchase-request'
import { isUuid } from './shape'

export interface PurchaseAttempt {
  readonly userId: number
  readonly venue: Venue
  readonly requestId: string
  readonly fingerprint: string
  readonly tickets: TicketsInput
  readonly payment: PaymentBody
  /** The server clock, the authoritative one (RN-CON-01). */
  readonly today: CalendarDate
}

export type PurchaseOutcome =
  | { readonly kind: 'confirmed', readonly purchase: Purchase }
  | { readonly kind: 'replay', readonly folio: string }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'rejected', readonly step: PurchaseStep, readonly field: string | null, readonly seatIndex: number | null, readonly result: Result }
  | { readonly kind: 'ticketsNotIssued' }
  | { readonly kind: 'notRecorded', readonly error: unknown }

/**
 * What decides and writes a purchase, inside its transaction and under its locks.
 * Everything reads through `tx`: a read through the process connection would not
 * see what this transaction writes, nor be part of it. With `READ COMMITTED`, every
 * read after the lock sees what the previous purchase committed, which is why no
 * `await` breaks atomicity (RN-CON-03, RN-CON-07, RN-CAN-07).
 *
 * A rejection writes nothing: the transaction ends with COMMIT and releases the locks.
 */
async function decidePurchase(tx: Queryable, attempt: PurchaseAttempt): Promise<PurchaseOutcome> {
  const { userId, venue, requestId, fingerprint, tickets, payment, today } = attempt
  await lockVenue(tx, venue.id)

  const replay = requestReplay(await findRequest(userId, requestId, tx), fingerprint)
  // No revalidation: a legitimate retry of a recorded purchase would fail with
  // ERR_EXCEEDS_AVAILABILITY or ERR_DATE_PAST.
  if (replay.kind === 'replay') return { kind: 'replay', folio: replay.folio }
  if (replay.kind === 'conflict') return { kind: 'conflict' }

  // The category limit accumulates per user, venue and event date (RN-CAN-07): what
  // was already bought is subtracted, leaving the composite's `userLimit`, which
  // reports the excess as ERR_EXCEEDS_USER_LIMIT on `quantity`. It comes after the
  // retry check, which answers with its folio even if an identical purchase no
  // longer fits. A mistyped date adds nothing; the composite rejects it on `date`.
  const categoryLimit = CATEGORIES.find((category) => category.slug === venue.category)?.maxTickets ?? 0
  const eventDate = parseDate(tickets.input.date)
  const alreadyPurchased = eventDate.ok ? await purchasedQuantity(userId, venue.id, formatIsoDate(eventDate.value), tx) : 0
  const remaining = remainingUserLimit(categoryLimit, alreadyPurchased)
  // Unreachable: the limit and the sum are non-negative integers. Fails closed.
  const userLimit = remaining.ok ? remaining.value : 0
  const available = freeSeats(venue, await soldInVenue(venue.id, tx))

  // A saved method is only looked up among the user's: a foreign or missing one is
  // null, and the domain rejects it after the tickets, in the order of RN-CON-02.
  // Looking it up and rejecting it here would invert that order (CF16).
  const paymentRequest: PaymentRequest = isSavedPaymentBody(payment)
    ? {
        kind: 'saved',
        saved: isUuid(payment.savedMethodId) ? await findPaymentMethod(userId, payment.savedMethodId, tx) : null,
        securityCode: payment.securityCode,
      }
    : payment

  await lockFolio(tx)
  const sequence = await nextSequence(tx)

  const confirmation = confirmPurchase(venue, tickets, paymentRequest, { userLimit, available, today, sequence })
  if (!confirmation.ok) {
    return { kind: 'rejected', step: confirmation.step, field: confirmation.field, seatIndex: confirmation.seatIndex, result: confirmation.result }
  }

  // Randomness belongs to the endpoint, not the domain. With 80 bits a collision is
  // negligible, but it must not pass silently: one QR would designate two tickets.
  // This answers before anything is recorded.
  const { quantity } = confirmation.purchase
  const issued = issueTickets(quantity, Array.from({ length: quantity }, () => new Uint8Array(randomBytes(TICKET_ID_BYTES))))
  if (!issued.ok) return { kind: 'ticketsNotIssued' }
  const ticketIds = issued.value.map(encodeBase32)
  for (const id of ticketIds) {
    if (await ticketExists(id, tx)) return { kind: 'ticketsNotIssued' }
  }

  await insertPurchaseRows(tx, { userId, sequence, requestId, fingerprint, purchase: confirmation.purchase, ticketIds })
  return { kind: 'confirmed', purchase: confirmation.purchase }
}

const REQUEST_KEY = 'purchases_user_id_request_id_key'

function isRequestCollision(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error && error.code === '23505'
    && 'constraint' in error && error.constraint === REQUEST_KEY
}

/**
 * Confirms a purchase in a transaction, and never throws. After an error the
 * transaction is aborted, so everything is caught outside `withTransaction`:
 *
 * - Two purchases with the same `requestId` at different venues are not
 *   serialized with each other: the second collides with the `UNIQUE` (23505). A
 *   fresh read, outside the aborted transaction, sees the first one and decides
 *   between a retry and a conflict.
 * - Any other failure (another 23505, `lock_timeout` (55P03), a deadlock (40P01), a
 *   failed COMMIT) is rolled back entirely: no purchase, no tickets, no consumed
 *   folio, and the key was not stored (PU10).
 */
export async function settlePurchase(attempt: PurchaseAttempt, database: Database = getDatabase()): Promise<PurchaseOutcome> {
  try {
    return await database.withTransaction((tx) => decidePurchase(tx, attempt))
  }
  catch (error) {
    if (!isRequestCollision(error)) return { kind: 'notRecorded', error }
    try {
      const replay = requestReplay(await findRequest(attempt.userId, attempt.requestId, database), attempt.fingerprint)
      return replay.kind === 'new' ? { kind: 'notRecorded', error } : replay
    }
    catch (secondError) {
      return { kind: 'notRecorded', error: secondError }
    }
  }
}

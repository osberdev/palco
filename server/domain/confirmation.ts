import type { CalendarDate, Purchase, PurchaseStep, Venue } from '../../types'
import {
  evaluateCinemaSelection,
  evaluateMuseumSelection,
  evaluateTheaterSelection,
  type CinemaSelectionInput,
  type MuseumSelectionInput,
  type TheaterSelectionInput,
} from './purchase'
import { accept, err, reject, type Checked, type Result } from './result'
import { evaluatePaymentRequest, type PaymentRequest } from './saved-payment'

/** Closing a purchase: complete tickets, payment, amount and summary. */

export const FOLIO_PREFIX = 'PLC'

/**
 * `PLC-0001-2026`: the run's counter in uppercase hexadecimal with at least 4
 * digits, plus the purchase year (RN-CON-04). It never runs out: past `FFFF` the
 * number grows to 5 digits, because the venues' combined capacity exceeds the
 * 65,535 values of 4 digits.
 */
export function formatFolio(sequence: number, year: number): Checked<string> {
  if (!Number.isInteger(sequence) || sequence < 1) return reject(err('ERR_INPUT_INVALID'))
  if (!Number.isInteger(year) || year < 1 || year > 9999) return reject(err('ERR_INPUT_INVALID'))

  const hex = sequence.toString(16).toUpperCase().padStart(4, '0')
  return accept(`${FOLIO_PREFIX}-${hex}-${String(year).padStart(4, '0')}`)
}

/** Validates the route parameter before looking up the purchase. */
export function isFolio(text: string): boolean {
  return /^PLC-[0-9A-F]{4,}-[0-9]{4}$/.test(text)
}

// ── Purchase composite ────────────────────────────────────────────────────

export type TicketsInput =
  | { readonly category: 'teatro'; readonly input: TheaterSelectionInput }
  | { readonly category: 'cine'; readonly input: CinemaSelectionInput }
  | { readonly category: 'museo'; readonly input: MuseumSelectionInput }

export interface ConfirmationContext {
  readonly userLimit: number
  readonly available: number
  /** From the server clock, which is authoritative (RN-CON-01). */
  readonly today: CalendarDate
  /** The database's `nextSequence()`: the highest stored value plus one. */
  readonly sequence: number
}

export type Confirmation =
  | { readonly ok: true; readonly purchase: Purchase }
  | {
      readonly ok: false
      readonly step: PurchaseStep
      readonly field: string | null
      readonly seatIndex: number | null
      readonly result: Result
    }

function rejectStep(step: PurchaseStep, result: Result, field: string | null = null, seatIndex: number | null = null): Confirmation {
  return { ok: false, step, field, seatIndex, result }
}

/** What each category's quote provides; `confirmPurchase` adds the shared fields. */
type SharedField = 'folio' | 'venueId' | 'venueName' | 'city' | 'currency' | 'payment' | 'restrictions' | 'purchasedOn'
type PurchaseDetails = Purchase extends infer P ? (P extends Purchase ? Omit<P, SharedField> : never) : never

type TicketsResult =
  | { readonly ok: true; readonly details: PurchaseDetails }
  | { readonly ok: false; readonly field: string | null; readonly seatIndex: number | null; readonly result: Result }

/**
 * Each category has its own composite, so this dispatches on `category`, like
 * `referencePrice`. The ban on inspecting `category` applies to the opening rules
 * and still holds.
 */
function evaluateTickets(venue: Venue, tickets: TicketsInput, context: ConfirmationContext): TicketsResult {
  const { userLimit, available, today } = context

  if (venue.category === 'teatro' && tickets.category === 'teatro') {
    const selection = evaluateTheaterSelection(venue, tickets.input, userLimit, available, today)
    if (!selection.ok) return { ok: false, field: selection.field, seatIndex: null, result: selection.result }
    const { quote } = selection
    return {
      ok: true,
      details: {
        category: 'teatro',
        date: quote.date,
        time: quote.time,
        quantity: quote.quantity,
        amount: quote.amount,
        play: quote.play,
        section: quote.section,
        dressCode: venue.dressCode,
      },
    }
  }

  if (venue.category === 'cine' && tickets.category === 'cine') {
    const selection = evaluateCinemaSelection(venue, tickets.input, userLimit, available, today)
    if (!selection.ok) return { ok: false, field: selection.field, seatIndex: selection.seatIndex, result: selection.result }
    const { quote } = selection
    return {
      ok: true,
      details: {
        category: 'cine',
        date: quote.date,
        time: quote.time,
        quantity: quote.quantity,
        amount: quote.amount,
        film: quote.film,
        formatId: quote.format.id,
        formatPrice: quote.format.price,
        seats: quote.seats,
        subtotal: quote.subtotal,
        serviceFee: quote.serviceFee,
        feeTotal: quote.feeTotal,
      },
    }
  }

  if (venue.category === 'museo' && tickets.category === 'museo') {
    const selection = evaluateMuseumSelection(venue, tickets.input, userLimit, available, today)
    if (!selection.ok) return { ok: false, field: selection.field, seatIndex: null, result: selection.result }
    const { quote } = selection
    return {
      ok: true,
      details: {
        category: 'museo',
        date: quote.date,
        time: quote.time,
        quantity: quote.quantity,
        amount: quote.amount,
        feeKind: quote.feeKind,
        fee: quote.fee,
        entryNote: venue.entryNote,
      },
    }
  }

  // A category that does not match the venue's: only a tampered request body.
  return { ok: false, field: null, seatIndex: null, result: err('ERR_INPUT_INVALID') }
}

/**
 * The complete purchase, in order (RN-CON-02): the tickets with their category's
 * composite and, only if they are valid, the payment. It is pure and records
 * nothing: the endpoint records only if it returns `ok`.
 */
export function confirmPurchase(
  venue: Venue,
  tickets: TicketsInput,
  payment: PaymentRequest,
  context: ConfirmationContext,
): Confirmation {
  const evaluated = evaluateTickets(venue, tickets, context)
  if (!evaluated.ok) return rejectStep('tickets', evaluated.result, evaluated.field, evaluated.seatIndex)

  const paid = evaluatePaymentRequest(payment, context.today)
  if (!paid.ok) return rejectStep('payment', paid.result, paid.field)

  // Only with a malformed context: the sequence comes from the store.
  const folio = formatFolio(context.sequence, context.today.year)
  if (!folio.ok) return rejectStep('tickets', folio.result)

  const shared: Pick<Purchase, SharedField> = {
    folio: folio.value,
    venueId: venue.id,
    venueName: venue.name,
    city: venue.city,
    currency: venue.currency,
    payment: paid.payment,
    restrictions: venue.restrictions,
    purchasedOn: context.today,
  }
  return { ok: true, purchase: { ...shared, ...evaluated.details } }
}

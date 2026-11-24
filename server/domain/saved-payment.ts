import type {
  CalendarDate,
  PaymentMethod,
  SavedMethodField,
  SavedPaymentMethod,
  SavedPaymentMethodData,
} from '../../types'
import {
  evaluateCardNumber,
  evaluateEmail,
  evaluateExpiry,
  evaluateHolderName,
  evaluatePayment,
  evaluateSecurityCode,
  PAYMENT_METHODS,
  type PaymentField,
  type PaymentInput,
  type PaymentSelection,
} from './payment'
import { err, type Result } from './result'

/**
 * Saved payment methods (RN-MET-01 to 08). Each field's rules are the payment
 * rules: this module only decides what is stored, the limit, duplicates and how
 * to pay with a saved method.
 */

/** RN-MET-01. */
export const SAVED_METHODS_LIMIT = 3

/** RN-MET-10: additions per user and calendar day, even if some are removed. */
export const SAVED_METHOD_DAILY_ADDITIONS = 5

/**
 * The masked number of a saved card. It is the same mask `maskCardNumber` gives a
 * 16-digit number, so a purchase summary does not reveal whether the card was
 * typed or chosen from the saved ones (INV18).
 */
export function savedMaskedNumber(last4: string): string {
  return `${'*'.repeat(12)}${last4}`
}

/** RN-MET-08: it expires under the payment rule (RN-PAG-07). PayPal never expires. */
export function isSavedMethodExpired(method: SavedPaymentMethodData, today: CalendarDate): boolean {
  if (method.method === 'paypal') return false
  return evaluateExpiry(method.expiry, today).code === 'ERR_CARD_EXPIRED'
}

/** Addition: without a security code, which is never stored (RN-MET-04). */
export interface NewSavedMethodInput {
  readonly method: PaymentMethod
  readonly cardNumber: string
  readonly holder: string
  readonly expiry: string
  readonly email: string
}

/** Edit (RN-MET-05): the method, the brand and the number are not editable. */
export type SavedMethodChanges =
  | { readonly holder: string; readonly expiry: string }
  | { readonly email: string }

export type NewSavedMethod =
  | { readonly ok: true; readonly method: SavedPaymentMethodData }
  | { readonly ok: false; readonly field: SavedMethodField | null; readonly result: Result }

const rejectSaved = (field: SavedMethodField | null, result: Result): NewSavedMethod => ({ ok: false, field, result })

/**
 * RN-MET-06: the same card or the same email. The card type does not count: a
 * physical card is either debit or credit, and both are validated the same way.
 * The email is compared as is, because the system does not transform it. With
 * only four digits, two different cards can match.
 */
function sameData(a: SavedPaymentMethodData, b: SavedPaymentMethodData): boolean {
  if (a.method === 'paypal' || b.method === 'paypal') {
    return a.method === 'paypal' && b.method === 'paypal' && a.email === b.email
  }
  return a.brand === b.brand
    && a.last4 === b.last4
    && a.holder === b.holder
    && a.expiry === b.expiry
}

/**
 * Addition. Fixed order, the first rejection wins: the day's addition count;
 * method; the method's fields with the payment rules; the daily limit
 * (RN-MET-10); the maximum of 3; duplicates. Both limits come after the fields:
 * the UI does not anticipate them (with three methods it disables "Agregar", and
 * the maximum is only reached from another tab), and a form with an invalid field
 * is fixed first. The daily limit comes before the maximum of 3: with 5
 * additions today, "Elimina uno para agregar otro" would ask for something that
 * would not help until tomorrow.
 *
 * @param additionsToday The user's additions on the day of `today`, provided by
 * the repository. A count that is not an integer ≥ 0 is a defensive guard, like
 * the one in `evaluateQuantity`.
 */
export function evaluateNewSavedMethod(
  input: NewSavedMethodInput,
  existing: readonly SavedPaymentMethodData[],
  additionsToday: number,
  today: CalendarDate,
): NewSavedMethod {
  if (!Number.isSafeInteger(additionsToday) || additionsToday < 0) return rejectSaved(null, err('ERR_INPUT_INVALID'))
  if (!PAYMENT_METHODS.includes(input.method)) return rejectSaved('method', err('ERR_INPUT_INVALID'))

  let data: SavedPaymentMethodData
  if (input.method === 'paypal') {
    const email = evaluateEmail(input.email)
    if (!email.ok) return rejectSaved('email', email)
    data = { method: 'paypal', email: input.email }
  }
  else {
    const card = evaluateCardNumber(input.cardNumber)
    if (!card.ok) return rejectSaved('cardNumber', card.result)
    const holder = evaluateHolderName(input.holder)
    if (!holder.ok) return rejectSaved('holder', holder)
    // An expired card is not saved.
    const expiry = evaluateExpiry(input.expiry, today)
    if (!expiry.ok) return rejectSaved('expiry', expiry)
    data = {
      method: input.method,
      brand: card.value,
      last4: input.cardNumber.slice(-4),
      holder: input.holder,
      expiry: input.expiry,
    }
  }

  if (additionsToday >= SAVED_METHOD_DAILY_ADDITIONS) return rejectSaved(null, err('ERR_SAVED_METHOD_DAILY_LIMIT'))
  if (existing.length >= SAVED_METHODS_LIMIT) return rejectSaved(null, err('ERR_SAVED_METHODS_LIMIT'))
  if (existing.some((saved) => sameData(saved, data))) return rejectSaved(null, err('ERR_SAVED_METHOD_DUPLICATE'))
  return { ok: true, method: data }
}

/**
 * Edit (RN-MET-05). Fixed order: the edited fields with their payment rule; the
 * duplicate check against the other methods, excluding the one being edited.
 * Editing can create a duplicate: a holder that matches another card is rejected.
 */
export function evaluateSavedMethodEdit(
  current: SavedPaymentMethodData,
  changes: SavedMethodChanges,
  others: readonly SavedPaymentMethodData[],
  today: CalendarDate,
): NewSavedMethod {
  let data: SavedPaymentMethodData
  if (current.method === 'paypal') {
    if (!('email' in changes)) return rejectSaved(null, err('ERR_INPUT_INVALID'))
    const email = evaluateEmail(changes.email)
    if (!email.ok) return rejectSaved('email', email)
    data = { method: 'paypal', email: changes.email }
  }
  else {
    if (!('holder' in changes)) return rejectSaved(null, err('ERR_INPUT_INVALID'))
    const holder = evaluateHolderName(changes.holder)
    if (!holder.ok) return rejectSaved('holder', holder)
    const expiry = evaluateExpiry(changes.expiry, today)
    if (!expiry.ok) return rejectSaved('expiry', expiry)
    data = { method: current.method, brand: current.brand, last4: current.last4, holder: changes.holder, expiry: changes.expiry }
  }

  if (others.some((saved) => sameData(saved, data))) return rejectSaved(null, err('ERR_SAVED_METHOD_DUPLICATE'))
  return { ok: true, method: data }
}

const rejectPayment = (field: PaymentField, result: Result): PaymentSelection => ({ ok: false, field, result })

/**
 * Paying with a saved method (RN-MET-07). The first rejection wins: the method no
 * longer exists; with PayPal, the email; with a card, the holder, the expiry
 * against today and the security code, which is asked for on every purchase.
 * Email and holder are defensive: the server is authoritative (RN-CON-01) and a
 * record may have been saved under another rule.
 */
export function evaluateSavedPayment(
  saved: SavedPaymentMethodData | null,
  securityCode: string,
  today: CalendarDate,
): PaymentSelection {
  if (saved === null) return rejectPayment('savedMethod', err('ERR_SAVED_METHOD_UNAVAILABLE'))

  if (saved.method === 'paypal') {
    const email = evaluateEmail(saved.email)
    if (!email.ok) return rejectPayment('savedMethod', email)
    return { ok: true, payment: { method: 'paypal', email: saved.email } }
  }

  const holder = evaluateHolderName(saved.holder)
  if (!holder.ok) return rejectPayment('savedMethod', holder)
  const expiry = evaluateExpiry(saved.expiry, today)
  if (!expiry.ok) return rejectPayment('savedMethod', expiry)
  const code = evaluateSecurityCode(securityCode)
  if (!code.ok) return rejectPayment('securityCode', code)

  return {
    ok: true,
    payment: { method: saved.method, brand: saved.brand, maskedNumber: savedMaskedNumber(saved.last4), holder: saved.holder },
  }
}

/** Payment with a saved method, already looked up among the user's: `null` if missing or someone else's. */
export interface SavedPaymentRequest {
  readonly kind: 'saved'
  readonly saved: SavedPaymentMethod | null
  readonly securityCode: string
}

/** The two payment shapes: typed in, which is the plain `PaymentInput`, or saved. */
export type PaymentRequest = PaymentInput | SavedPaymentRequest

export function isSavedPaymentRequest(request: PaymentRequest): request is SavedPaymentRequest {
  return 'kind' in request
}

/** Dispatches between the two payment shapes. */
export function evaluatePaymentRequest(request: PaymentRequest, today: CalendarDate): PaymentSelection {
  return isSavedPaymentRequest(request)
    ? evaluateSavedPayment(request.saved, request.securityCode, today)
    : evaluatePayment(request, today)
}

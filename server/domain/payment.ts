import type { CalendarDate, CardBrand, PaymentMethod } from '../../types'
import { isValidDate } from './calendar'
import { accept, err, ok, reject, type Checked, type Result } from './result'

/** Payment validation. No field is trimmed: a space at either end is a rejection. */

/** The payment method order: 1 debit, 2 credit, 3 PayPal. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = Object.freeze(['debit', 'credit', 'paypal'] as const)

/** The same for Visa and Mastercard (RN-PAG-03). */
export const CARD_LENGTH = 16
export const SECURITY_CODE_LENGTH = 3

/** At least one character, all of them ASCII digits. */
export function isDigitString(text: string): boolean {
  return /^[0-9]+$/.test(text)
}

// Letters in the Unicode sense (RNF-20), so a name like "Ana Sofía Ríos Vela" is
// accepted. `\p{M}` admits accents in decomposed form; the typographic apostrophe
// is what the macOS and iOS autocorrect produces. The space is U+0020 only.
const HOLDER_CHARACTERS = /^[\p{L}\p{M} '’-]+$/u
const HOLDER_LETTER = /\p{L}/u

export function isHolderName(text: string): boolean {
  return HOLDER_CHARACTERS.test(text) && HOLDER_LETTER.test(text)
}

/**
 * Luhn: from right to left, digits in even positions (counting from 1 at the
 * right end) are doubled, and 9 is subtracted from those greater than 9.
 */
export function luhnValid(number: string): boolean {
  if (!isDigitString(number) || number.length < 2) return false

  let sum = 0
  for (let position = 1; position <= number.length; position++) {
    let digit = Number(number[number.length - position])
    if (position % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/**
 * IIN prefix (RN-PAG-02). Each range is recognized as soon as it has the digits it
 * needs: Visa from the first, Mastercard 51–55 from the second and 2221–2720 from
 * the fourth. The legacy console implementation required four digits; with four or
 * more the result is the same.
 */
export function identifyBrand(number: string): CardBrand | null {
  if (!isDigitString(number)) return null
  if (number.startsWith('4')) return 'visa'

  if (number.length >= 2) {
    const two = Number(number.slice(0, 2))
    if (two >= 51 && two <= 55) return 'mastercard'
  }
  if (number.length >= 4) {
    const four = Number(number.slice(0, 4))
    if (four >= 2221 && four <= 2720) return 'mastercard'
  }
  return null
}

/**
 * Structure, brand, length and Luhn (RN-PAG-06). With fewer than four digits the
 * rejection is about length, not brand, because the prefix may still be incomplete.
 */
export function evaluateCardNumber(text: string): Checked<CardBrand> {
  if (!isDigitString(text)) return reject(err('ERR_CARD_NOT_NUMERIC'))
  if (text.length < 4) return reject(err('ERR_CARD_LENGTH'))

  const brand = identifyBrand(text)
  if (brand === null) return reject(err('ERR_CARD_BRAND_REJECTED'))
  if (text.length !== CARD_LENGTH) return reject(err('ERR_CARD_LENGTH'))
  if (!luhnValid(text)) return reject(err('ERR_CARD_LUHN'))
  return accept(brand)
}

/** Only spaces is not empty: it has no letter. */
export function evaluateHolderName(text: string): Result {
  if (text === '') return err('ERR_HOLDER_EMPTY')
  if (!isHolderName(text)) return err('ERR_HOLDER_NOT_ALPHABETIC')
  return ok()
}

/**
 * MM/YY, year 2000 + YY with no upper bound, valid for its whole month
 * (RN-PAG-07). The format is checked before `today`, with the same criterion as
 * `evaluateEventDate`.
 */
export function evaluateExpiry(text: string, today: CalendarDate): Result {
  if (!/^[0-9]{2}\/[0-9]{2}$/.test(text)) return err('ERR_EXPIRY_FORMAT')
  const month = Number(text.slice(0, 2))
  if (month < 1 || month > 12) return err('ERR_EXPIRY_FORMAT')
  if (!isValidDate(today)) return err('ERR_DATE_INVALID')

  const year = 2000 + Number(text.slice(3))
  if (year < today.year || (year === today.year && month < today.month)) return err('ERR_CARD_EXPIRED')
  return ok()
}

/** RN-PAG-08. */
export function evaluateSecurityCode(text: string): Result {
  if (!isDigitString(text) || text.length !== SECURITY_CODE_LENGTH) return err('ERR_SECURITY_CODE_INVALID')
  return ok()
}

// A practical subset of RFC 5322 (dot-atom) with the limits of RFC 5321, ASCII
// only (RN-PAG-11). It is stricter than the legacy console implementation's check:
// everything it accepts, the legacy one also accepted (EM40).
export const EMAIL_MAX_LENGTH = 254
const LOCAL_MAX_LENGTH = 64
const LABEL_MAX_LENGTH = 63
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const TOP_LEVEL_DOMAIN = /^[A-Za-z]{2,63}$/

/**
 * One code per rule of RN-PAG-11. What is accepted does not change (INV26); only
 * the rejection reason does. No trimming.
 * Fixed order, the first one that applies wins: empty; space, before ASCII
 * because a non-breaking space is both and "no spaces allowed" is what gets
 * fixed; non-ASCII; length, after the characters because those are the most
 * common mistake; a single `@`; the local part and then the domain, as the
 * address is read; and the domain labels before their ending, so that
 * `ana@example.` reports the trailing dot.
 *
 * The 63-character label limit is not applied here to the last label: the ending
 * rule measures it, from 2 to 63 letters (EM48).
 */
export function evaluateEmail(text: string): Result {
  if (text === '') return err('ERR_EMAIL_EMPTY')
  if (/\s/u.test(text)) return err('ERR_EMAIL_HAS_SPACE')
  if (/[\u0080-\u{10FFFF}]/u.test(text)) return err('ERR_EMAIL_NOT_ASCII')
  if (text.length > EMAIL_MAX_LENGTH) return err('ERR_EMAIL_TOO_LONG')

  const parts = text.split('@')
  if (parts.length !== 2) return err('ERR_EMAIL_AT_SIGN')
  const [local, domain] = parts as [string, string]

  if (local.length > LOCAL_MAX_LENGTH || !LOCAL_PART.test(local)) return err('ERR_EMAIL_LOCAL_PART')

  const labels = domain.split('.')
  const topLevel = labels.at(-1)!
  if (
    labels.some((label) => !DOMAIN_LABEL.test(label))
    || labels.slice(0, -1).some((label) => label.length > LABEL_MAX_LENGTH)
  ) {
    return err('ERR_EMAIL_DOMAIN')
  }
  if (labels.length < 2 || !TOP_LEVEL_DOMAIN.test(topLevel)) return err('ERR_EMAIL_TLD')
  return ok()
}

/** Everything except the last four, keeping the length. */
export function maskCardNumber(number: string): string {
  const visible = Math.max(number.length - 4, 0)
  return '*'.repeat(visible) + number.slice(visible)
}

// ── Payment composite ─────────────────────────────────────────────────────

/** `savedMethod` is the saved method the payment chose. */
export type PaymentField = 'method' | 'cardNumber' | 'holder' | 'expiry' | 'securityCode' | 'email' | 'savedMethod'

export interface PaymentInput {
  readonly method: PaymentMethod
  readonly cardNumber: string
  readonly holder: string
  readonly expiry: string
  readonly securityCode: string
  readonly email: string
}

/** Never carries the full number (RNF-15): only the masked one. */
export type PaymentSummary =
  | { readonly method: 'paypal'; readonly email: string }
  | {
      readonly method: 'debit' | 'credit'
      readonly brand: CardBrand
      readonly maskedNumber: string
      readonly holder: string
    }

export type PaymentSelection =
  | { readonly ok: true; readonly payment: PaymentSummary }
  | { readonly ok: false; readonly field: PaymentField; readonly result: Result }

function rejectPayment(field: PaymentField, result: Result): PaymentSelection {
  return { ok: false, field, result }
}

/**
 * Payment validation in capture order (RN-PAG-10): method; with PayPal, the email;
 * with a card, number, holder, expiry and code. Debit and credit are validated the
 * same way. The purchase endpoint runs this same contract again on the server.
 */
export function evaluatePayment(input: PaymentInput, today: CalendarDate): PaymentSelection {
  // The UI chooses among three radio buttons: only a tampered request body gets here.
  if (!PAYMENT_METHODS.includes(input.method)) return rejectPayment('method', err('ERR_INPUT_INVALID'))

  if (input.method === 'paypal') {
    const email = evaluateEmail(input.email)
    if (!email.ok) return rejectPayment('email', email)
    return { ok: true, payment: { method: 'paypal', email: input.email } }
  }

  const card = evaluateCardNumber(input.cardNumber)
  if (!card.ok) return rejectPayment('cardNumber', card.result)

  const holder = evaluateHolderName(input.holder)
  if (!holder.ok) return rejectPayment('holder', holder)

  const expiry = evaluateExpiry(input.expiry, today)
  if (!expiry.ok) return rejectPayment('expiry', expiry)

  const securityCode = evaluateSecurityCode(input.securityCode)
  if (!securityCode.ok) return rejectPayment('securityCode', securityCode)

  return {
    ok: true,
    payment: {
      method: input.method,
      brand: card.value,
      maskedNumber: maskCardNumber(input.cardNumber),
      holder: input.holder,
    },
  }
}

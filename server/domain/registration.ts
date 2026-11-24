import type { CalendarDate, RegistrationField } from '../../types'
import { compareDates, isValidDate } from './calendar'
import { validatePassword } from './credentials'
import { validateUsername } from './curp'
import { evaluateEmail, isHolderName } from './payment'
import { ageOn, birthDateFromCurp } from './profile'
import { err, ok, type Result } from './result'

/**
 * Registration (RN-PER-09, RN-REG-01 to 04). CURP uniqueness (RN-REG-02) does not
 * live here: it needs the database and the endpoint decides it.
 */

/** RN-PER-09, the limit inclusive. */
export const NAME_MAX_LENGTH = 60

/** RN-REG-04. */
export const REGISTRATION_MIN_AGE = 18

/**
 * Length in code points, not UTF-16 units or graphemes: a decomposed accent counts
 * as two, and counting graphemes would depend on the ICU version of the browser
 * and the server. It is the same measure as PostgreSQL's `length()` on text, which
 * the `users` `CHECK` uses.
 */
export function nameLength(text: string): number {
  return [...text].length
}

/**
 * RN-PER-09. Fixed order: empty, length, characters. Not trimmed, like the payment
 * fields: only spaces is not empty, it is invalid characters, like the card holder
 * (HO12). It reuses the holder's predicate, not its function: `ERR_HOLDER_EMPTY`
 * would name the card holder.
 */
export function evaluateDisplayName(text: string): Result {
  if (text === '') return err('ERR_NAME_EMPTY')
  if (nameLength(text) > NAME_MAX_LENGTH) return err('ERR_NAME_TOO_LONG')
  if (!isHolderName(text)) return err('ERR_NAME_INVALID_CHARS')
  return ok()
}

/**
 * The registration CURP: the sign-in format (RN-CRE-01 to 06) and the minimum age
 * (RN-REG-04), which comes from the CURP itself (RF-PER-03). A birth after today
 * is also under age: someone not yet born is not 18, and `ageOn` would reject it
 * with `ERR_INPUT_INVALID`, which does not identify the rule (RNF-13).
 */
export function evaluateRegistrationCurp(text: string, today: CalendarDate): Result {
  const format = validateUsername(text)
  if (!format.ok) return format

  const birth = birthDateFromCurp(text)
  if (!birth.ok) return birth.result
  if (!isValidDate(today)) return err('ERR_DATE_INVALID')
  if (compareDates(birth.value, today) > 0) return err('ERR_REGISTRATION_UNDERAGE')

  const age = ageOn(birth.value, today)
  if (!age.ok) return age.result
  return age.value < REGISTRATION_MIN_AGE ? err('ERR_REGISTRATION_UNDERAGE') : ok()
}

/**
 * The optional registration email (RN-REG-06). Empty is valid: the user has no
 * email. When present it is checked with the PayPal email grammar (RN-PAG-11) and
 * its eight codes; `ERR_EMAIL_EMPTY` never comes out of here.
 */
export function evaluateRegistrationEmail(text: string): Result {
  return text === '' ? ok() : evaluateEmail(text)
}

/**
 * The stored form: `null` without an email and otherwise the text in lowercase,
 * without trimming or changing anything else. Only applied to an email
 * `evaluateRegistrationEmail` accepted: it is already ASCII, so `toLowerCase` does
 * not depend on the locale. The PayPal email does not go through here.
 */
export function normalizeRegistrationEmail(text: string): string | null {
  return text === '' ? null : text.toLowerCase()
}

/** RN-REG-03. Not normalized: an extra space is a different password. */
export function evaluatePasswordConfirmation(password: string, confirmation: string): Result {
  return password === confirmation ? ok() : err('ERR_PASSWORD_MISMATCH')
}

export type { RegistrationField }

export interface RegistrationInput {
  readonly username: string
  readonly displayName: string
  /** Optional: `''` means "no email". */
  readonly email: string
  readonly password: string
  readonly passwordConfirmation: string
}

/** What gets registered: the confirmation has done its job. */
export interface Registration {
  readonly username: string
  readonly displayName: string
  /** `null` without an email; otherwise in lowercase. */
  readonly email: string | null
  readonly password: string
}

export type RegistrationSelection =
  | { readonly ok: true; readonly registration: Registration }
  | { readonly ok: false; readonly field: RegistrationField; readonly result: Result }

/**
 * The composite (RN-REG-01). Fixed order, that of the form fields; the first
 * rejection wins: CURP with its age, name, email, password and confirmation.
 */
export function evaluateRegistration(input: RegistrationInput, today: CalendarDate): RegistrationSelection {
  const checks: readonly [RegistrationField, Result][] = [
    ['username', evaluateRegistrationCurp(input.username, today)],
    ['displayName', evaluateDisplayName(input.displayName)],
    ['email', evaluateRegistrationEmail(input.email)],
    ['password', validatePassword(input.password)],
    ['passwordConfirmation', evaluatePasswordConfirmation(input.password, input.passwordConfirmation)],
  ]
  for (const [field, result] of checks) {
    if (!result.ok) return { ok: false, field, result }
  }
  return {
    ok: true,
    registration: {
      username: input.username,
      displayName: input.displayName,
      email: normalizeRegistrationEmail(input.email),
      password: input.password,
    },
  }
}

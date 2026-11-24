import { err, ok, type Result } from './result'

/**
 * The password has no range: it is exactly 8 characters. A single constant lets
 * the UI derive its `maxlength` and counter from here rather than from a
 * repeated literal.
 */
export const PASSWORD_LENGTH = 8

const CODE_ZERO = 48
const CODE_NINE = 57
const CODE_UPPER_A = 65
const CODE_UPPER_Z = 90
const CODE_LOWER_A = 97
const CODE_LOWER_Z = 122

/** ASCII alphanumeric character: [A-Za-z0-9] */
export function isAlphanumeric(ch: string): boolean {
  // Compared by code point rather than with a regular expression to make the ASCII
  // range explicit: 'á' or 'ñ' are not alphanumeric here.
  if (ch.length !== 1) return false
  const code = ch.charCodeAt(0)
  return (
    (code >= CODE_ZERO && code <= CODE_NINE) ||
    (code >= CODE_UPPER_A && code <= CODE_UPPER_Z) ||
    (code >= CODE_LOWER_A && code <= CODE_LOWER_Z)
  )
}

/** Any character that is not alphanumeric */
export function isSpecial(ch: string): boolean {
  return !isAlphanumeric(ch)
}

/**
 * The four mandatory classes are exported because the UI hint marks each
 * requirement separately: if it reimplemented them, the hint could contradict
 * the rule it illustrates.
 */
export function isUppercase(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= CODE_UPPER_A && code <= CODE_UPPER_Z
}

export function isLowercase(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= CODE_LOWER_A && code <= CODE_LOWER_Z
}

export function isDigit(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= CODE_ZERO && code <= CODE_NINE
}

/**
 * A password of exactly 8 characters with the four mandatory classes: uppercase,
 * lowercase, digit and special character. The symbol may be in any position.
 *
 * Evaluation order is fixed: empty, spaces, length, uppercase, lowercase, digit,
 * special. The order is a test oracle: 'abc12345' lacks both uppercase and
 * special, and must always report the first.
 */
export function validatePassword(value: string): Result {
  if (value.length === 0) return err('ERR_PASSWORD_EMPTY')

  // The space is checked before length and composition because it is also a
  // special character: without this order, 'Abc 123$' would satisfy the symbol
  // requirement with the space itself.
  if (value.includes(' ')) return err('ERR_PASSWORD_HAS_SPACE')

  if (value.length !== PASSWORD_LENGTH) return err('ERR_PASSWORD_LENGTH')

  let hasUppercase = false
  let hasLowercase = false
  let hasDigit = false
  let hasSpecial = false

  for (const ch of value) {
    if (isUppercase(ch)) hasUppercase = true
    else if (isLowercase(ch)) hasLowercase = true
    else if (isDigit(ch)) hasDigit = true
    else hasSpecial = true
  }

  if (!hasUppercase) return err('ERR_PASSWORD_NO_UPPERCASE')
  if (!hasLowercase) return err('ERR_PASSWORD_NO_LOWERCASE')
  if (!hasDigit) return err('ERR_PASSWORD_NO_DIGIT')
  if (!hasSpecial) return err('ERR_PASSWORD_NO_SPECIAL')

  return ok()
}

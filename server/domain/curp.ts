import { daysInMonth } from './calendar'
import { err, ok, type Result } from './result'

/** Length of the username field: an 18-character CURP plus the 2 state letters. */
export const USERNAME_LENGTH = 20

/** Length of the official CURP; the two state letters are not part of it. */
export const CURP_LENGTH = 18

/**
 * Characters that enter the check digit computation. 17 rather than 18 because
 * the digit itself is character 18, and not 20 because the two trailing letters
 * are an addition of this system, not part of the official CURP.
 */
export const CHECKSUM_SPAN = 17

/**
 * The RENAPO alphabet: 37 characters, with Ñ between N and O. Checked against the
 * Instructivo Normativo para la Asignación de la CURP (DOF 18/10/2021) and
 * verified against real CURPs.
 */
export const ALPHABET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'

/** The 32 state codes plus NE, born abroad. */
export const STATE_CODES: readonly string[] = [
  'AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT',
  'GR', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT',
  'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS', 'NE',
]

/** Accepted sex marks; X is the non-binary mark of the current Instructivo. */
export const SEX_MARKS: readonly string[] = ['H', 'M', 'X']

const CODE_ZERO = 48
const CODE_NINE = 57
const CODE_UPPER_A = 65
const CODE_UPPER_Z = 90

function isAsciiDigit(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= CODE_ZERO && code <= CODE_NINE
}

function isUppercaseLetter(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= CODE_UPPER_A && code <= CODE_UPPER_Z
}

function isAlphanumeric(ch: string): boolean {
  return isAsciiDigit(ch) || isUppercaseLetter(ch) || (ch >= 'a' && ch <= 'z')
}

function allSatisfy(value: string, from: number, to: number, test: (ch: string) => boolean): boolean {
  for (let i = from; i <= to; i++) {
    if (!test(value[i]!)) return false
  }
  return true
}

/**
 * The century the homoclave imposes on the two-digit year: a digit means 19XX and
 * a letter 20XX. It is not cosmetic: it decides whether the date exists. '000229'
 * with a digit homoclave is 1900, which is not a leap year; with a letter it is
 * 2000, which is.
 */
export function resolveYear(twoDigitYear: number, homoclave: string): number {
  return isAsciiDigit(homoclave) ? 1900 + twoDigitYear : 2000 + twoDigitYear
}

/**
 * Check digit over the first 17 characters of `value`: the index of each
 * character in the 37-character alphabet, weighted from 18 down to 2, and
 * 10 - (sum mod 10) with 10 normalized to 0.
 *
 * Returns null if characters are missing or one is not in the alphabet: an index
 * of -1 would silently add up and produce a meaningless digit.
 */
export function computeCheckDigit(value: string): number | null {
  if (value.length < CHECKSUM_SPAN) return null

  let sum = 0
  for (let i = 0; i < CHECKSUM_SPAN; i++) {
    const index = ALPHABET.indexOf(value[i]!)
    if (index === -1) return null
    sum += index * (CHECKSUM_SPAN + 1 - i)
  }

  return (10 - (sum % 10)) % 10
}

/**
 * Validates the username field: an 18-character CURP plus 2 state letters.
 *
 *   1-4    initials, letters (X is valid: it stands in for a missing surname or consonant)
 *   5-10   YYMMDD, a real date whose century is set by position 17
 *   11     H, M or X
 *   12-13  state of birth
 *   14-16  internal consonants, letters (X is also valid)
 *   17     homoclave, digit or letter
 *   18     check digit over 1-17
 *   19-20  state, must match 12-13
 *
 * Evaluation order is fixed: length, spaces, uppercase, special characters,
 * positional format, date, sex, state, check digit, match. The order is a test
 * oracle, not an implementation detail.
 *
 * The system validates already formed CURPs, it does not derive them: there is no
 * José/María rule, no particle removal and no catalog of inappropriate words
 * here. X is accepted as a normal letter wherever it appears.
 */
export function validateUsername(value: string): Result {
  // An empty field is a different condition from a wrong length, and telling
  // someone who has typed nothing that it "must be exactly 20 characters" reproaches
  // instead of instructing.
  if (value.length === 0) return err('ERR_USERNAME_EMPTY')

  if (value.length !== USERNAME_LENGTH) return err('ERR_CURP_LENGTH')

  // The space is checked before the special character because it is also one:
  // without this order, ' ' would be reported as ERR_CURP_SPECIAL_CHAR.
  if (value.includes(' ')) return err('ERR_CURP_HAS_SPACE')

  for (const ch of value) {
    if (ch >= 'a' && ch <= 'z') return err('ERR_CURP_NOT_UPPERCASE')
  }

  for (const ch of value) {
    if (!isAlphanumeric(ch)) return err('ERR_CURP_SPECIAL_CHAR')
  }

  if (!allSatisfy(value, 0, 3, isUppercaseLetter)) return err('ERR_CURP_FORMAT_INITIALS')
  if (!allSatisfy(value, 13, 15, isUppercaseLetter)) return err('ERR_CURP_FORMAT_CONSONANTS')

  const dateResult = validateBirthDate(value.slice(4, 10), value[16]!)
  if (!dateResult.ok) return dateResult

  if (!SEX_MARKS.includes(value[10]!)) return err('ERR_CURP_INVALID_SEX')

  const state = value.slice(11, 13)
  if (!STATE_CODES.includes(state)) return err('ERR_CURP_INVALID_STATE')

  const digit = computeCheckDigit(value)
  if (digit === null || String(digit) !== value[17]) return err('ERR_CURP_CHECKSUM')

  if (value.slice(18, 20) !== state) return err('ERR_CURP_STATE_MISMATCH')

  return ok()
}

/**
 * YYMMDD date against the real calendar. The homoclave provides the century, so
 * the same string may or may not exist depending on that character.
 */
function validateBirthDate(yymmdd: string, homoclave: string): Result {
  if (!allSatisfy(yymmdd, 0, 5, isAsciiDigit)) return err('ERR_CURP_INVALID_DATE')

  const year = resolveYear(Number(yymmdd.slice(0, 2)), homoclave)
  const month = Number(yymmdd.slice(2, 4))
  const day = Number(yymmdd.slice(4, 6))

  if (month < 1 || month > 12) return err('ERR_CURP_INVALID_DATE')
  if (day < 1 || day > daysInMonth(year, month)) return err('ERR_CURP_INVALID_DATE')

  return ok()
}

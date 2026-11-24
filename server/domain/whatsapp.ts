import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/max'
import { accept, err, reject, type Checked, type Result } from './result.ts'

/**
 * The user's WhatsApp number (RN-WSP-01 and 02). The numbering plans are data for
 * more than 200 countries, like the holidays, and come from `libphonenumber-js`;
 * the rules and the codes belong to PALCO. The `max` metadata are the only ones
 * that tell mobile from landline.
 */

export const WHATSAPP_DEFAULT_COUNTRY = 'MX'

/** Two-letter ISO codes of the countries with a numbering plan. */
export const WHATSAPP_COUNTRIES: readonly string[] = getCountries()

const SEPARATORS = /[ \-().]/g

function isCountry(country: string): country is CountryCode {
  return WHATSAPP_COUNTRIES.includes(country)
}

/**
 * Fixed order, the first one wins (RN-WSP-01). The number is typed without the
 * country code, which the list provides: a `+` is an invalid character.
 */
export function evaluateWhatsappNumber(country: string, number: string): Checked<{ readonly e164: string }> {
  // Nothing left once the separators are removed: "- ()" is an empty number.
  const digits = number.replace(SEPARATORS, '')
  if (digits === '') return reject(err('ERR_WHATSAPP_EMPTY'))
  if (!isCountry(country)) return reject(err('ERR_WHATSAPP_COUNTRY'))
  if (!/^[0-9]+$/.test(digits)) return reject(err('ERR_WHATSAPP_CHARS'))
  if (validatePhoneNumberLength(digits, country) !== undefined) return reject(err('ERR_WHATSAPP_LENGTH'))

  const parsed = parsePhoneNumberFromString(digits, country)
  if (!parsed?.isValid()) return reject(err('ERR_WHATSAPP_INVALID'))

  // An undefined type with a valid number is a plan that does not tell mobile from
  // landline, and it is accepted (RN-WSP-01).
  const type = parsed.getType()
  if (type !== undefined && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
    return reject(err('ERR_WHATSAPP_NOT_MOBILE'))
  }
  return accept({ e164: parsed.number })
}

/** The list's country code, "52" for Mexico; '' outside the list. */
export function whatsappCallingCode(country: string): string {
  return isCountry(country) ? getCountryCallingCode(country) : ''
}

/**
 * The number formatted for its country as it is typed: "3312345678" gives
 * "33 1234 5678". With any character that is neither a digit nor a separator it
 * returns the text unchanged, so the rejection stays visible and nothing vanishes.
 */
export function formatWhatsappAsYouType(country: string, text: string): string {
  if (!isCountry(country) || !/^[0-9 \-().]*$/.test(text)) return text
  return new AsYouType(country).input(text.replace(SEPARATORS, ''))
}

/** `+52 ··· ··· 5678`: the country code and the last four digits. */
export function maskWhatsapp(e164: string): Checked<string> {
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed || parsed.number !== e164) return reject(err('ERR_INPUT_INVALID'))
  return accept(`+${parsed.countryCallingCode} ··· ··· ${parsed.nationalNumber.slice(-4)}`)
}

export interface WhatsappRegistrationInput {
  readonly country: string
  readonly number: string
  readonly consent: boolean
}

export type WhatsappField = 'country' | 'number' | 'consent'

export type WhatsappRegistration =
  | { readonly ok: true; readonly e164: string }
  | { readonly ok: false; readonly field: WhatsappField; readonly result: Result }

/** The number and then the consent (RN-WSP-04). */
export function evaluateWhatsappRegistration(input: WhatsappRegistrationInput): WhatsappRegistration {
  const number = evaluateWhatsappNumber(input.country, input.number)
  if (!number.ok) {
    return { ok: false, field: number.result.code === 'ERR_WHATSAPP_COUNTRY' ? 'country' : 'number', result: number.result }
  }
  if (input.consent !== true) return { ok: false, field: 'consent', result: err('ERR_WHATSAPP_CONSENT') }
  return { ok: true, e164: number.value.e164 }
}

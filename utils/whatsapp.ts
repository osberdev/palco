import type { WhatsappView } from '../types'
import { isObject } from './account-outcome'

export interface CountryOption {
  readonly code: string
  readonly label: string
}

/**
 * The dialog's country list (RN-WSP-02): the default first and the rest by their
 * Spanish name, "{name} +{code}". The names come from `Intl.DisplayNames`, which
 * depends on the browser's ICU version: that is why the dialog only mounts on the
 * client.
 */
export function countryOptions(
  countries: readonly string[],
  first: string,
  callingCode: (country: string) => string,
  regionName: (country: string) => string,
): readonly CountryOption[] {
  const option = (code: string): CountryOption => ({ code, label: `${regionName(code)} +${callingCode(code)}` })
  const rest = countries
    .filter((code) => code !== first)
    .map(option)
    .sort((a, b) => a.label.localeCompare(b.label, 'es-MX'))
  return countries.includes(first) ? [option(first), ...rest] : rest
}

/** The country name in Mexican Spanish, or the code itself if ICU does not have it. */
export function spanishRegionName(): (country: string) => string {
  const names = new Intl.DisplayNames(['es-MX'], { type: 'region', fallback: 'code' })
  return (country) => names.of(country) ?? country
}

export function isWhatsappView(value: unknown): value is WhatsappView {
  return isObject(value) && typeof value.masked === 'string'
}

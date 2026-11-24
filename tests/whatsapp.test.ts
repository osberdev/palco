import { describe, expect, it } from 'vitest'
import examples from 'libphonenumber-js/examples.mobile.json'
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'
import {
  WHATSAPP_COUNTRIES,
  WHATSAPP_DEFAULT_COUNTRY,
  evaluateWhatsappNumber,
  evaluateWhatsappRegistration,
  formatWhatsappAsYouType,
  maskWhatsapp,
  whatsappCallingCode,
} from '../server/domain/whatsapp'

// The user's WhatsApp number (RN-WSP-01 and 02). The oracles were checked with
// libphonenumber-js 1.13.14. Each case carries its identifier in its name.

function outcome(country: string, number: string): string {
  const result = evaluateWhatsappNumber(country, number)
  return result.ok ? result.value.e164 : result.result.code
}

describe('número de WhatsApp', () => {
  it('WA1: México, fijo o celular indistinguibles', () => {
    expect(WHATSAPP_DEFAULT_COUNTRY).toBe('MX')
    expect(outcome('MX', '33 1234 5678')).toBe('+523312345678')
  })

  it('WA2: España, celular', () => {
    expect(outcome('ES', '612 34 56 78')).toBe('+34612345678')
  })

  it('WA3: España, fijo', () => {
    expect(outcome('ES', '91 123 45 67')).toBe('ERR_WHATSAPP_NOT_MOBILE')
  })

  it('WA4: Argentina, el 9 del celular, o el 15 con la clave de área', () => {
    for (const number of ['9 11 2345 6789', '11 15 2345 6789', '011 15 2345 6789']) {
      expect(outcome('AR', number)).toBe('+5491123456789')
    }
  })

  it('WA5: Argentina sin el 9 es un fijo', () => {
    expect(outcome('AR', '11 2345 6789')).toBe('ERR_WHATSAPP_NOT_MOBILE')
  })

  it('WA6: Estados Unidos, con y sin paréntesis', () => {
    expect(outcome('US', '201 555 0123')).toBe('+12015550123')
    expect(outcome('US', '(201) 555-0123')).toBe('+12015550123')
  })

  it('WA7: Francia, celular y fijo', () => {
    expect(outcome('FR', '06 12 34 56 78')).toBe('+33612345678')
    expect(outcome('FR', '01 23 45 67 89')).toBe('ERR_WHATSAPP_NOT_MOBILE')
  })

  it('WA8: sin dígitos', () => {
    for (const number of ['', '   ', '- ()']) expect(outcome('MX', number)).toBe('ERR_WHATSAPP_EMPTY')
  })

  it('WA9: país fuera de la lista', () => {
    expect(WHATSAPP_COUNTRIES).toContain('MX')
    expect(outcome('ZZ', '33 1234 5678')).toBe('ERR_WHATSAPP_COUNTRY')
    expect(outcome('mx', '33 1234 5678')).toBe('ERR_WHATSAPP_COUNTRY')
  })

  it('WA10: caracteres que no son dígitos ni separadores, incluido el +', () => {
    for (const number of ['+52 33 1234 5678', '33 1234 567a', '33/1234/5678']) {
      expect(outcome('MX', number)).toBe('ERR_WHATSAPP_CHARS')
    }
  })

  it('WA11: longitud que no corresponde al país', () => {
    expect(outcome('MX', '33 1234 567')).toBe('ERR_WHATSAPP_LENGTH')
    expect(outcome('MX', '33 1234 56789')).toBe('ERR_WHATSAPP_LENGTH')
  })

  it('WA12: los prefijos antiguos del celular en México', () => {
    expect(outcome('MX', '044 33 1234 5678')).toBe('ERR_WHATSAPP_LENGTH')
    expect(outcome('MX', '1 33 1234 5678')).toBe('ERR_WHATSAPP_LENGTH')
  })

  it('WA13: longitud correcta y número inexistente', () => {
    // In the North American plan the area code is NXX: its first digit goes from 2 to
    // 9. "123" cannot be one, even though the ten digits add up.
    expect(outcome('US', '123 555 0123')).toBe('ERR_WHATSAPP_INVALID')
  })

  it('WA14: la máscara deja el código de país y los cuatro últimos', () => {
    const masks = ['+523312345678', '+34612345678', '+5491123456789', '+12015550123'].map((e164) => {
      const masked = maskWhatsapp(e164)
      return masked.ok ? masked.value : masked.result.code
    })
    expect(masks).toEqual(['+52 ··· ··· 5678', '+34 ··· ··· 5678', '+54 ··· ··· 6789', '+1 ··· ··· 0123'])
    expect(maskWhatsapp('5233123456').ok).toBe(false)
    expect(maskWhatsapp('+52abc').ok).toBe(false)
  })

  it('WA15: el número antes que el consentimiento', () => {
    expect(evaluateWhatsappRegistration({ country: 'MX', number: '33 1234 567', consent: false })).toEqual({
      ok: false,
      field: 'number',
      result: expect.objectContaining({ code: 'ERR_WHATSAPP_LENGTH' }),
    })
  })

  it('WA16: un número válido sin consentimiento', () => {
    expect(evaluateWhatsappRegistration({ country: 'MX', number: '33 1234 5678', consent: false })).toEqual({
      ok: false,
      field: 'consent',
      result: expect.objectContaining({ code: 'ERR_WHATSAPP_CONSENT' }),
    })
    expect(evaluateWhatsappRegistration({ country: 'MX', number: '33 1234 5678', consent: true })).toEqual({
      ok: true,
      e164: '+523312345678',
    })
    expect(evaluateWhatsappRegistration({ country: 'ZZ', number: '33 1234 5678', consent: true })).toMatchObject({
      ok: false,
      field: 'country',
    })
  })

  it('WA17: el formato mientras se escribe y el código de país', () => {
    expect(formatWhatsappAsYouType('MX', '3312345678')).toBe('33 1234 5678')
    expect(formatWhatsappAsYouType('ES', '612345678')).toBe('612 34 56 78')
    expect(formatWhatsappAsYouType('MX', '33 1234 567a')).toBe('33 1234 567a')
    expect(formatWhatsappAsYouType('ZZ', '3312345678')).toBe('3312345678')
    expect(whatsappCallingCode('MX')).toBe('52')
    expect(whatsappCallingCode('ZZ')).toBe('')
  })

  it('INV30: el celular de ejemplo de cada país se acepta con su E.164', () => {
    const failures: string[] = []
    let covered = 0
    for (const [country, example] of Object.entries(examples)) {
      const parsed = parsePhoneNumberFromString(example, country as CountryCode)
      if (!parsed) {
        failures.push(`${country}: la biblioteca no lee su ejemplo`)
        continue
      }
      covered++
      const national = parsed.formatNational()
      const result = evaluateWhatsappNumber(country, national)
      if (!result.ok) {
        failures.push(`${country} «${national}»: ${result.result.code}`)
        continue
      }
      if (result.value.e164 !== parsed.number) failures.push(`${country}: ${result.value.e164} ≠ ${parsed.number}`)
      const masked = maskWhatsapp(result.value.e164)
      if (!masked.ok || !masked.value.endsWith(parsed.nationalNumber.slice(-4))) failures.push(`${country}: máscara`)
    }
    expect(failures).toEqual([])
    expect(covered).toBe(Object.keys(examples).length)
  })
})

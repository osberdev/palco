import { describe, expect, it } from 'vitest'
import { parseWhatsappBody } from '../server/utils/whatsapp-request'

// The exact shape of the PUT /api/profile/whatsapp body. Each case carries its
// identifier in its name.

const VALID = { country: 'MX', number: '33 1234 5678', consent: true }

describe('cuerpo del WhatsApp', () => {
  it('WB1: las tres claves, dos textos y un booleano', () => {
    expect(parseWhatsappBody(VALID)).toEqual(VALID)
    expect(parseWhatsappBody({ ...VALID, consent: false })).toEqual({ ...VALID, consent: false })
  })

  it('WB2: una clave de más', () => {
    expect(parseWhatsappBody({ ...VALID, e164: '+523312345678' })).toBeNull()
  })

  it('WB3: una clave de menos', () => {
    expect(parseWhatsappBody({ country: 'MX', number: '33 1234 5678' })).toBeNull()
  })

  it('WB4: el consentimiento como texto', () => {
    expect(parseWhatsappBody({ ...VALID, consent: 'true' })).toBeNull()
  })

  it('WB5: un número que no es texto', () => {
    expect(parseWhatsappBody({ ...VALID, number: 3312345678 })).toBeNull()
  })

  it('WB6: un cuerpo que no es objeto', () => {
    for (const body of [null, undefined, 'MX', [VALID]]) expect(parseWhatsappBody(body)).toBeNull()
  })
})

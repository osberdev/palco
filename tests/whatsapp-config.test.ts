import { describe, expect, it } from 'vitest'
import { WHATSAPP_REQUIRED_VARIABLES, isWhatsappApiBase, parseWhatsappConfig } from '../server/utils/whatsapp-config'

// The send configuration. Each case carries its identifier in its name.

const COMPLETE = { ...Object.fromEntries(WHATSAPP_REQUIRED_VARIABLES.map((name) => [name, `valor-${name}`])), NUXT_WHATSAPP_TICKET_TEMPLATE: 'palco_boletos' }

describe('configuración del envío', () => {
  it('WC1: sin alguna de las cinco variables, no disponible, con sus nombres', () => {
    expect(parseWhatsappConfig({})).toEqual({ ok: false, missing: [...WHATSAPP_REQUIRED_VARIABLES], invalid: [] })
    expect(parseWhatsappConfig({ ...COMPLETE, NUXT_WHATSAPP_ACCESS_TOKEN: '  ' })).toEqual({
      ok: false,
      missing: ['NUXT_WHATSAPP_ACCESS_TOKEN'],
      invalid: [],
    })
  })

  it('WC2: completa, con la dirección y la versión por omisión', () => {
    const parsed = parseWhatsappConfig(COMPLETE)
    expect(parsed).toMatchObject({ ok: true, config: { apiBase: 'https://graph.facebook.com', apiVersion: 'v26.0' } })
    expect(parseWhatsappConfig({ ...COMPLETE, NUXT_WHATSAPP_API_BASE: 'http://127.0.0.1:4010/' })).toMatchObject({
      ok: true,
      config: { apiBase: 'http://127.0.0.1:4010' },
    })
  })

  it('WC3: la dirección de Meta solo https, o http hacia la propia máquina', () => {
    for (const base of ['https://graph.facebook.com', 'http://127.0.0.1:4010', 'http://localhost', 'http://localhost:9']) {
      expect(isWhatsappApiBase(base)).toBe(true)
    }
    for (const base of ['http://graph.facebook.com', 'http://192.168.1.5:4010', 'ftp://localhost', 'graph.facebook.com', 'https://x.y/v21.0', 'https://u:p@x.y']) {
      expect(isWhatsappApiBase(base)).toBe(false)
    }
    expect(parseWhatsappConfig({ ...COMPLETE, NUXT_WHATSAPP_API_BASE: 'http://192.168.1.5' })).toEqual({
      ok: false,
      missing: [],
      invalid: ['NUXT_WHATSAPP_API_BASE'],
    })
  })

  it('WC4: solo se habilitan las plantillas con un constructor implementado', () => {
    for (const template of ['palco_boletos', 'palco_boletos_v2']) {
      expect(parseWhatsappConfig({ ...COMPLETE, NUXT_WHATSAPP_TICKET_TEMPLATE: template })).toMatchObject({ ok: true, config: { template } })
    }
    for (const template of ['palco_boletos_v3', 'toString', '__proto__']) {
      expect(parseWhatsappConfig({ ...COMPLETE, NUXT_WHATSAPP_TICKET_TEMPLATE: template })).toEqual({ ok: false, missing: [], invalid: ['NUXT_WHATSAPP_TICKET_TEMPLATE'] })
    }
  })
})

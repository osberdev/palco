import { describe, expect, it } from 'vitest'
import {
  WHATSAPP_RETRY_DELAYS_MS,
  WHATSAPP_SEND_LIMIT,
  WHATSAPP_TRANSIENT_CODES,
  WHATSAPP_UNREACHABLE_CODE,
  classifyMetaSend,
  classifyMetaUpload,
} from '../server/domain/whatsapp-send'

// Classifying Meta's responses (RN-ENV-03). Each case carries its identifier in its name.

const metaError = (code: number, message = 'x') => ({ error: { message, type: 'OAuthException', code } })

describe('respuesta de Meta', () => {
  it('WE1: aceptado, con su wamid', () => {
    expect(classifyMetaSend(200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.HBgM' }] })).toEqual({
      kind: 'accepted',
      wamid: 'wamid.HBgM',
    })
  })

  it('WE2: 131030, el número no puede recibir mensajes', () => {
    expect(WHATSAPP_UNREACHABLE_CODE).toBe(131030)
    expect(classifyMetaSend(400, metaError(131030))).toEqual({ kind: 'unreachable', metaCode: 131030 })
  })

  it('WE3: 132001 y los demás códigos son permanentes', () => {
    expect(classifyMetaSend(404, metaError(132001))).toEqual({ kind: 'permanent', metaCode: 132001 })
    expect(classifyMetaSend(400, metaError(100))).toEqual({ kind: 'permanent', metaCode: 100 })
  })

  it('WE4: un error del servicio es transitorio, con o sin cuerpo', () => {
    expect(classifyMetaSend(500, metaError(1))).toEqual({ kind: 'transient', metaCode: 1, offline: false })
    expect(classifyMetaSend(500, null)).toEqual({ kind: 'transient', metaCode: null, offline: false })
    expect(classifyMetaSend(503, 'Service Unavailable')).toEqual({ kind: 'transient', metaCode: null, offline: false })
  })

  it('WE5: sin respuesta es transitorio', () => {
    expect(classifyMetaSend(0, null)).toEqual({ kind: 'transient', metaCode: null, offline: true })
    expect(classifyMetaUpload(0, null)).toEqual({ kind: 'transient', metaCode: null, offline: true })
  })

  it('WE6: los códigos transitorios de la lista, aunque el status sea 4xx', () => {
    expect(WHATSAPP_TRANSIENT_CODES).toEqual([1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 133004])
    expect(WHATSAPP_RETRY_DELAYS_MS).toEqual([2000, 8000])
    expect(WHATSAPP_SEND_LIMIT).toEqual({ limit: 3, windowMs: 3_600_000 })
    expect(classifyMetaSend(400, metaError(130429))).toEqual({ kind: 'transient', metaCode: 130429, offline: false })
    for (const code of WHATSAPP_TRANSIENT_CODES) expect(classifyMetaSend(400, metaError(code)).kind).toBe('transient')
  })

  it('WE7: el código solo cuenta si es entero', () => {
    expect(classifyMetaSend(400, { error: { code: '131030' } })).toEqual({ kind: 'permanent', metaCode: null })
    expect(classifyMetaSend(400, { error: { code: 1.5 } })).toEqual({ kind: 'permanent', metaCode: null })
  })

  it('WE8: un 2xx sin lo esperado es permanente, sin código', () => {
    expect(classifyMetaSend(200, { messaging_product: 'whatsapp' })).toEqual({ kind: 'permanent', metaCode: null })
    expect(classifyMetaSend(200, { messages: [{ id: 7 }] })).toEqual({ kind: 'permanent', metaCode: null })
    expect(classifyMetaUpload(200, { id: '1490157829612215' })).toEqual({ kind: 'uploaded', mediaId: '1490157829612215' })
    expect(classifyMetaUpload(200, {})).toEqual({ kind: 'permanent', metaCode: null })
    expect(classifyMetaUpload(500, metaError(1))).toEqual({ kind: 'transient', metaCode: 1, offline: false })
  })
})

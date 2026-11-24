import { describe, expect, it } from 'vitest'
import type { WhatsappSendStatus } from '../types'
import { classifySendResponse, rowSendAlert, sendRequestFailureView, ticketsSendView, type TicketsSendView } from '../utils/tickets-send-view'

// The WhatsApp send on screen. Each case carries its identifier in its name.

const IDLE: WhatsappSendStatus = {
  available: true,
  registered: true,
  masked: '+52 ··· ··· 5678',
  state: 'idle',
  failure: null,
  sentAt: null,
  remaining: 3,
  retryAfterSeconds: null,
}
const AT = '2026-10-18T01:42:07.000Z'
const time = (iso: string): string => `hora(${iso})`
const actions = (view: TicketsSendView) => view.actions.map((action) => `${action.action}${action.disabled ? ':off' : ''}`)
const failed = (failure: WhatsappSendStatus['failure']): WhatsappSendStatus => ({ ...IDLE, state: 'failed', failure, remaining: 2 })

describe('respuesta del POST', () => {
  it('WV1: sin respuesta', () => {
    expect(classifySendResponse(0, null)).toEqual({ kind: 'offline' })
  })

  it('WV2: 202 con un estado válido inicia el envío', () => {
    const sending = { ...IDLE, state: 'sending' }
    expect(classifySendResponse(202, sending)).toEqual({ kind: 'started', status: sending })
    expect(classifySendResponse(202, { state: 'sending' })).toEqual({ kind: 'failed', status: 202 })
  })

  it('WV3: 401', () => {
    expect(classifySendResponse(401, { message: 'Sesión requerida' })).toEqual({ kind: 'unauthorized' })
  })

  it('WV4: 404', () => {
    expect(classifySendResponse(404, { message: 'Compra inexistente' })).toEqual({ kind: 'notFound' })
  })

  it('WV5: 409 sin número', () => {
    expect(classifySendResponse(409, { ok: false, code: 'ERR_WHATSAPP_NOT_REGISTERED', message: 'x' })).toEqual({ kind: 'notRegistered' })
    expect(classifySendResponse(409, { ok: false, code: 'ERR_INPUT_INVALID', message: 'x' })).toEqual({ kind: 'failed', status: 409 })
  })

  it('WV6: 429 por el límite', () => {
    expect(classifySendResponse(429, { ok: false, code: 'ERR_WHATSAPP_SEND_LIMIT', message: 'x' })).toEqual({ kind: 'limited' })
    expect(classifySendResponse(429, {})).toEqual({ kind: 'failed', status: 429 })
  })

  it('WV7: 503 sin configuración', () => {
    expect(classifySendResponse(503, { ok: false, code: 'ERR_WHATSAPP_UNAVAILABLE', message: 'x' })).toEqual({ kind: 'unavailable' })
    expect(classifySendResponse(503, 'Service Unavailable')).toEqual({ kind: 'failed', status: 503 })
  })

  it('WV8: cualquier otra respuesta', () => {
    expect(classifySendResponse(500, { message: 'x' })).toEqual({ kind: 'failed', status: 500 })
    expect(classifySendResponse(200, IDLE)).toEqual({ kind: 'failed', status: 200 })
  })
})

describe('estado de la tarjeta', () => {
  it('WV9: sin envío', () => {
    const view = ticketsSendView(IDLE, time)
    expect(view.kind).toBe('idle')
    expect(view.paragraph).toBe('Recibe tus boletos en WhatsApp para imprimirlos o mostrarlos en la entrada.')
    expect(view.alert).toBeNull()
    expect(actions(view)).toEqual(['print', 'send'])
  })

  it('WV10: enviando', () => {
    const view = ticketsSendView({ ...IDLE, state: 'sending' }, time)
    expect(view.kind).toBe('sending')
    expect(view.sendingText).toBe('Enviando tus boletos a +52 ··· ··· 5678…')
    expect(actions(view)).toEqual(['print', 'send:off'])
  })

  it('WV11: enviado', () => {
    const view = ticketsSendView({ ...IDLE, state: 'sent', sentAt: AT, remaining: 2 }, time)
    expect(view.alert).toEqual({ variant: 'success', title: 'Boletos enviados a +52 ··· ··· 5678.', trace: null })
    expect(actions(view)).toEqual(['print', 'resend'])
  })

  it('WV12: sin conexión', () => {
    const view = ticketsSendView(failed({ code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: true, at: AT }), time)
    expect(view.kind).toBe('error')
    expect(view.alert).toEqual({ variant: 'error', title: 'No pudimos enviar tus boletos a WhatsApp.', trace: `sin conexión · hora(${AT})` })
    expect(view.confirmed).toBe(true)
    expect(actions(view)).toEqual(['retry', 'download', 'share'])
  })

  it('WV13: fallido, con el código de WhatsApp', () => {
    const view = ticketsSendView(failed({ code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 131026, offline: false, at: AT }), time)
    expect(view.alert?.trace).toBe(`WhatsApp 131026 · hora(${AT})`)
    expect(view.confirmed).toBe(true)
    expect(actions(view)).toEqual(['retry', 'download', 'share'])
  })

  it('WV14: con respuesta y sin código, el error del servidor', () => {
    const view = ticketsSendView(failed({ code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: false, at: AT }), time)
    expect(view.alert?.trace).toBe(`error · hora(${AT})`)
    expect(actions(view)).toEqual(['retry', 'download', 'share'])
  })

  it('WV15: sin envíos en la hora', () => {
    const view = ticketsSendView({ ...IDLE, state: 'sent', remaining: 0, retryAfterSeconds: 120 }, time)
    expect(view.kind).toBe('limited')
    expect(view.alert).toEqual({
      variant: 'info',
      title: 'Ya enviaste estos boletos 3 veces en la última hora. Podrás reenviarlos más tarde',
      trace: null,
    })
    expect(actions(view)).toEqual(['download', 'share'])
  })

  it('WV16: el envío no está disponible', () => {
    const view = ticketsSendView({ ...IDLE, available: false }, time)
    expect(view.kind).toBe('unavailable')
    expect(view.alert).toEqual({
      variant: 'info',
      title: 'El envío por WhatsApp no está disponible en este momento. Puedes imprimir o compartir tus boletos',
      trace: null,
    })
    expect(actions(view)).toEqual(['print', 'share'])
  })

  it('WV17: el número aún no recibe mensajes de PALCO, con solo la hora', () => {
    const view = ticketsSendView(failed({ code: 'ERR_WHATSAPP_UNREACHABLE', metaCode: 131030, offline: false, at: AT }), time)
    expect(view.kind).toBe('unreachable')
    expect(view.alert).toEqual({
      variant: 'info',
      title: 'Este número aún no puede recibir mensajes de PALCO. Tu compra está confirmada',
      trace: `hora(${AT})`,
    })
    expect(view.confirmed).toBe(false)
    expect(actions(view)).toEqual(['changeNumber', 'download', 'share'])
  })

  it('WV18: no disponible gana a enviando', () => {
    expect(ticketsSendView({ ...IDLE, available: false, state: 'sending' }, time).kind).toBe('unavailable')
  })

  it('WV19: enviando gana al límite, y el límite gana al fallo', () => {
    expect(ticketsSendView({ ...IDLE, state: 'sending', remaining: 0 }, time).kind).toBe('sending')
    expect(ticketsSendView({ ...failed({ code: 'ERR_WHATSAPP_UNREACHABLE', metaCode: 131030, offline: false, at: AT }), remaining: 0 }, time).kind).toBe('limited')
  })

  it('WV20: la hora es la del fallo, sin leer el reloj', () => {
    const seen: string[] = []
    ticketsSendView(failed({ code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 1, offline: false, at: AT }), (iso) => {
      seen.push(iso)
      return 'x'
    })
    expect(seen).toEqual([AT])
  })

  it('WV21: un POST sin respuesta o con otro estado, con la hora del cliente', () => {
    expect(sendRequestFailureView({ kind: 'offline' }, '19:42:07').alert).toEqual({
      variant: 'error',
      title: 'No pudimos enviar tus boletos a WhatsApp.',
      trace: 'sin conexión · 19:42:07',
    })
    const failedView = sendRequestFailureView({ kind: 'failed', status: 500 }, '19:42:07')
    expect(failedView.alert?.trace).toBe('error 500 · 19:42:07')
    expect(actions(failedView)).toEqual(['retry', 'download', 'share'])
  })
})

describe('alerta de «Mis boletos»', () => {
  it('WV22: enviado, la alerta de envío; otro resultado, la de su estado con el folio', () => {
    const folio = 'PLC-0001-2026'
    expect(rowSendAlert(folio, ticketsSendView({ ...IDLE, state: 'sent', remaining: 2 }, time))).toEqual({
      variant: 'success',
      title: 'Boletos de PLC-0001-2026 enviados a +52 ··· ··· 5678.',
      trace: null,
    })
    expect(rowSendAlert(folio, ticketsSendView(failed({ code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 132001, offline: false, at: AT }), time))).toEqual({
      variant: 'error',
      title: 'No pudimos enviar tus boletos a WhatsApp.',
      trace: `PLC-0001-2026 · WhatsApp 132001 · hora(${AT})`,
    })
    expect(rowSendAlert(folio, ticketsSendView({ ...IDLE, remaining: 0 }, time))).toMatchObject({ variant: 'info', trace: 'PLC-0001-2026' })
    expect(rowSendAlert(folio, ticketsSendView(IDLE, time))).toBeNull()
  })
})

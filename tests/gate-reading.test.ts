import { describe, expect, it } from 'vitest'
import { admittedDetail, classifyAdmissionResponse, readingFrom, READINGS_KEPT, withReading, type ReadingRow } from '../utils/gate-reading'
import type { AdmittedTicket } from '../types'

// Gate scanning on screen. The responses have the shape of
// `POST /api/gate/admissions` (INT21 to INT27). Each case carries its identifier.

const MET: AdmittedTicket = {
  shortCode: '7KQ2-M9XA-3TFD-H8WR',
  number: 1,
  quantity: 3,
  folio: 'PLC-0001-2026',
  cells: [{ label: 'TARIFA', value: 'Tarifa general' }],
}
const CINEMA: AdmittedTicket = {
  shortCode: 'F8TB-1MZE-6YQA-P4NJ',
  number: 2,
  quantity: 2,
  folio: 'PLC-0002-2026',
  cells: [{ label: 'FORMATO', value: 'VIP' }, { label: 'ASIENTO', value: '13' }],
}

const refusal = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  ({ ok: false, code, message, detail: null, shortCode: null, admittedAt: null, ...extra })

const clockTime = () => '19:04:10'
/** A fixed local time for an ISO time: the test does not depend on the process time zone. */
const formatTime = (iso: string) => (iso === '2026-10-27T01:02:41.000Z' ? '19:02:41' : `hora de ${iso}`)

describe('la respuesta', () => {
  it('RD1: 201 con el boleto es un ingreso', () => {
    expect(classifyAdmissionResponse(201, { ok: true, ticket: MET, admittedAt: '2026-10-27T01:02:41.000Z' }))
      .toEqual({ kind: 'admitted', ticket: MET, admittedAt: '2026-10-27T01:02:41.000Z' })
  })

  it('RD2: los rechazos de 400, 404 y 409 llevan su código, su mensaje y lo que traen', () => {
    for (const status of [400, 404, 409]) {
      expect(classifyAdmissionResponse(status, refusal('ERR_TICKET_OTHER_VENUE', 'El boleto es de otro recinto', { detail: 'Cinépolis · México', shortCode: CINEMA.shortCode })))
        .toEqual({ kind: 'refused', code: 'ERR_TICKET_OTHER_VENUE', message: 'El boleto es de otro recinto', detail: 'Cinépolis · México', shortCode: CINEMA.shortCode, admittedAt: null })
    }
  })

  it('RD3: sin respuesta, cerrada, sin configurar y cualquier otra cosa', () => {
    expect(classifyAdmissionResponse(0, null)).toEqual({ kind: 'offline' })
    expect(classifyAdmissionResponse(401, refusal('ERR_GATE_CLOSED', 'La taquilla se cerró. Vuelve a abrirla')))
      .toEqual({ kind: 'closed', message: 'La taquilla se cerró. Vuelve a abrirla' })
    // A 401 without a body also closes, with the same text.
    expect(classifyAdmissionResponse(401, null)).toEqual({ kind: 'closed', message: 'La taquilla se cerró. Vuelve a abrirla' })
    expect(classifyAdmissionResponse(503, refusal('ERR_GATE_UNAVAILABLE', 'La taquilla no está configurada en este servidor'))).toEqual({ kind: 'unavailable' })
    expect(classifyAdmissionResponse(500, { statusCode: 500 })).toEqual({ kind: 'failed', status: 500 })
    expect(classifyAdmissionResponse(403, refusal('ERR_CROSS_ORIGIN_REQUEST', 'La petición no proviene de PALCO'))).toEqual({ kind: 'failed', status: 403 })
  })

  it('RD4: un 400 o un 201 sin su forma son un fallo, no un mensaje inventado', () => {
    expect(classifyAdmissionResponse(400, { statusCode: 400, message: 'Invalid JSON body' })).toEqual({ kind: 'failed', status: 400 })
    expect(classifyAdmissionResponse(201, { ok: true, ticket: { ...MET, cells: [{ label: 'TARIFA' }] }, admittedAt: 'x' })).toEqual({ kind: 'failed', status: 201 })
    expect(classifyAdmissionResponse(201, { ok: true, ticket: MET })).toEqual({ kind: 'failed', status: 201 })
  })
})

describe('lo que se muestra', () => {
  it('RD5: el detalle del boleto admitido; en cine, el asiento rotulado', () => {
    expect(admittedDetail(MET)).toBe('Boleto 1 de 3 · Tarifa general · PLC-0001-2026')
    expect(admittedDetail(CINEMA)).toBe('Boleto 2 de 2 · VIP · Asiento 13 · PLC-0002-2026')
  })

  it('RD6: el ingreso, verde, con la hora a la que lo registró el servidor', () => {
    const reading = readingFrom({ kind: 'admitted', ticket: MET, admittedAt: '2026-10-27T01:02:41.000Z' }, clockTime, formatTime)
    expect(reading).toEqual({
      view: { tone: 'success', title: 'Acceso concedido', detail: 'Boleto 1 de 3 · Tarifa general · PLC-0001-2026', trace: null },
      row: { time: '19:02:41', tone: 'success', title: 'Acceso concedido', shortCode: MET.shortCode },
    })
  })

  it('RD7: un boleto ya usado dice a qué hora entró; la fila, la hora de esta lectura', () => {
    const reading = readingFrom(classifyAdmissionResponse(409, refusal('ERR_TICKET_ALREADY_USED', 'Este boleto ya se usó', { shortCode: MET.shortCode, admittedAt: '2026-10-27T01:02:41.000Z' })), clockTime, formatTime)
    expect(reading).toEqual({
      view: { tone: 'error', title: 'Este boleto ya se usó', detail: 'Entró a las 19:02:41', trace: null },
      row: { time: '19:04:10', tone: 'error', title: 'Este boleto ya se usó', shortCode: MET.shortCode },
    })
  })

  it('RD8: el rechazo por otro recinto lleva el recinto; el no auténtico, sin detalle ni código', () => {
    const other = readingFrom(classifyAdmissionResponse(400, refusal('ERR_TICKET_OTHER_VENUE', 'El boleto es de otro recinto', { detail: 'Cinépolis · México', shortCode: CINEMA.shortCode })), clockTime, formatTime)
    expect(other?.view).toEqual({ tone: 'error', title: 'El boleto es de otro recinto', detail: 'Cinépolis · México', trace: null })
    const fake = readingFrom(classifyAdmissionResponse(400, refusal('ERR_TICKET_NOT_AUTHENTIC', 'El boleto no es auténtico')), clockTime, formatTime)
    expect(fake).toEqual({
      view: { tone: 'error', title: 'El boleto no es auténtico', detail: null, trace: null },
      row: { time: '19:04:10', tone: 'error', title: 'El boleto no es auténtico', shortCode: null },
    })
  })

  it('RD9: un fallo deja la traza «sin conexión» o la del error del servidor y no entra en la lista; cerrar y sin configurar no dejan lectura', () => {
    expect(readingFrom({ kind: 'offline' }, clockTime, formatTime)).toEqual({
      view: { tone: 'error', title: 'No pudimos validar el boleto', detail: null, trace: 'sin conexión · 19:04:10' }, row: null,
    })
    expect(readingFrom({ kind: 'failed', status: 500 }, clockTime, formatTime)?.view.trace).toBe('error 500 · 19:04:10')
    expect(readingFrom({ kind: 'closed', message: 'x' }, clockTime, formatTime)).toBeNull()
    expect(readingFrom({ kind: 'unavailable' }, clockTime, formatTime)).toBeNull()
  })

  it('RD10: la lista, la más reciente primero y sin pasar del tope', () => {
    const row = (time: string): ReadingRow => ({ time, tone: 'success', title: 'Acceso concedido', shortCode: null })
    expect(withReading([row('1')], row('2')).map((r) => r.time)).toEqual(['2', '1'])
    expect(withReading([row('1')], null).map((r) => r.time)).toEqual(['1'])
    const full = Array.from({ length: READINGS_KEPT }, (_, i) => row(String(i)))
    const next = withReading(full, row('nueva'))
    expect(next).toHaveLength(READINGS_KEPT)
    expect(next[0]?.time).toBe('nueva')
    expect(next.at(-1)?.time).toBe(String(READINGS_KEPT - 2))
  })
})

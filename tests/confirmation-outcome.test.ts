import { describe, expect, it, vi } from 'vitest'
import { isRequestId } from '../server/utils/purchase-request'
import {
  classifyPurchaseResponse,
  formatRequestId,
  generateRequestId,
  nextRequestKey,
} from '../utils/confirmation-outcome'

// What the UI does with the confirmation response and the request identifier
// (RN-CON-07). Each case carries its identifier in its name.

function failure(step: unknown, field: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: false, step, field, seatIndex: null, code: 'ERR_INPUT_INVALID', message: 'Entrada inválida', ...extra }
}

describe('classifyPurchaseResponse', () => {
  it('CO1: 201 con folio', () => {
    expect(classifyPurchaseResponse(201, { ok: true, folio: 'PLC-0001-2026' })).toEqual({ kind: 'confirmed', folio: 'PLC-0001-2026' })
  })

  it('CO2: 200 con el mismo cuerpo, el reintento de una compra registrada', () => {
    expect(classifyPurchaseResponse(200, { ok: true, folio: 'PLC-0001-2026' })).toEqual({ kind: 'confirmed', folio: 'PLC-0001-2026' })
  })

  it('CO3: 201 con un folio que no cumple isFolio', () => {
    expect(classifyPurchaseResponse(201, { ok: true, folio: 'abc' })).toEqual({ kind: 'failed', status: 201 })
  })

  it('CO4: 400 en la cantidad de los boletos', () => {
    const body = failure('tickets', 'quantity', { code: 'ERR_EXCEEDS_AVAILABILITY', message: 'No hay suficientes boletos disponibles' })
    expect(classifyPurchaseResponse(400, body)).toEqual({
      kind: 'rejected',
      step: 'tickets',
      field: 'quantity',
      seatIndex: null,
      code: 'ERR_EXCEEDS_AVAILABILITY',
      message: 'No hay suficientes boletos disponibles',
    })
  })

  it('CO5: 400 en un asiento', () => {
    const outcome = classifyPurchaseResponse(400, failure('tickets', 'seats', { seatIndex: 2, code: 'ERR_SEAT_REPEATED' }))
    expect(outcome).toMatchObject({ kind: 'rejected', step: 'tickets', field: 'seats', seatIndex: 2 })
  })

  it('CO6: 400 en el pago', () => {
    const body = failure('payment', 'expiry', { code: 'ERR_CARD_EXPIRED', message: 'La tarjeta está vencida' })
    expect(classifyPurchaseResponse(400, body)).toMatchObject({ kind: 'rejected', step: 'payment', field: 'expiry', code: 'ERR_CARD_EXPIRED' })
  })

  it('CO7: 400 sin paso, en el requestId', () => {
    expect(classifyPurchaseResponse(400, failure(null, 'requestId'))).toEqual({ kind: 'failed', status: 400 })
  })

  it('CO8: 400 con paso y sin campo', () => {
    expect(classifyPurchaseResponse(400, failure('tickets', null))).toEqual({ kind: 'failed', status: 400 })
  })

  it('CO9: 400 de h3 por un JSON ilegible', () => {
    expect(classifyPurchaseResponse(400, { statusCode: 400, message: 'Invalid JSON body' })).toEqual({ kind: 'failed', status: 400 })
  })

  it('CO10: 401', () => {
    expect(classifyPurchaseResponse(401, { statusCode: 401, message: 'Sesión requerida' })).toEqual({ kind: 'unauthorized' })
  })

  it.each([404, 500, 503])('CO11: %d', (status) => {
    expect(classifyPurchaseResponse(status, { statusCode: status })).toEqual({ kind: 'failed', status })
  })

  it('CO12: sin respuesta', () => {
    expect(classifyPurchaseResponse(0, null)).toEqual({ kind: 'offline' })
  })

  it.each(['texto', null])('CO13: 400 con cuerpo %j', (body) => {
    expect(classifyPurchaseResponse(400, body)).toEqual({ kind: 'failed', status: 400 })
  })

  it('CO14: 400 en el método guardado señala el campo savedMethod', () => {
    const body = failure('payment', 'savedMethod', { code: 'ERR_SAVED_METHOD_UNAVAILABLE', message: 'El método guardado ya no está disponible' })
    expect(classifyPurchaseResponse(400, body)).toEqual({
      kind: 'rejected',
      step: 'payment',
      field: 'savedMethod',
      seatIndex: null,
      code: 'ERR_SAVED_METHOD_UNAVAILABLE',
      message: 'El método guardado ya no está disponible',
    })
  })
})

describe('identificador de solicitud', () => {
  it('RK1: 16 bytes en 0', () => {
    expect(formatRequestId(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('RK2: 16 bytes en 255', () => {
    expect(formatRequestId(new Uint8Array(16).fill(255))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('RK3: 100 identificadores generados son UUID v4 y distintos', () => {
    const ids = Array.from({ length: 100 }, () => generateRequestId())
    for (const id of ids) expect(isRequestId(id), id).toBe(true)
    expect(new Set(ids).size).toBe(100)
  })

  it.each([15, 17])('RK4: %d bytes', (length) => {
    expect(formatRequestId(new Uint8Array(length))).toBeNull()
  })

  it('RK5: sin clave anterior se genera una', () => {
    const generate = vi.fn(() => 'nueva')
    expect(nextRequestKey(null, 'a', generate)).toEqual({ requestId: 'nueva', fingerprint: 'a' })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('RK6: la misma compra conserva la clave', () => {
    const generate = vi.fn(() => 'nueva')
    const previous = { requestId: 'anterior', fingerprint: 'a' }
    expect(nextRequestKey(previous, 'a', generate)).toBe(previous)
    expect(generate).not.toHaveBeenCalled()
  })

  it('RK7: otra compra pide una clave nueva', () => {
    const generate = vi.fn(() => 'nueva')
    expect(nextRequestKey({ requestId: 'anterior', fingerprint: 'a' }, 'b', generate)).toEqual({ requestId: 'nueva', fingerprint: 'b' })
  })
})

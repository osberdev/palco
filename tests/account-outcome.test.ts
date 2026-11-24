import { describe, expect, it } from 'vitest'
import { classifyAccountResponse, deletedSuccess, savedMethodSuccess } from '../utils/account-outcome'

// What the payment methods screen does with its endpoints' responses. Each case
// carries its identifier in its name.

const METHOD = {
  id: '9c5b1f7e-2d4a-4e8b-9f3a-1b2c3d4e5f60',
  method: 'credit',
  brand: 'visa',
  last4: '1111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
}

describe('classifyAccountResponse', () => {
  it('AO1: 201 del alta con el método guardado', () => {
    expect(classifyAccountResponse(201, { ok: true, method: METHOD }, savedMethodSuccess)).toEqual({ kind: 'saved', value: METHOD })
  })

  it('AO2: 200 de la edición con PayPal', () => {
    const paypal = { id: METHOD.id, method: 'paypal', email: 'ana@example.com' }
    expect(classifyAccountResponse(200, { ok: true, method: paypal }, savedMethodSuccess)).toEqual({ kind: 'saved', value: paypal })
  })

  it('AO3: 200 de la baja', () => {
    expect(classifyAccountResponse(200, { ok: true }, deletedSuccess)).toEqual({ kind: 'saved', value: true })
  })

  it('AO4: 200 sin un método con su forma → fallo', () => {
    expect(classifyAccountResponse(200, { ok: true, method: { ...METHOD, last4: 1111 } }, savedMethodSuccess)).toEqual({ kind: 'failed', status: 200 })
  })

  it('AO5: 400 con campo', () => {
    const body = { ok: false, field: 'expiry', code: 'ERR_CARD_EXPIRED', message: 'La tarjeta está vencida' }
    expect(classifyAccountResponse(400, body, savedMethodSuccess)).toEqual({
      kind: 'rejected',
      field: 'expiry',
      code: 'ERR_CARD_EXPIRED',
      message: 'La tarjeta está vencida',
    })
  })

  it('AO6: 400 del conjunto, sin campo (duplicado o límite de métodos)', () => {
    const body = { ok: false, field: null, code: 'ERR_SAVED_METHOD_DUPLICATE', message: 'Ya tienes guardado este método de pago' }
    expect(classifyAccountResponse(400, body, savedMethodSuccess)).toEqual({
      kind: 'rejected',
      field: null,
      code: 'ERR_SAVED_METHOD_DUPLICATE',
      message: 'Ya tienes guardado este método de pago',
    })
  })

  it('AO7: un 400 sin la forma del rechazo no tiene mensaje que mostrar', () => {
    expect(classifyAccountResponse(400, { statusCode: 400, message: 'Bad Request' }, savedMethodSuccess)).toEqual({ kind: 'failed', status: 400 })
  })

  it('AO9: 429 del límite de registros, con la forma del rechazo (RN-REG-07)', () => {
    const body = {
      ok: false,
      field: null,
      code: 'ERR_REGISTRATION_RATE_LIMITED',
      message: 'Demasiados intentos de registro. Espera unos minutos e inténtalo de nuevo',
    }
    expect(classifyAccountResponse(429, body, savedMethodSuccess)).toEqual({
      kind: 'rejected',
      field: null,
      code: 'ERR_REGISTRATION_RATE_LIMITED',
      message: 'Demasiados intentos de registro. Espera unos minutos e inténtalo de nuevo',
    })
  })

  it('AO10: un 429 sin la forma del rechazo es un fallo', () => {
    expect(classifyAccountResponse(429, { statusCode: 429, message: 'Too Many Requests' }, savedMethodSuccess)).toEqual({ kind: 'failed', status: 429 })
  })

  it.each([
    [0, null, { kind: 'offline' }],
    [401, { statusCode: 401 }, { kind: 'unauthorized' }],
    [404, { statusCode: 404, message: 'Método de pago inexistente' }, { kind: 'failed', status: 404 }],
    [500, {}, { kind: 'failed', status: 500 }],
  ])('AO8: %d', (status, body, expected) => {
    expect(classifyAccountResponse(status, body, savedMethodSuccess)).toEqual(expected)
  })
})

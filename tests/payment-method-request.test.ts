import { describe, expect, it } from 'vitest'
import { parseSavedMethodChanges } from '../server/utils/payment-method-request'
import type { SavedPaymentMethodData } from '../types'

// The shape of the `PATCH /api/payment-methods/:id` body (RN-MET-05): exact, with
// no extra keys. Each case carries its identifier in its name.

const CARD: SavedPaymentMethodData = {
  method: 'credit',
  brand: 'visa',
  last4: '1111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
}
const PAYPAL: SavedPaymentMethodData = { method: 'paypal', email: 'ana.rios@example.com' }

describe('parseSavedMethodChanges', () => {
  it('PC1: tarjeta con { holder, expiry } → los cambios', () => {
    expect(parseSavedMethodChanges(CARD, { holder: 'Ana Ríos', expiry: '01/30' })).toEqual({ holder: 'Ana Ríos', expiry: '01/30' })
  })

  it('PC2: PayPal con { email } → los cambios', () => {
    expect(parseSavedMethodChanges(PAYPAL, { email: 'ana@example.com' })).toEqual({ email: 'ana@example.com' })
  })

  it('PC3: tarjeta con cardNumber de más → null', () => {
    expect(parseSavedMethodChanges(CARD, { holder: 'Ana Ríos', expiry: '01/30', cardNumber: '4000000000061111' })).toBeNull()
  })

  it('PC4: tarjeta con method de más → null', () => {
    expect(parseSavedMethodChanges(CARD, { holder: 'Ana Ríos', expiry: '01/30', method: 'debit' })).toBeNull()
  })

  it('PC5: PayPal con holder de más → null', () => {
    expect(parseSavedMethodChanges(PAYPAL, { email: 'ana@example.com', holder: 'Ana' })).toBeNull()
  })

  it.each([
    ['una clave de menos', { holder: 'Ana Ríos' }],
    ['un valor que no es texto', { holder: 'Ana Ríos', expiry: 1228 }],
    ['null', null],
    ['un arreglo', ['Ana Ríos', '01/30']],
  ])('PC6: tarjeta con %s → null', (_label, body) => {
    expect(parseSavedMethodChanges(CARD, body)).toBeNull()
  })
})

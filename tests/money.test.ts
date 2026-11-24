import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { calculateAmount } from '../server/domain/booking'
import { cents } from '../server/domain/money'
import type { Cents, Venue } from '../types'
import { CURRENCY_MINOR_DIGITS, formatMoney } from '../utils/format'

/** Every price, fee and rate of the venue. */
function amountsOf(venue: Venue): readonly Cents[] {
  switch (venue.category) {
    case 'teatro':
      return venue.sections.map((section) => section.price)
    case 'cine':
      return [...venue.formats.map((format) => format.price), venue.serviceFee]
    case 'museo':
      return [venue.generalFee, venue.residentFee]
  }
}

// Amounts in integer cents. Each case carries its identifier in its name.

describe('formatMoney — MN1', () => {
  it.each([
    [0, 'USD', 'USD 0.00'],
    [5, 'USD', 'USD 0.05'],
    [150, 'USD', 'USD 1.50'],
    [1999, 'USD', 'USD 19.99'],
    [250000, 'EUR', 'EUR 2,500.00'],
    [1234567, 'MXN', 'MXN 12,345.67'],
  ] as const)('MN1 %d %s → %s', (amount, currency, expected) => {
    expect(formatMoney(cents(amount), currency)).toBe(expected)
  })
})

describe('CURRENCY_MINOR_DIGITS — MN2', () => {
  it('MN2 las cuatro monedas tienen dos decimales', () => {
    expect(CURRENCY_MINOR_DIGITS).toEqual({ ARS: 2, EUR: 2, MXN: 2, USD: 2 })
  })
})

describe('calculateAmount con precios sin representación binaria exacta — MN5', () => {
  // In units, with `number`, they would give 3.4499999999999997,
  // 434.99999999999994 and 150.35999999999999.
  it.each([
    [115, 3, 0, 345],
    [435, 100, 0, 43500],
    [1999, 7, 149, 15036],
  ] as const)('MN5 (%d, %d, %d) → %d', (unitPrice, quantity, fee, expected) => {
    expect(calculateAmount(cents(unitPrice), quantity, cents(fee))).toBe(expected)
  })
})

describe('los datos son centavos — MN3', () => {
  it.each(VENUES.map((venue) => [venue.id, venue] as const))('MN3 %s', (_id, venue) => {
    for (const amount of amountsOf(venue)) {
      expect(Number.isSafeInteger(amount), String(amount)).toBe(true)
      expect(amount).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('ningún monto se sale del rango seguro — MN4', () => {
  it.each(VENUES.map((venue) => [venue.id, venue] as const))('MN4 %s', (_id, venue) => {
    const prices = venue.category === 'teatro'
      ? venue.sections.map((section) => section.price)
      : venue.category === 'cine'
        ? venue.formats.map((format) => format.price)
        : [venue.generalFee, venue.residentFee]
    const highest = prices.reduce((high, price) => (price > high ? price : high))
    const fee = venue.category === 'cine' ? venue.serviceFee : cents(0)
    expect(Number.isSafeInteger(calculateAmount(highest, 10, fee))).toBe(true)
  })
})

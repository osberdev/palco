import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { calculateAmount, evaluateQuantity, museumFee, remainingUserLimit } from '../server/domain/booking'
import { cents } from '../server/domain/money'
import type { ResultCode } from '../server/domain/result'
import type { MuseumVenue } from '../types'

// Oracles obtained by running the legacy console implementation. Each case carries
// its identifier in its name.

function museum(id: string): MuseumVenue {
  const found = VENUES.find((v) => v.id === id)
  if (!found || found.category !== 'museo') throw new Error(`No es un museo del catálogo: ${id}`)
  return found
}

describe('evaluateQuantity — Q1–Q11', () => {
  it.each([
    ['Q1', 0, 10, 100, 'ERR_QUANTITY_NOT_POSITIVE'],
    ['Q2', -1, 10, 100, 'ERR_QUANTITY_NOT_POSITIVE'],
    ['Q3', 1, 10, 100, 'OK'],
    ['Q4', 10, 10, 100, 'OK'],
    ['Q5', 11, 10, 100, 'ERR_EXCEEDS_USER_LIMIT'],
    ['Q6', 5, 5, 100, 'OK'],
    ['Q7', 6, 5, 100, 'ERR_EXCEEDS_USER_LIMIT'],
    ['Q8', 4, 5, 3, 'ERR_EXCEEDS_AVAILABILITY'],
    ['Q9', 3, 5, 3, 'OK'],
    ['Q10', 0, 5, 0, 'ERR_QUANTITY_NOT_POSITIVE'],
    // Violates both the limit and availability: the order reports the limit.
    ['Q11', 11, 10, 5, 'ERR_EXCEEDS_USER_LIMIT'],
  ] as const)('%s (%i, %i, %i) → %s', (_id, requested, userLimit, available, expected: ResultCode) => {
    expect(evaluateQuantity(requested, userLimit, available).code).toBe(expected)
  })
})

describe('calculateAmount — M1–M6', () => {
  it.each([
    ['M1', 9500, 3, 600, 30300],
    ['M2', 1400, 3, 150, 4650],
    ['M3', 4500000, 2, 0, 9000000],
    ['M4', 9500, 0, 600, 0],
    ['M5', -100, 3, 600, 0],
    ['M6', 9500, 3, -600, 28500],
  ] as const)('%s (%d, %d, %d) → %d', (_id, unitPrice, quantity, fee, expected) => {
    expect(calculateAmount(cents(unitPrice), quantity, cents(fee))).toBe(expected)
  })
})

describe('museumFee — F1–F6', () => {
  it.each([
    ['F1', 'louvre', true, 2200],
    ['F2', 'louvre', false, 3200],
    ['F3', 'mna', true, 10500],
    ['F4', 'mna', false, 21000],
    ['F5', 'met', true, 3000],
    ['F6', 'met', false, 3000],
  ] as const)('%s %s, residente %s → %d', (_id, id, isResident, expected) => {
    expect(museumFee(museum(id), isResident)).toBe(expected)
  })
})

describe('adaptación de TypeScript — T3–T4', () => {
  it('T3 cantidad no entera', () => {
    expect(evaluateQuantity(2.5, 10, 100).code).toBe('ERR_INPUT_INVALID')
  })

  it('T4 cantidad NaN', () => {
    expect(evaluateQuantity(Number.NaN, 10, 100).code).toBe('ERR_INPUT_INVALID')
  })
})

describe('remainingUserLimit — UL1–UL11 (RN-CAN-07)', () => {
  it.each([
    ['UL1', 10, 0, 10],
    ['UL2', 10, 3, 7],
    ['UL3', 10, 9, 1],
    ['UL4', 10, 10, 0],
    // More purchased than the limit: 0, never negative.
    ['UL5', 5, 7, 0],
    ['UL6', 0, 0, 0],
  ] as const)('%s límite %i, comprados %i → quedan %i', (_id, categoryLimit, already, expected) => {
    expect(remainingUserLimit(categoryLimit, already)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['UL7', 10, -1],
    ['UL8', 10, 2.5],
    ['UL9', Number.NaN, 0],
    ['UL10', -1, 0],
    ['UL11', 10, Number.MAX_SAFE_INTEGER + 1],
  ] as const)('%s (%d, %d) → ERR_INPUT_INVALID', (_id, categoryLimit, already) => {
    const result = remainingUserLimit(categoryLimit, already)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.result.code).toBe('ERR_INPUT_INVALID')
  })
})

describe('INV32 — lo acumulado nunca pasa del límite de la categoría', () => {
  // With the limit remainingUserLimit leaves, evaluateQuantity accepts r if and only
  // if r > 0, what was already purchased plus r fits in the limit and r fits in the
  // availability; and if it rejects for the limit, it uses the usual code.
  it('INV32 límites 5 y 10 × comprados 0–12 × pedidos −1–12 × disponibles 0, 3, 100', () => {
    let cases = 0
    for (const limit of [5, 10]) {
      for (let already = 0; already <= 12; already += 1) {
        const remaining = remainingUserLimit(limit, already)
        if (!remaining.ok) throw new Error('remainingUserLimit rechazó una entrada válida')
        for (let requested = -1; requested <= 12; requested += 1) {
          for (const available of [0, 3, 100]) {
            const code = evaluateQuantity(requested, remaining.value, available).code
            const fits = requested > 0 && already + requested <= limit && requested <= available
            expect(code === 'OK', `${limit} ${already} ${requested} ${available}`).toBe(fits)
            if (requested > 0 && already + requested > limit) expect(code).toBe('ERR_EXCEEDS_USER_LIMIT')
            cases += 1
          }
        }
      }
    }
    expect(cases).toBe(2 * 13 * 14 * 3)
  })
})

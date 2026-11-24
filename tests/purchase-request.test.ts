import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { confirmPurchase } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import type { CinemaSelectionInput, MuseumSelectionInput, TheaterSelectionInput } from '../server/domain/purchase'
import {
  isRequestId,
  isSavedPaymentBody,
  parsePaymentInput,
  parseTicketsInput,
  purchaseFingerprint,
  requestReplay,
} from '../server/utils/purchase-request'
import type { CalendarDate, CategorySlug, TheaterVenue } from '../types'

// The shape of the POST /api/purchases body. The parser only narrows types: ranges
// and rules belong to the domain. Each case carries its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }

const SCALA = VENUES.find((venue): venue is TheaterVenue => venue.id === 'teatro-scala' && venue.category === 'teatro')!

const B: TheaterSelectionInput = { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '10' }
const K: CinemaSelectionInput = {
  filmIndex: 3,
  age: '21',
  formatId: 'vip',
  date: '10/10/2026',
  time: '19:00',
  quantity: '2',
  seats: ['12', '13'],
}
const M: MuseumSelectionInput = { isResident: true, date: '15/10/2026', time: '10:00', quantity: '3' }
const Y: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}

const CONTEXT = { userLimit: 10, available: SCALA.capacity, today: TODAY, sequence: 1 }

function expectRejected(shaped: ReturnType<typeof parseTicketsInput> | ReturnType<typeof parsePaymentInput>, field: string | null, seatIndex: number | null = null): void {
  expect(shaped.ok).toBe(false)
  if (shaped.ok) return
  expect(shaped.field).toBe(field)
  expect(shaped.seatIndex).toBe(seatIndex)
  expect(shaped.result.code).toBe('ERR_INPUT_INVALID')
}

describe('parseTicketsInput', () => {
  it.each([
    ['RQ1', 'teatro', B],
    ['RQ2', 'cine', K],
    ['RQ3', 'museo', M],
  ] as const)('%s: %s bien formado se acepta igual', (_, category, input) => {
    expect(parseTicketsInput(category, input)).toEqual({ ok: true, value: { category, input } })
  })

  it.each([
    ['RQ4', null],
    ['RQ4', 'x'],
    ['RQ4', []],
    ['RQ4', 42],
  ])('%s: %j no es un objeto → campo null', (_, tickets) => {
    expectRejected(parseTicketsInput('teatro', tickets), null)
  })

  it('RQ5: teatro con la fecha como número', () => {
    expectRejected(parseTicketsInput('teatro', { ...B, date: 20261005 }), 'date')
  })

  it('RQ6: teatro con el índice de obra como texto', () => {
    expectRejected(parseTicketsInput('teatro', { ...B, playIndex: '0' }), 'play')
  })

  it('RQ7: un índice fuera de rango se acepta: el rango es del dominio', () => {
    expect(parseTicketsInput('teatro', { ...B, playIndex: 99 }).ok).toBe(true)
  })

  it('RQ8: cine con los asientos como texto', () => {
    expectRejected(parseTicketsInput('cine', { ...K, seats: '12' }), 'seats')
  })

  it('RQ9: cine con un asiento numérico', () => {
    expectRejected(parseTicketsInput('cine', { ...K, seats: ['12', 13] }), 'seats', 1)
  })

  it('RQ10: museo con la residencia como texto', () => {
    expectRejected(parseTicketsInput('museo', { ...M, isResident: 'true' }), 'residency')
  })
})

describe('parsePaymentInput', () => {
  it.each([
    ['RQ11', null],
    ['RQ11', [Y]],
  ])('%s: %j no es un objeto → campo null', (_, payment) => {
    expectRejected(parsePaymentInput(payment), null)
  })

  it('RQ12: método desconocido', () => {
    expectRejected(parsePaymentInput({ ...Y, method: 'cash' }), 'method')
  })

  it('RQ13: los textos ausentes valen vacío, y el dominio decide', () => {
    expect(parsePaymentInput({ method: 'paypal', email: 'ana@example.com' })).toEqual({
      ok: true,
      value: { method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email: 'ana@example.com' },
    })

    const { cardNumber: _omitted, ...withoutNumber } = Y
    const shaped = parsePaymentInput(withoutNumber)
    expect(shaped).toEqual({ ok: true, value: { ...Y, cardNumber: '' } })
    if (!shaped.ok || isSavedPaymentBody(shaped.value)) return
    const confirmation = confirmPurchase(SCALA, { category: 'teatro', input: B }, shaped.value, CONTEXT)
    expect(confirmation.ok).toBe(false)
    if (confirmation.ok) return
    expect([confirmation.step, confirmation.field, confirmation.result.code]).toEqual([
      'payment',
      'cardNumber',
      'ERR_CARD_NOT_NUMERIC',
    ])
  })

  it('RQ14: número de tarjeta como número', () => {
    expectRejected(parsePaymentInput({ ...Y, cardNumber: 4111111111111111 }), 'cardNumber')
  })

  it('RQ15: un campo que sobra se ignora', () => {
    expect(parseTicketsInput('teatro', { ...B, userId: 2 })).toEqual({ ok: true, value: { category: 'teatro', input: B } })
    expect(parsePaymentInput({ ...Y, userId: 2 })).toEqual({ ok: true, value: Y })
  })
})

describe('forma de punta a punta', () => {
  it('RQ16: ningún valor basura hace lanzar a los parsers', () => {
    const nested: Record<string, unknown> = {}
    let cursor = nested
    for (let depth = 0; depth < 50; depth++) {
      cursor.next = {}
      cursor = cursor.next as Record<string, unknown>
    }
    const huge = 'x'.repeat(1_000_000)
    const scalars: unknown[] = [undefined, null, true, false, 0, -0, 1, -1, 1.5, Number.NaN, Infinity, -Infinity, '', ' ', huge, '{}', '[]', 'null']
    const containers: unknown[] = [
      {},
      [],
      [{}],
      [[]],
      [{ playIndex: 0 }],
      nested,
      Object.create(null),
      new Date(0),
      { ...B, date: null },
      { ...B, date: {} },
      { ...B, quantity: ['10'] },
      { ...B, playIndex: Number.NaN },
      { ...K, seats: [] },
      { ...K, seats: [null] },
      { ...K, seats: [{}, []] },
      { ...K, seats: { 0: '12' } },
      { ...K, filmIndex: '3' },
      { ...M, isResident: 1 },
      { ...M, isResident: null },
      { ...Y, method: null },
      { ...Y, method: ['credit'] },
      { ...Y, holder: [] },
      { ...Y, email: 0 },
      { ...Y, expiry: { month: 12 } },
      { method: 'paypal' },
      { method: 'credit', cardNumber: huge },
      { tickets: B, payment: Y },
      { __proto__: { playIndex: 0 } },
      { constructor: 'x' },
      { toString: 42 },
      { date: huge, time: huge, quantity: huge, playIndex: 0, sectionIndex: 0 },
      [B],
    ]
    const corpus = [...scalars, ...containers]
    expect(corpus.length).toBeGreaterThanOrEqual(50)

    const categories: CategorySlug[] = ['teatro', 'cine', 'museo']
    for (const value of corpus) {
      for (const category of categories) expect(() => parseTicketsInput(category, value)).not.toThrow()
      expect(() => parsePaymentInput(value)).not.toThrow()
    }
  })

  it('RQ17: un índice de obra fuera de rango lo rechaza el dominio con su código', () => {
    const shaped = parseTicketsInput('teatro', { ...B, playIndex: 99 })
    expect(shaped.ok).toBe(true)
    if (!shaped.ok) return
    const confirmation = confirmPurchase(SCALA, shaped.value, Y, CONTEXT)
    expect(confirmation.ok).toBe(false)
    if (confirmation.ok) return
    expect([confirmation.step, confirmation.field, confirmation.result.code]).toEqual(['tickets', 'play', 'ERR_PLAY_INVALID'])
  })
})

describe('isRequestId', () => {
  const VALID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

  it('RQ18: UUID v4 en minúsculas', () => {
    expect(isRequestId(VALID)).toBe(true)
  })

  it('RQ19: el mismo en mayúsculas', () => {
    expect(isRequestId(VALID.toUpperCase())).toBe(false)
  })

  it('RQ20: versión 1', () => {
    expect(isRequestId('f47ac10b-58cc-1372-a567-0e02b2c3d479')).toBe(false)
  })

  it('RQ21: variante c', () => {
    expect(isRequestId('f47ac10b-58cc-4372-c567-0e02b2c3d479')).toBe(false)
  })

  it.each([
    ['sin guiones', VALID.replaceAll('-', '')],
    ['35 caracteres', VALID.slice(0, 35)],
    ['37 caracteres', `${VALID}0`],
    ['123', 123],
    ['null', null],
    ['undefined', undefined],
  ])('RQ22: %s', (_, value) => {
    expect(isRequestId(value)).toBe(false)
  })
})

describe('purchaseFingerprint', () => {
  const tickets = { category: 'teatro', input: B } as const

  it('RQ23: la misma entrada da la misma huella', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, Y)).toBe(purchaseFingerprint('teatro-scala', { category: 'teatro', input: { ...B } }, { ...Y }))
  })

  it('RQ23: el orden de las claves del cuerpo no cambia la huella', () => {
    const reordered: TheaterSelectionInput = { quantity: '10', time: '15:00', date: '05/10/2026', sectionIndex: 0, playIndex: 0 }
    expect(purchaseFingerprint('teatro-scala', { category: 'teatro', input: reordered }, Y)).toBe(purchaseFingerprint('teatro-scala', tickets, Y))
  })

  it.each([
    ['venueId', () => purchaseFingerprint('teatro-colon', tickets, Y)],
    ['la cantidad', () => purchaseFingerprint('teatro-scala', { category: 'teatro', input: { ...B, quantity: '9' } }, Y)],
    ['el método', () => purchaseFingerprint('teatro-scala', tickets, { ...Y, method: 'debit' })],
  ])('RQ24: cambia %s → huella distinta', (_, changed) => {
    expect(changed()).not.toBe(purchaseFingerprint('teatro-scala', tickets, Y))
  })

  it('RQ25: solo cambia el código de seguridad → misma huella', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, { ...Y, securityCode: '123' })).toBe(purchaseFingerprint('teatro-scala', tickets, Y))
  })

  it('RQ26: solo cambian dígitos intermedios con los mismos cuatro finales → misma huella', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, { ...Y, cardNumber: '4000000000001111' })).toBe(purchaseFingerprint('teatro-scala', tickets, Y))
  })

  it('RQ27: la huella no contiene el número completo ni el código de seguridad', () => {
    for (const category of ['teatro', 'cine', 'museo'] as const) {
      const input = category === 'teatro' ? { category, input: B } : category === 'cine' ? { category, input: K } : { category, input: M }
      const fingerprint = purchaseFingerprint('x', input, Y)
      expect(fingerprint).not.toContain('4111111111111111')
      expect(fingerprint).not.toContain('987')
    }
  })
})

describe('pago con un método guardado', () => {
  const tickets = { category: 'teatro', input: B } as const
  const SAVED_ID = '9c5b1f7e-2d4a-4e8b-9f3a-1b2c3d4e5f60'
  const OTHER_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

  it('RQ29: la forma { savedMethodId, securityCode } se acepta', () => {
    expect(parsePaymentInput({ savedMethodId: SAVED_ID, securityCode: '123' })).toEqual({
      ok: true,
      value: { kind: 'saved', savedMethodId: SAVED_ID, securityCode: '123' },
    })
    expect(parsePaymentInput({ savedMethodId: SAVED_ID })).toEqual({
      ok: true,
      value: { kind: 'saved', savedMethodId: SAVED_ID, securityCode: '' },
    })
  })

  it.each([
    ['savedMethodId numérico', { savedMethodId: 7, securityCode: '123' }, 'savedMethod'],
    ['savedMethodId nulo', { savedMethodId: null }, 'savedMethod'],
    ['código numérico', { savedMethodId: SAVED_ID, securityCode: 123 }, 'securityCode'],
  ])('RQ30: %s → rechazo de forma', (_, payment, field) => {
    expectRejected(parsePaymentInput(payment), field)
  })

  it('RQ31: con un método guardado la huella no cambia con el código de seguridad', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, { kind: 'saved', savedMethodId: SAVED_ID, securityCode: '123' }))
      .toBe(purchaseFingerprint('teatro-scala', tickets, { kind: 'saved', savedMethodId: SAVED_ID, securityCode: '456' }))
  })

  it('RQ32: dos métodos guardados distintos dan huellas distintas', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, { kind: 'saved', savedMethodId: SAVED_ID, securityCode: '123' }))
      .not.toBe(purchaseFingerprint('teatro-scala', tickets, { kind: 'saved', savedMethodId: OTHER_ID, securityCode: '123' }))
  })

  it('RQ33: la misma tarjeta capturada y guardada dan huellas distintas', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, { kind: 'saved', savedMethodId: SAVED_ID, securityCode: '987' }))
      .not.toBe(purchaseFingerprint('teatro-scala', tickets, Y))
  })

  it('RQ34: las huellas de un pago capturado son las de antes del sprint', () => {
    expect(purchaseFingerprint('teatro-scala', tickets, Y)).toBe(JSON.stringify({
      venueId: 'teatro-scala',
      tickets: { category: 'teatro', playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '10' },
      payment: { method: Y.method, maskedNumber: '************1111', holder: Y.holder, expiry: Y.expiry, email: Y.email },
    }))
  })
})

describe('requestReplay', () => {
  it('RQ28: sin registro, con la misma huella y con otra huella', () => {
    expect(requestReplay(null, 'a')).toEqual({ kind: 'new' })
    expect(requestReplay({ fingerprint: 'a', folio: 'PLC-0001-2026' }, 'a')).toEqual({ kind: 'replay', folio: 'PLC-0001-2026' })
    expect(requestReplay({ fingerprint: 'a', folio: 'PLC-0001-2026' }, 'b')).toEqual({ kind: 'conflict' })
  })
})

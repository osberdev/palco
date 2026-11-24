import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluatePayment, PAYMENT_METHODS, type PaymentInput } from '../server/domain/payment'
import { MESSAGES, type ResultCode } from '../server/domain/result'
import {
  evaluateNewSavedMethod,
  evaluatePaymentRequest,
  evaluateSavedMethodEdit,
  evaluateSavedPayment,
  isSavedMethodExpired,
  savedMaskedNumber,
  type NewSavedMethodInput,
} from '../server/domain/saved-payment'
import type { CalendarDate, SavedPaymentMethod, SavedPaymentMethodData } from '../types'

// Saved payment methods (RN-MET-04 to 08). Each case carries its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 13 }

const CARD: NewSavedMethodInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  email: '',
}
const PAYPAL: NewSavedMethodInput = { method: 'paypal', cardNumber: '', holder: '', expiry: '', email: 'ana.rios@example.com' }

const SAVED_CARD: SavedPaymentMethod = {
  id: '9c5b1f7e-2d4a-4e8b-9f3a-1b2c3d4e5f60',
  method: 'credit',
  brand: 'visa',
  last4: '1111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
}
const SAVED_PAYPAL: SavedPaymentMethod = { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', method: 'paypal', email: 'ana.rios@example.com' }
const SAVED_DEBIT_MC: SavedPaymentMethod = {
  id: '5f4e3d2c-1b0a-4f9e-8d7c-6b5a4f3e2d1c',
  method: 'debit',
  brand: 'mastercard',
  last4: '4444',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '09/26',
}

function expectRejected(result: { ok: boolean }, field: string | null, code: ResultCode): void {
  expect(result).toMatchObject({ ok: false, field, result: { code, message: MESSAGES[code] } })
}

describe('evaluateNewSavedMethod', () => {
  it('SM1: tarjeta válida → registro con marca y últimos cuatro, sin el número', () => {
    const saved = evaluateNewSavedMethod(CARD, [], 0, TODAY)
    expect(saved).toEqual({
      ok: true,
      method: { method: 'credit', brand: 'visa', last4: '1111', holder: 'Ana Sofía Ríos Vela', expiry: '12/28' },
    })
    expect(JSON.stringify(saved)).not.toContain('4111111111111111')
  })

  it('SM2: PayPal válido', () => {
    expect(evaluateNewSavedMethod(PAYPAL, [], 0, TODAY)).toEqual({ ok: true, method: { method: 'paypal', email: 'ana.rios@example.com' } })
  })

  it.each([
    ['método ajeno', { ...CARD, method: 'cash' as never }, 'method', 'ERR_INPUT_INVALID'],
    ['marca no aceptada', { ...CARD, cardNumber: '6011111111111117' }, 'cardNumber', 'ERR_CARD_BRAND_REJECTED'],
    ['Luhn', { ...CARD, cardNumber: '4111111111111112' }, 'cardNumber', 'ERR_CARD_LUHN'],
    ['titular vacío', { ...CARD, holder: '' }, 'holder', 'ERR_HOLDER_EMPTY'],
    ['expiración mal escrita', { ...CARD, expiry: '13/27' }, 'expiry', 'ERR_EXPIRY_FORMAT'],
    ['correo inválido', { ...PAYPAL, email: 'ana@' }, 'email', 'ERR_EMAIL_DOMAIN'],
  ] as const)('SM3: %s', (_label, input, field, code) => {
    expectRejected(evaluateNewSavedMethod(input, [], 0, TODAY), field, code)
  })

  it('SM4: tarjeta 09/26 → ERR_CARD_EXPIRED; una vencida no se guarda', () => {
    expectRejected(evaluateNewSavedMethod({ ...CARD, expiry: '09/26' }, [], 0, TODAY), 'expiry', 'ERR_CARD_EXPIRED')
  })

  it('SM5: 10/26 es válida todo su mes (RN-PAG-07)', () => {
    expect(evaluateNewSavedMethod({ ...CARD, expiry: '10/26' }, [], 0, TODAY).ok).toBe(true)
  })

  it('SM6: con 3 existentes → ERR_SAVED_METHODS_LIMIT', () => {
    const third: SavedPaymentMethodData = { ...SAVED_CARD, holder: 'Bruno Téllez Nava' }
    expectRejected(evaluateNewSavedMethod({ ...CARD, holder: 'Carmen Ibarra Solís' }, [SAVED_CARD, SAVED_PAYPAL, third], 0, TODAY), null, 'ERR_SAVED_METHODS_LIMIT')
  })

  it('SM7: con 3 existentes y un número inválido → el error del número, por el orden', () => {
    const third: SavedPaymentMethodData = { ...SAVED_CARD, holder: 'Bruno Téllez Nava' }
    expectRejected(
      evaluateNewSavedMethod({ ...CARD, cardNumber: '6011111111111117' }, [SAVED_CARD, SAVED_PAYPAL, third], 0, TODAY),
      'cardNumber',
      'ERR_CARD_BRAND_REJECTED',
    )
  })

  it('SM8: la misma tarjeta otra vez → ERR_SAVED_METHOD_DUPLICATE', () => {
    expectRejected(evaluateNewSavedMethod(CARD, [SAVED_CARD], 0, TODAY), null, 'ERR_SAVED_METHOD_DUPLICATE')
  })

  it('SM9: débito y crédito con los mismos datos son duplicados (RN-MET-06, reemplazo del 14 oct 2026)', () => {
    expectRejected(evaluateNewSavedMethod({ ...CARD, method: 'debit' }, [SAVED_CARD], 0, TODAY), null, 'ERR_SAVED_METHOD_DUPLICATE')
  })

  it('SM10: el mismo PayPal → duplicado; con otra mayúscula no lo es', () => {
    expectRejected(evaluateNewSavedMethod(PAYPAL, [SAVED_PAYPAL], 0, TODAY), null, 'ERR_SAVED_METHOD_DUPLICATE')
    const lower: SavedPaymentMethodData = { method: 'paypal', email: 'ana@x.com' }
    expect(evaluateNewSavedMethod({ ...PAYPAL, email: 'Ana@x.com' }, [lower], 0, TODAY).ok).toBe(true)
  })

  it('SM11: dos tarjetas distintas con los mismos cuatro últimos, titular y expiración → duplicado (limitación 13)', () => {
    // 4000000000061111 and 4111111111111111 pass Luhn and end the same.
    expect(evaluateNewSavedMethod({ ...CARD, cardNumber: '4000000000061111' }, [], 0, TODAY).ok).toBe(true)
    expectRejected(evaluateNewSavedMethod({ ...CARD, cardNumber: '4000000000061111' }, [SAVED_CARD], 0, TODAY), null, 'ERR_SAVED_METHOD_DUPLICATE')
  })

  it('SM12: el código de seguridad no forma parte del alta', () => {
    const withCode = { ...CARD, securityCode: '987' } as NewSavedMethodInput
    expect(JSON.stringify(evaluateNewSavedMethod(withCode, [], 0, TODAY))).not.toContain('987')
  })

  it('SM13: una tarjeta y una cuenta PayPal nunca son el mismo método', () => {
    expect(evaluateNewSavedMethod(CARD, [SAVED_PAYPAL], 0, TODAY).ok).toBe(true)
    expect(evaluateNewSavedMethod(PAYPAL, [SAVED_CARD], 0, TODAY).ok).toBe(true)
  })
})

describe('evaluateNewSavedMethod — límite diario de altas (RN-MET-10)', () => {
  const third: SavedPaymentMethodData = { ...SAVED_CARD, holder: 'Bruno Téllez Nava' }

  it('DA1: la quinta alta del día se admite', () => {
    expect(evaluateNewSavedMethod(CARD, [], 4, TODAY).ok).toBe(true)
  })

  it('DA2: la sexta se rechaza', () => {
    expectRejected(evaluateNewSavedMethod(CARD, [], 5, TODAY), null, 'ERR_SAVED_METHOD_DAILY_LIMIT')
  })

  it('DA3: los campos antes que el límite diario', () => {
    expectRejected(evaluateNewSavedMethod({ ...CARD, cardNumber: '6011111111111117' }, [], 5, TODAY), 'cardNumber', 'ERR_CARD_BRAND_REJECTED')
  })

  it('DA4: el límite diario antes que el máximo de 3', () => {
    expectRejected(
      evaluateNewSavedMethod({ ...CARD, holder: 'Carmen Ibarra Solís' }, [SAVED_CARD, SAVED_PAYPAL, third], 5, TODAY),
      null,
      'ERR_SAVED_METHOD_DAILY_LIMIT',
    )
  })

  it('DA5: el límite diario antes que el duplicado', () => {
    expectRejected(evaluateNewSavedMethod(CARD, [SAVED_CARD], 5, TODAY), null, 'ERR_SAVED_METHOD_DAILY_LIMIT')
  })

  it('DA6: PayPal también cuenta', () => {
    expectRejected(evaluateNewSavedMethod(PAYPAL, [], 5, TODAY), null, 'ERR_SAVED_METHOD_DAILY_LIMIT')
  })

  it.each([-1, 1.5, Number.NaN])('DA7: cuenta inválida %d', (additionsToday) => {
    expectRejected(evaluateNewSavedMethod(CARD, [], additionsToday, TODAY), null, 'ERR_INPUT_INVALID')
  })
})

describe('evaluateSavedMethodEdit', () => {
  it('ED1: titular válido', () => {
    expect(evaluateSavedMethodEdit(SAVED_CARD, { holder: 'Ana Ríos', expiry: '12/28' }, [], TODAY)).toEqual({
      ok: true,
      method: { method: 'credit', brand: 'visa', last4: '1111', holder: 'Ana Ríos', expiry: '12/28' },
    })
  })

  it('ED2: expiración vencida → ERR_CARD_EXPIRED', () => {
    expectRejected(evaluateSavedMethodEdit(SAVED_CARD, { holder: SAVED_CARD.holder, expiry: '09/26' }, [], TODAY), 'expiry', 'ERR_CARD_EXPIRED')
  })

  it('ED3: correo inválido', () => {
    expectRejected(evaluateSavedMethodEdit(SAVED_PAYPAL, { email: 'ana@@x.com' }, [], TODAY), 'email', 'ERR_EMAIL_AT_SIGN')
  })

  it('ED4: el método editado no cuenta como duplicado de sí mismo', () => {
    expect(evaluateSavedMethodEdit(SAVED_CARD, { holder: SAVED_CARD.holder, expiry: '12/28' }, [SAVED_PAYPAL], TODAY).ok).toBe(true)
  })

  it('ED5: una edición que coincide con otro método → ERR_SAVED_METHOD_DUPLICATE', () => {
    const other: SavedPaymentMethod = { ...SAVED_CARD, id: '11111111-2222-4333-8444-555555555555', holder: 'Bruno Téllez Nava' }
    expectRejected(evaluateSavedMethodEdit(SAVED_CARD, { holder: 'Bruno Téllez Nava', expiry: '12/28' }, [other], TODAY), null, 'ERR_SAVED_METHOD_DUPLICATE')
  })

  it('ED7: una débito editada para igualar a una crédito de la misma marca y cuatro últimos → ERR_SAVED_METHOD_DUPLICATE (RN-MET-06)', () => {
    const credit: SavedPaymentMethod = { ...SAVED_DEBIT_MC, id: '11111111-2222-4333-8444-555555555555', method: 'credit', holder: 'Ana Ríos', expiry: '12/29' }
    expectRejected(evaluateSavedMethodEdit(SAVED_DEBIT_MC, { holder: 'Ana Ríos', expiry: '12/29' }, [credit], TODAY), null, 'ERR_SAVED_METHOD_DUPLICATE')
  })

  it('ED6: método, marca y cuatro últimos no cambian', () => {
    const edited = evaluateSavedMethodEdit(SAVED_DEBIT_MC, { holder: 'Ana Ríos', expiry: '12/29' }, [], TODAY)
    expect(edited).toEqual({
      ok: true,
      method: { method: 'debit', brand: 'mastercard', last4: '4444', holder: 'Ana Ríos', expiry: '12/29' },
    })
  })
})

describe('isSavedMethodExpired', () => {
  it('XP1: 09/26 el 2026-10-13 está vencida', () => {
    expect(isSavedMethodExpired({ ...SAVED_CARD, expiry: '09/26' }, TODAY)).toBe(true)
  })
  it('XP2: 10/26 el 2026-10-13 no lo está (RN-PAG-07)', () => {
    expect(isSavedMethodExpired({ ...SAVED_CARD, expiry: '10/26' }, TODAY)).toBe(false)
  })
  it('XP3: 10/26 el 2026-11-01 sí', () => {
    expect(isSavedMethodExpired({ ...SAVED_CARD, expiry: '10/26' }, { year: 2026, month: 11, day: 1 })).toBe(true)
  })
  it('XP4: PayPal nunca vence', () => {
    expect(isSavedMethodExpired(SAVED_PAYPAL, { year: 2099, month: 1, day: 1 })).toBe(false)
  })
})

describe('evaluateSavedPayment', () => {
  it('SP1: método inexistente → savedMethod, ERR_SAVED_METHOD_UNAVAILABLE', () => {
    expectRejected(evaluateSavedPayment(null, '123', TODAY), 'savedMethod', 'ERR_SAVED_METHOD_UNAVAILABLE')
  })

  it('SP2: tarjeta 10/26 el 2026-11-01 → savedMethod, ERR_CARD_EXPIRED', () => {
    expectRejected(evaluateSavedPayment({ ...SAVED_CARD, expiry: '10/26' }, '123', { year: 2026, month: 11, day: 1 }), 'savedMethod', 'ERR_CARD_EXPIRED')
  })

  it('SP3: código 12 → securityCode', () => {
    expectRejected(evaluateSavedPayment(SAVED_CARD, '12', TODAY), 'securityCode', 'ERR_SECURITY_CODE_INVALID')
  })

  it('SP4: PayPal con código vacío → OK', () => {
    expect(evaluateSavedPayment(SAVED_PAYPAL, '', TODAY)).toEqual({ ok: true, payment: { method: 'paypal', email: 'ana.rios@example.com' } })
  })

  it('SP5: tarjeta válida → ************1111', () => {
    expect(evaluateSavedPayment(SAVED_CARD, '123', TODAY)).toEqual({
      ok: true,
      payment: { method: 'credit', brand: 'visa', maskedNumber: '************1111', holder: 'Ana Sofía Ríos Vela' },
    })
  })

  it('SP6: un titular guardado con otra regla se rechaza en savedMethod (defensa)', () => {
    expectRejected(evaluateSavedPayment({ ...SAVED_CARD, holder: 'Ana2' }, '123', TODAY), 'savedMethod', 'ERR_HOLDER_NOT_ALPHABETIC')
  })

  it('SP7: la expiración se evalúa antes que el código', () => {
    expectRejected(evaluateSavedPayment(SAVED_DEBIT_MC, '12', TODAY), 'savedMethod', 'ERR_CARD_EXPIRED')
  })

  it('SP8: evaluatePaymentRequest despacha entre las dos formas', () => {
    const entered: PaymentInput = { method: 'credit', cardNumber: '4111111111111111', holder: 'Ana Sofía Ríos Vela', expiry: '12/28', securityCode: '123', email: '' }
    expect(evaluatePaymentRequest(entered, TODAY)).toEqual(evaluatePayment(entered, TODAY))
    expect(evaluatePaymentRequest({ kind: 'saved', saved: SAVED_CARD, securityCode: '123' }, TODAY)).toEqual(evaluateSavedPayment(SAVED_CARD, '123', TODAY))
    expectRejected(evaluatePaymentRequest({ kind: 'saved', saved: null, securityCode: '' }, TODAY), 'savedMethod', 'ERR_SAVED_METHOD_UNAVAILABLE')
  })

  it('savedMaskedNumber es la máscara de maskCardNumber', () => {
    expect(savedMaskedNumber('4444')).toBe('************4444')
  })
})

// The universe of the payment.test.ts invariants, plus two Mastercards.
const NUMBERS = ['4111111111111111', '6011111111111117', '411111111111111', '4111111111111112', '4111-1111', '5555555555554444', '2221000000000009']
const HOLDERS = ['Ana Sofía Ríos Vela', '', 'Ana2']
const EXPIRIES = ['12/28', '09/26', '13/27']
const CODES = ['123', '12']
const EMAILS = ['ana@example.com', 'ana@']

const UNIVERSE: PaymentInput[] = PAYMENT_METHODS.flatMap((method) =>
  NUMBERS.flatMap((cardNumber) =>
    HOLDERS.flatMap((holder) =>
      EXPIRIES.flatMap((expiry) =>
        CODES.flatMap((securityCode) => EMAILS.map((email) => ({ method, cardNumber, holder, expiry, securityCode, email })))))))

describe('invariantes de métodos guardados', () => {
  it('INV18: guardar y pagar da el mismo resumen que pagar capturando', () => {
    let compared = 0
    for (const input of UNIVERSE) {
      const entered = evaluatePayment(input, TODAY)
      if (!entered.ok) continue
      const saved = evaluateNewSavedMethod(input, [], 0, TODAY)
      expect(saved.ok, JSON.stringify(input)).toBe(true)
      if (!saved.ok) continue
      const paid = evaluateSavedPayment(saved.method, input.securityCode, TODAY)
      expect(paid, JSON.stringify(input)).toEqual(entered)
      compared++
    }
    // Valid cards for debit and credit and valid emails for PayPal.
    expect(compared).toBeGreaterThan(10)
  })

  it('INV24: el límite diario no altera lo demás (RN-MET-10)', () => {
    const third: SavedPaymentMethodData = { ...SAVED_CARD, holder: 'Bruno Téllez Nava' }
    const existingSets: readonly (readonly SavedPaymentMethodData[])[] = [
      [],
      [SAVED_CARD],
      [SAVED_PAYPAL],
      [SAVED_CARD, SAVED_PAYPAL, third],
    ]
    const setRejections: readonly string[] = ['OK', 'ERR_SAVED_METHODS_LIMIT', 'ERR_SAVED_METHOD_DUPLICATE']
    let checked = 0
    for (const input of UNIVERSE) {
      for (const existing of existingSets) {
        const base = evaluateNewSavedMethod(input, existing, 0, TODAY)
        const label = `${JSON.stringify(input)} ${existing.length}`
        expect(evaluateNewSavedMethod(input, existing, 4, TODAY), label).toEqual(base)
        const baseCode = base.ok ? 'OK' : base.result.code
        for (const additionsToday of [5, 6]) {
          const limited = evaluateNewSavedMethod(input, existing, additionsToday, TODAY)
          if (setRejections.includes(baseCode)) {
            expectRejected(limited, null, 'ERR_SAVED_METHOD_DAILY_LIMIT')
          }
          else {
            expect(limited, label).toEqual(base)
          }
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('INV19: ningún resultado contiene el número completo ni el código de seguridad (RNF-15)', () => {
    for (const input of UNIVERSE) {
      const results = [
        evaluateNewSavedMethod(input, [], 0, TODAY),
        evaluateSavedMethodEdit(SAVED_CARD, { holder: input.holder, expiry: input.expiry }, [], TODAY),
        evaluateSavedPayment(SAVED_CARD, input.securityCode, TODAY),
      ]
      for (const result of results) {
        const text = JSON.stringify(result)
        if (input.cardNumber.length >= 15) expect(text).not.toContain(input.cardNumber)
        expect(text).not.toContain(`"${input.securityCode}"`)
      }
    }
  })
})

// RN-MET-04 against future changes, as MO1–MO3 guard RNF-11: the saved methods
// table has nowhere to store the full number or the code.

const SCHEMA = readFileSync(resolve(__dirname, '../server/db/schema.sql'), 'utf8')

function tableColumns(table: string): string[] {
  const match = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))
  if (!match) return []
  return match[1]!
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[a-z0-9_]+\s+(INTEGER|TEXT|BLOB)\b/.test(line))
    .map((line) => line.split(/\s+/)[0]!)
}

describe('esquema de payment_methods', () => {
  it('SC1: ninguna columna para el número ni el código de seguridad', () => {
    const columns = tableColumns('payment_methods')
    expect(columns).toEqual(['position', 'id', 'user_id', 'method', 'brand', 'last4', 'holder', 'expiry', 'email'])
    for (const column of columns) {
      expect(column, column).not.toMatch(/number|card|cvv|code|security/i)
    }
  })
})

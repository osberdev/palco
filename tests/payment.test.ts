import { describe, expect, it } from 'vitest'
import {
  evaluateCardNumber,
  evaluateEmail,
  evaluateExpiry,
  evaluateHolderName,
  evaluatePayment,
  evaluateSecurityCode,
  identifyBrand,
  luhnValid,
  maskCardNumber,
  PAYMENT_METHODS,
  type PaymentField,
  type PaymentInput,
} from '../server/domain/payment'
import { MESSAGES, type Result, type ResultCode } from '../server/domain/result'
import type { CalendarDate, CardBrand, PaymentMethod } from '../types'
import { formatCardSummary, PAYMENT_METHOD_LABELS } from '../utils/payment'
import { B63, EMAIL_ACCEPTED, L64, LONGEST } from './helpers/emails'

// The oracles come from compiling the legacy console implementation's payment
// validation and running it with today = 3/10/2026. Only the strict email grammar,
// the Unicode holder rule and the early brand prefix differ from it. Each case
// carries its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
const NEW_YEAR: CalendarDate = { year: 2026, month: 1, day: 1 }
const NONEXISTENT: CalendarDate = { year: 2026, month: 2, day: 30 }

describe('luhnValid', () => {
  it.each([
    ['LU1', '4111111111111111', true],
    ['LU2', '4111111111111112', false],
    ['LU3', '79927398713', true],
    ['LU4', '79927398710', false],
    ['LU5', '00', true],
    ['LU6', '0', false],
    ['LU7', '', false],
    ['LU8', '4111-1111', false],
  ] as const)('%s: %j → %s', (_, number, expected) => {
    expect(luhnValid(number)).toBe(expected)
  })
})

describe('identifyBrand', () => {
  it.each([
    ['BR1', '4', 'visa'],
    ['BR2', '4111111111111111', 'visa'],
    ['BR3', '51', 'mastercard'],
    ['BR4', '55', 'mastercard'],
    ['BR5', '50', null],
    ['BR6', '56', null],
    ['BR7', '2221', 'mastercard'],
    ['BR8', '2720', 'mastercard'],
    ['BR9', '2220', null],
    ['BR10', '2721', null],
    ['BR11', '222', null],
    ['BR12', '5', null],
    ['BR13', '6011111111111117', null],
    ['BR14', '', null],
    ['BR15', '4a', null],
  ] as const)('%s: %j → %s', (_, number, expected) => {
    expect(identifyBrand(number)).toBe(expected)
  })
})

describe('evaluateCardNumber — estructura, marca, longitud, Luhn', () => {
  it.each([
    ['CA1', '4111111111111111', 'visa'],
    ['CA2', '5555555555554444', 'mastercard'],
    ['CA3', '2221000000000009', 'mastercard'],
    ['CA4', '2720999999999996', 'mastercard'],
    ['CA5', '5100000000000008', 'mastercard'],
    ['CA6', '5599999999999997', 'mastercard'],
    ['CA7', '4000000000000002', 'visa'],
  ] as const)('%s: %j acepta %s', (_, number, brand) => {
    expect(evaluateCardNumber(number)).toEqual({ ok: true, value: brand })
  })

  it.each([
    ['CA8', '4111-1111-1111-1111', 'ERR_CARD_NOT_NUMERIC'],
    ['CA9', '4111 1111 1111 1111', 'ERR_CARD_NOT_NUMERIC'],
    ['CA10', '', 'ERR_CARD_NOT_NUMERIC'],
    ['CA11', ' 4111111111111111', 'ERR_CARD_NOT_NUMERIC'],
    ['CA12', '４111111111111111', 'ERR_CARD_NOT_NUMERIC'],
    ['CA13', '6011111111111117', 'ERR_CARD_BRAND_REJECTED'],
    ['CA14', '378282246310005', 'ERR_CARD_BRAND_REJECTED'],
    ['CA15', '2220999999999999', 'ERR_CARD_BRAND_REJECTED'],
    ['CA16', '2721000000000000', 'ERR_CARD_BRAND_REJECTED'],
    ['CA17', '6011', 'ERR_CARD_BRAND_REJECTED'],
    ['CA18', '411111111111111', 'ERR_CARD_LENGTH'],
    ['CA19', '41111111111111111', 'ERR_CARD_LENGTH'],
    ['CA20', '4111', 'ERR_CARD_LENGTH'],
    ['CA21', '4', 'ERR_CARD_LENGTH'],
    ['CA22', '411', 'ERR_CARD_LENGTH'],
    ['CA23', '6', 'ERR_CARD_LENGTH'],
    ['CA24', '00', 'ERR_CARD_LENGTH'],
    ['CA25', '4111111111111112', 'ERR_CARD_LUHN'],
  ] as const)('%s: %j → %s', (_, number, code) => {
    const checked = evaluateCardNumber(number)
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(checked.result.code).toBe(code)
  })
})

describe('evaluateHolderName — letras Unicode, espacio, apóstrofos y guion', () => {
  it.each([
    ['HO1', 'Ana Sofía Ríos Vela'],
    ['HO2', 'Bruno Téllez Nava'],
    ['HO3', 'Ana Sofia Rios Vela'],
    ['HO4', "O'Neil"],
    ['HO5', 'O’Neil'],
    ['HO6', 'Jean-Luc'],
    ['HO7', 'Peña Ñúñez'],
    ['HO8', 'Müller'],
    ['HO9', 'Ri\u0301os'],
    ['HO10', 'Ana  '],
  ] as const)('%s: %j → OK', (_, name) => {
    expect(evaluateHolderName(name).code).toBe('OK')
  })

  it.each([
    ['HO11', '', 'ERR_HOLDER_EMPTY'],
    ['HO12', '   ', 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['HO13', "'-", 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['HO14', 'Ana2', 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['HO15', 'Ana.', 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['HO16', 'Ana\tLópez', 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['HO17', 'Ana 😀', 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['HO18', '\u0301', 'ERR_HOLDER_NOT_ALPHABETIC'],
  ] as const)('%s: %j → %s', (id, name, code) => {
    const result = evaluateHolderName(name)
    expect(result.code).toBe(code)
    if (id !== 'HO18') expect(result.message).toBe(MESSAGES[code])
  })
})

describe('evaluateExpiry — MM/AA, válida todo su mes', () => {
  it.each([
    ['EX1', '10/26', TODAY, 'OK'],
    ['EX2', '09/26', TODAY, 'ERR_CARD_EXPIRED'],
    ['EX3', '12/28', TODAY, 'OK'],
    ['EX4', '01/27', TODAY, 'OK'],
    ['EX5', '12/25', TODAY, 'ERR_CARD_EXPIRED'],
    ['EX6', '13/27', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX7', '00/27', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX8', '1/27', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX9', '10/2026', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX10', '10-26', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX11', '', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX12', ' 10/26', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX13', 'ab/cd', TODAY, 'ERR_EXPIRY_FORMAT'],
    ['EX14', '10/99', TODAY, 'OK'],
    ['EX15', '10/00', TODAY, 'ERR_CARD_EXPIRED'],
    ['EX16', '12/25', NEW_YEAR, 'ERR_CARD_EXPIRED'],
    ['EX17', '01/26', NEW_YEAR, 'OK'],
    ['EX18', '10/26', NONEXISTENT, 'ERR_DATE_INVALID'],
    ['EX19', '13/27', NONEXISTENT, 'ERR_EXPIRY_FORMAT'],
  ] as const)('%s: %j con hoy %o → %s', (_, text, today, code) => {
    expect(evaluateExpiry(text, today).code).toBe(code)
  })
})

describe('evaluateSecurityCode — tres dígitos', () => {
  it.each([
    ['SC1', '123', 'OK'],
    ['SC2', '000', 'OK'],
    ['SC3', '12', 'ERR_SECURITY_CODE_INVALID'],
    ['SC4', '1234', 'ERR_SECURITY_CODE_INVALID'],
    ['SC5', '', 'ERR_SECURITY_CODE_INVALID'],
    ['SC6', '12a', 'ERR_SECURITY_CODE_INVALID'],
    ['SC7', ' 123', 'ERR_SECURITY_CODE_INVALID'],
  ] as const)('%s: %j → %s', (_, text, code) => {
    expect(evaluateSecurityCode(text).code).toBe(code)
  })
})

/** Rejected by the legacy console implementation as well. */
const EMAIL_REJECTED_BY_LEGACY: readonly (readonly [string, string])[] = [
  ['EM12', 'ana@'],
  ['EM13', ''],
  ['EM14', 'ana'],
  ['EM15', '@example.com'],
  ['EM16', 'ana@@example.com'],
  ['EM17', 'ana@ex@ample.com'],
  ['EM18', 'ana@.com'],
  ['EM19', 'ana@example'],
  ['EM20', 'ana@example.'],
]

/** Rejected by the strict grammar; the legacy console implementation accepted them. */
const EMAIL_REJECTED_BY_STRICT_GRAMMAR: readonly (readonly [string, string])[] = [
  ['EM21', 'ana sofia@example.com'],
  ['EM22', ' ana@example.com'],
  ['EM23', 'ana@example.com '],
  ['EM24', 'ana@example..com'],
  ['EM25', 'ana..b@example.com'],
  ['EM26', '.ana@example.com'],
  ['EM27', 'ana.@example.com'],
  ['EM28', 'ana@example.com.'],
  ['EM29', 'ana@-example.com'],
  ['EM30', 'ana@example-.com'],
  ['EM31', 'ana@example.c'],
  ['EM32', 'ana@example.c0m'],
  ['EM33', 'ana@ex_ample.com'],
  ['EM34', 'josé@example.com'],
  ['EM35', 'ana@exámple.com'],
  ['EM36', 'ana,b@example.com'],
  ['EM37', `a${L64}@example.com`],
  ['EM38', `ana@b${B63}.com`],
  ['EM39', `${L64}@${B63}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`],
]

/** The reason for each rejection in EM12–EM39 (RN-PAG-11). */
const EMAIL_REASON: Readonly<Record<string, ResultCode>> = {
  EM13: 'ERR_EMAIL_EMPTY',
  EM21: 'ERR_EMAIL_HAS_SPACE',
  EM22: 'ERR_EMAIL_HAS_SPACE',
  EM23: 'ERR_EMAIL_HAS_SPACE',
  EM34: 'ERR_EMAIL_NOT_ASCII',
  EM35: 'ERR_EMAIL_NOT_ASCII',
  EM39: 'ERR_EMAIL_TOO_LONG',
  EM14: 'ERR_EMAIL_AT_SIGN',
  EM16: 'ERR_EMAIL_AT_SIGN',
  EM17: 'ERR_EMAIL_AT_SIGN',
  EM15: 'ERR_EMAIL_LOCAL_PART',
  EM25: 'ERR_EMAIL_LOCAL_PART',
  EM26: 'ERR_EMAIL_LOCAL_PART',
  EM27: 'ERR_EMAIL_LOCAL_PART',
  EM36: 'ERR_EMAIL_LOCAL_PART',
  EM37: 'ERR_EMAIL_LOCAL_PART',
  EM12: 'ERR_EMAIL_DOMAIN',
  EM18: 'ERR_EMAIL_DOMAIN',
  EM20: 'ERR_EMAIL_DOMAIN',
  EM24: 'ERR_EMAIL_DOMAIN',
  EM28: 'ERR_EMAIL_DOMAIN',
  EM29: 'ERR_EMAIL_DOMAIN',
  EM30: 'ERR_EMAIL_DOMAIN',
  EM33: 'ERR_EMAIL_DOMAIN',
  EM38: 'ERR_EMAIL_DOMAIN',
  EM19: 'ERR_EMAIL_TLD',
  EM31: 'ERR_EMAIL_TLD',
  EM32: 'ERR_EMAIL_TLD',
}

/**
 * A transcription of the legacy console implementation's email check. It lives
 * only here: it is the oracle of EM40, not a system rule.
 */
function legacyEmailAccepts(text: string): boolean {
  if (text.length === 0) return false
  const at = text.indexOf('@')
  if (at <= 0) return false
  if (text.indexOf('@', at + 1) !== -1) return false
  const dot = text.indexOf('.', at + 1)
  if (dot === -1 || dot === at + 1 || dot === text.length - 1) return false
  return true
}

/**
 * A transcription of the earlier single-code `evaluateEmail`. It lives only here:
 * it is the oracle of INV26, which pins that splitting the rejection by reason did
 * not change what is accepted.
 */
function previousEmailAccepts(text: string): boolean {
  if (text.length < 1 || text.length > 254) return false
  const parts = text.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts as [string, string]
  if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false
  return /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(domain)
}

describe('evaluateEmail — subconjunto de RFC 5322', () => {
  it.each(EMAIL_ACCEPTED)('%s: %j → OK', (_, text) => {
    expect(evaluateEmail(text).code).toBe('OK')
  })

  // Each rejection carries its own rule's code, in the order of RN-PAG-11. The input
  // does not change.
  it.each([...EMAIL_REJECTED_BY_LEGACY, ...EMAIL_REJECTED_BY_STRICT_GRAMMAR])('%s: %j → su motivo', (id, text) => {
    const result = evaluateEmail(text)
    const expected = EMAIL_REASON[id]
    expect(expected, id).toBeDefined()
    expect(result.code).toBe(expected)
    expect(result.message).toBe(MESSAGES[expected!])
  })

  it.each([
    ['EM41', 'josé @example.com', 'ERR_EMAIL_HAS_SPACE'],
    ['EM42', 'josé@@example.com', 'ERR_EMAIL_NOT_ASCII'],
    ['EM43', 'a'.repeat(255), 'ERR_EMAIL_TOO_LONG'],
    ['EM44', '.ana@example', 'ERR_EMAIL_LOCAL_PART'],
    ['EM45', 'ana@-example', 'ERR_EMAIL_DOMAIN'],
    ['EM46', 'ana\t@example.com', 'ERR_EMAIL_HAS_SPACE'],
    // A non-breaking space, U+00A0: both a space and non-ASCII; the space wins.
    ['EM47', 'ana\u00A0@example.com', 'ERR_EMAIL_HAS_SPACE'],
    ['EM48', `ana@example.${'c'.repeat(64)}`, 'ERR_EMAIL_TLD'],
  ] as const)('%s: %j → %s (orden)', (_id, text, code: ResultCode) => {
    expect(evaluateEmail(text).code).toBe(code)
  })

  it('EM40: todo lo que acepta evaluateEmail lo acepta la implementación de consola anterior, y la gramática estricta solo añade los rechazos EM21–EM39', () => {
    // The length inputs measure what they claim.
    expect(LONGEST).toHaveLength(254)
    expect(EMAIL_REJECTED_BY_STRICT_GRAMMAR.at(-1)?.[1]).toHaveLength(255)

    const all = [...EMAIL_ACCEPTED, ...EMAIL_REJECTED_BY_LEGACY, ...EMAIL_REJECTED_BY_STRICT_GRAMMAR]
    for (const [id, text] of all) {
      if (evaluateEmail(text).ok) expect(legacyEmailAccepts(text), id).toBe(true)
    }
    for (const [id, text] of EMAIL_ACCEPTED) expect(legacyEmailAccepts(text), id).toBe(true)
    for (const [id, text] of EMAIL_REJECTED_BY_LEGACY) expect(legacyEmailAccepts(text), id).toBe(false)
    for (const [id, text] of EMAIL_REJECTED_BY_STRICT_GRAMMAR) expect(legacyEmailAccepts(text), id).toBe(true)
  })

  it('INV26: el reparto por motivo no cambia qué se acepta', () => {
    const locals = ['ana', 'a.b', "o'neil", '', L64, `a${L64}`, '.ana', 'ana.', 'ana..b', 'ana sofia', 'muñoz', 'ana,b', 'a+b']
    const domains = [
      'example.com', 'sub.example.com.mx', '', 'example', '.example.com', 'example.com.', 'example..com',
      '-example.com', 'example-.com', 'ex_ample.com', 'exámple.com', 'example.c', 'example.co',
      `example.${'c'.repeat(64)}`, 'example.c0m', `${B63}.com`, `b${B63}.com`, 'mi-dominio.mx',
    ]
    const inputs = locals.flatMap((local) => domains.flatMap((domain) => [
      `${local}@${domain}`,
      `${local}${domain}`,
      `${local}@@${domain}`,
      `${local}@x@${domain}`,
    ]))
    inputs.push(LONGEST, `${LONGEST}a`, `a${LONGEST}`)
    for (const text of inputs) {
      expect(evaluateEmail(text).ok, JSON.stringify(text)).toBe(previousEmailAccepts(text))
    }
    expect(inputs.length).toBeGreaterThan(900)
  })
})

describe('maskCardNumber', () => {
  it.each([
    ['MK1', '4111111111111111', '************1111'],
    ['MK2', '5555555555554444', '************4444'],
    ['MK3', '1234', '1234'],
    ['MK4', '', ''],
    ['MK5', '12345', '*2345'],
  ] as const)('%s: %j → %j', (_, number, masked) => {
    expect(maskCardNumber(number)).toBe(masked)
  })
})

/** Base Y: credit, with a sample card and holder. */
const BASE: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '123',
  email: '',
}

const PAYPAL: PaymentInput = { ...BASE, method: 'paypal', cardNumber: 'abc', email: 'ana@example.com' }

describe('evaluatePayment — orden de capturar_pago (RN-PAG-10)', () => {
  it('PY1: base Y', () => {
    expect(evaluatePayment(BASE, TODAY)).toEqual({
      ok: true,
      payment: { method: 'credit', brand: 'visa', maskedNumber: '************1111', holder: 'Ana Sofía Ríos Vela' },
    })
  })

  it('PY2: débito se valida igual que crédito', () => {
    const selection = evaluatePayment({ ...BASE, method: 'debit' }, TODAY)
    expect(selection.ok && selection.payment.method).toBe('debit')
  })

  it('PY3: Mastercard', () => {
    expect(evaluatePayment({ ...BASE, cardNumber: '5555555555554444' }, TODAY)).toEqual({
      ok: true,
      payment: { method: 'credit', brand: 'mastercard', maskedNumber: '************4444', holder: 'Ana Sofía Ríos Vela' },
    })
  })

  it('PY4: PayPal ignora los campos de tarjeta', () => {
    expect(evaluatePayment(PAYPAL, TODAY)).toEqual({ ok: true, payment: { method: 'paypal', email: 'ana@example.com' } })
  })

  it.each([
    ['PY5', { ...PAYPAL, email: 'ana@' }, TODAY, 'email', 'ERR_EMAIL_DOMAIN'],
    ['PY6', { ...PAYPAL, email: '' }, TODAY, 'email', 'ERR_EMAIL_EMPTY'],
    ['PY7', { ...BASE, cardNumber: '6011111111111117', holder: '' }, TODAY, 'cardNumber', 'ERR_CARD_BRAND_REJECTED'],
    ['PY8', { ...BASE, holder: '', expiry: '13/27' }, TODAY, 'holder', 'ERR_HOLDER_EMPTY'],
    ['PY9', { ...BASE, holder: 'Ana2' }, TODAY, 'holder', 'ERR_HOLDER_NOT_ALPHABETIC'],
    ['PY10', { ...BASE, expiry: '09/26', securityCode: '12' }, TODAY, 'expiry', 'ERR_CARD_EXPIRED'],
    ['PY11', { ...BASE, securityCode: '12' }, TODAY, 'securityCode', 'ERR_SECURITY_CODE_INVALID'],
    ['PY13', { ...BASE, method: 'cash' as unknown as PaymentMethod }, TODAY, 'method', 'ERR_INPUT_INVALID'],
    ['PY14', { ...BASE, cardNumber: '411' }, TODAY, 'cardNumber', 'ERR_CARD_LENGTH'],
    ['PY16', BASE, NONEXISTENT, 'expiry', 'ERR_DATE_INVALID'],
    ['PY17', { ...PAYPAL, email: 'ana sofia@example.com' }, TODAY, 'email', 'ERR_EMAIL_HAS_SPACE'],
  ] as const)('%s → %s, %s', (_, input, today, field, code) => {
    const selection = evaluatePayment(input, today)
    expect(selection.ok).toBe(false)
    if (!selection.ok) {
      expect(selection.field).toBe(field)
      expect(selection.result.code).toBe(code)
    }
  })

  it('PY12: con tarjeta el correo se ignora', () => {
    expect(evaluatePayment({ ...BASE, email: 'ana@' }, TODAY).ok).toBe(true)
  })

  it('PY15: el resultado nunca lleva el número completo (RNF-15)', () => {
    expect(JSON.stringify(evaluatePayment(BASE, TODAY))).not.toContain('4111111111111111')
  })
})

describe('invariantes de pago', () => {
  const NUMBERS = ['4111111111111111', '6011111111111117', '411111111111111', '4111111111111112', '4111-1111']
  const HOLDERS = ['Ana Sofía Ríos Vela', '', 'Ana2']
  const EXPIRIES = ['12/28', '09/26', '13/27']
  const CODES = ['123', '12']
  const EMAILS = ['ana@example.com', 'ana@']

  const UNIVERSE: PaymentInput[] = PAYMENT_METHODS.flatMap((method) =>
    NUMBERS.flatMap((cardNumber) =>
      HOLDERS.flatMap((holder) =>
        EXPIRIES.flatMap((expiry) =>
          CODES.flatMap((securityCode) =>
            EMAILS.map((email) => ({ method, cardNumber, holder, expiry, securityCode, email })),
          ),
        ),
      ),
    ),
  )

  const CARD_OK: Result = { ok: true, code: 'OK', message: MESSAGES.OK }

  function fieldResults(input: PaymentInput): Partial<Record<PaymentField, Result>> {
    if (input.method === 'paypal') return { email: evaluateEmail(input.email) }
    const card = evaluateCardNumber(input.cardNumber)
    return {
      cardNumber: card.ok ? CARD_OK : card.result,
      holder: evaluateHolderName(input.holder),
      expiry: evaluateExpiry(input.expiry, TODAY),
      securityCode: evaluateSecurityCode(input.securityCode),
    }
  }

  it('INV9: la compuesta da OK si y solo si los campos de su método dan OK', () => {
    expect(UNIVERSE).toHaveLength(540)
    for (const input of UNIVERSE) {
      const fieldsOk = Object.values(fieldResults(input)).every((result) => result.ok)
      expect(evaluatePayment(input, TODAY).ok, JSON.stringify(input)).toBe(fieldsOk)
    }
  })

  it('INV10: el motivo de la compuesta es el del evaluador de su campo', () => {
    for (const input of UNIVERSE) {
      const selection = evaluatePayment(input, TODAY)
      if (selection.ok) continue
      const field = fieldResults(input)[selection.field]
      expect(field?.code, JSON.stringify(input)).toBe(selection.result.code)
    }
  })
})

describe('utils/payment', () => {
  it('PL1: nombres de metodo_nombre con la ortografía restaurada', () => {
    expect(PAYMENT_METHODS.map((method) => PAYMENT_METHOD_LABELS[method])).toEqual([
      'Tarjeta de débito',
      'Tarjeta de crédito',
      'PayPal',
    ])
  })

  it('PL2: resumen de la tarjeta con el número enmascarado y la marca', () => {
    const brand: CardBrand = 'visa'
    expect(formatCardSummary('************1111', brand)).toBe('************1111 (Visa)')
  })
})

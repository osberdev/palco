import { describe, expect, it } from 'vitest'
import {
  CROCKFORD_ALPHABET,
  QR_VERSION,
  TICKET_ID_BYTES,
  decodeBase32,
  encodeBase32,
  formatQrPayload,
  formatShortCode,
  issueTickets,
  parseQrPayload,
  signedMessage,
} from '../server/domain/ticket'

// Short code and QR content of each ticket (RN-BOL-01 and 02). Each case carries
// its identifier in its name.

/** Deterministic bytes: the same vector on every run. */
function vector(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index++) bytes[index] = (seed * 37 + index * 11 + ((seed * index) % 7)) % 256
  return bytes
}

const ZEROS = new Uint8Array(TICKET_ID_BYTES)
const ONES = new Uint8Array(TICKET_ID_BYTES).fill(0xff)
const SIGNATURE = vector(64, 3)

function decoded(text: string, byteLength: number): Uint8Array | null {
  const result = decodeBase32(text, byteLength)
  return result.ok ? result.value : null
}

function code(result: { readonly ok: true } | { readonly ok: false; readonly result: { readonly code: string } }): string {
  return result.ok ? 'OK' : result.result.code
}

describe('base32 de Crockford', () => {
  it('BT1: el alfabeto tiene 32 caracteres sin I, L, O ni U', () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32)
    expect(new Set(CROCKFORD_ALPHABET).size).toBe(32)
    for (const excluded of ['I', 'L', 'O', 'U']) expect(CROCKFORD_ALPHABET).not.toContain(excluded)
  })

  it('BT2: 10 bytes en cero y en 0xFF', () => {
    expect(encodeBase32(ZEROS)).toBe('0000000000000000')
    expect(encodeBase32(ONES)).toBe('ZZZZZZZZZZZZZZZZ')
  })

  it('BT3: ida y vuelta con 20 vectores de 10 bytes y 5 de 64', () => {
    for (let seed = 0; seed < 20; seed++) {
      const bytes = vector(10, seed)
      const text = encodeBase32(bytes)
      expect(text).toHaveLength(16)
      expect(decoded(text, 10)).toEqual(bytes)
    }
    for (let seed = 0; seed < 5; seed++) {
      const bytes = vector(64, seed)
      const text = encodeBase32(bytes)
      expect(text).toHaveLength(103)
      expect(decoded(text, 64)).toEqual(bytes)
    }
  })

  it('BT4: sustituciones y rechazos al decodificar', () => {
    expect(decoded('oooo-oooo-oooo-oooo', 10)).toEqual(ZEROS)
    expect(decoded('zzzzzzzzzzzzzzzz', 10)).toEqual(ONES)
    expect(decoded('IIIIIIIIIIIIIIII', 10)).toEqual(decoded('1111111111111111', 10))
    expect(decoded('llllLLLLiiiiIIII', 10)).toEqual(decoded('1111111111111111', 10))
    expect(decoded('1111111111111111', 10)).not.toBeNull()

    expect(code(decodeBase32('U000000000000000', 10))).toBe('ERR_INPUT_INVALID')
    expect(code(decodeBase32('*000000000000000', 10))).toBe('ERR_INPUT_INVALID')
    expect(code(decodeBase32('000000000000000', 10))).toBe('ERR_INPUT_INVALID')
    expect(code(decodeBase32('00000000000000000', 10))).toBe('ERR_INPUT_INVALID')

    // 64 bytes are 512 bits in 103 characters, 515 bits: the last 3 are padding. With
    // 10 bytes there is no padding, because 80 is a multiple of 5.
    const zeros64 = '0'.repeat(103)
    expect(decoded(zeros64, 64)).toEqual(new Uint8Array(64))
    expect(code(decodeBase32(`${'0'.repeat(102)}1`, 64))).toBe('ERR_INPUT_INVALID')
    expect(code(decodeBase32(`${'0'.repeat(102)}8`, 64))).toBe('OK')
  })
})

describe('código corto', () => {
  it('BT5: cuatro grupos de cuatro, y un id de 9 u 11 bytes se rechaza', () => {
    const result = formatShortCode(vector(10, 7))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(result.value.replaceAll('-', '')).toBe(encodeBase32(vector(10, 7)))
    expect(formatShortCode(ZEROS)).toEqual({ ok: true, value: '0000-0000-0000-0000' })

    expect(code(formatShortCode(vector(9, 7)))).toBe('ERR_INPUT_INVALID')
    expect(code(formatShortCode(vector(11, 7)))).toBe('ERR_INPUT_INVALID')
  })
})

describe('contenido del QR', () => {
  it('BT6: 123 caracteres de [0-9A-Z.], ida y vuelta', () => {
    const id = vector(10, 5)
    const payload = formatQrPayload(id, SIGNATURE)
    expect(payload.ok).toBe(true)
    if (!payload.ok) return
    expect(payload.value).toHaveLength(123)
    expect(payload.value).toMatch(/^[0-9A-Z.]+$/)
    expect(payload.value.startsWith(`${QR_VERSION}.`)).toBe(true)

    const parsed = parseQrPayload(payload.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.id).toEqual(id)
    expect(parsed.value.signature).toEqual(SIGNATURE)
  })

  it('BT7: contenido mal formado', () => {
    const id = encodeBase32(vector(10, 5))
    const signature = encodeBase32(SIGNATURE)
    expect(code(parseQrPayload(`P1.${id}.${signature}`))).toBe('OK')

    expect(code(parseQrPayload(`P2.${id}.${signature}`))).toBe('ERR_INPUT_INVALID')
    expect(code(parseQrPayload(`P1.${id}`))).toBe('ERR_INPUT_INVALID')
    expect(code(parseQrPayload(`P1.${id}.${signature}.00`))).toBe('ERR_INPUT_INVALID')
    expect(code(parseQrPayload(`P1.${id}.${encodeBase32(vector(63, 3))}`))).toBe('ERR_INPUT_INVALID')

    expect(code(formatQrPayload(vector(10, 5), vector(63, 3)))).toBe('ERR_INPUT_INVALID')
    expect(code(formatQrPayload(vector(9, 5), SIGNATURE))).toBe('ERR_INPUT_INVALID')
  })

  it('BT8: lo que se firma es P1. y el id en base32', () => {
    const id = vector(10, 9)
    const message = signedMessage(id)
    expect(message.ok).toBe(true)
    if (!message.ok) return
    expect(new TextDecoder().decode(message.value)).toBe(`P1.${encodeBase32(id)}`)
    expect(code(signedMessage(vector(11, 9)))).toBe('ERR_INPUT_INVALID')
  })
})

describe('emisión', () => {
  it('BT9: issueTickets', () => {
    const ids = [vector(10, 1), vector(10, 2), vector(10, 3)]
    expect(code(issueTickets(2, ids))).toBe('ERR_INPUT_INVALID')
    expect(code(issueTickets(3, [ids[0]!, vector(9, 2), ids[2]!]))).toBe('ERR_INPUT_INVALID')
    expect(code(issueTickets(3, [ids[0]!, ids[1]!, vector(10, 1)]))).toBe('ERR_INPUT_INVALID')
    expect(code(issueTickets(0, []))).toBe('ERR_INPUT_INVALID')
    expect(code(issueTickets(2.5, ids.slice(0, 2)))).toBe('ERR_INPUT_INVALID')

    const issued = issueTickets(3, ids)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.value).toEqual(ids)
  })
})

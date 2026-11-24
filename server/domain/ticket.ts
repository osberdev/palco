import { accept, err, reject, type Checked } from './result'

/**
 * Identifier, short code and QR content of each ticket (RN-BOL-01 and 02). No
 * randomness and no clock: the endpoint generates the identifier and
 * `server/utils/ticket-signing.ts`, which holds the key, computes the signature.
 */

/** 80 bits (RN-BOL-01): they fit in 16 characters that can be typed by hand. */
export const TICKET_ID_BYTES = 10

/** Crockford base32: no I, L, O or U, which are easily confused when read. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const QR_VERSION = 'P1'

const SIGNATURE_BYTES = 64
const BITS_PER_CHARACTER = 5

/** Length in characters of `byteLength` encoded bytes. */
function encodedLength(byteLength: number): number {
  return Math.ceil((byteLength * 8) / BITS_PER_CHARACTER)
}

/**
 * Bits from left to right, 5 per character; missing bits at the end are padded
 * with zeros. 10 bytes give 16 characters without padding; 64 give 103 with 3
 * padding bits.
 */
export function encodeBase32(bytes: Uint8Array): string {
  let text = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= BITS_PER_CHARACTER) {
      bits -= BITS_PER_CHARACTER
      text += CROCKFORD_ALPHABET[(buffer >> bits) & 0b11111]
      buffer &= (1 << bits) - 1
    }
  }
  if (bits > 0) text += CROCKFORD_ALPHABET[(buffer << (BITS_PER_CHARACTER - bits)) & 0b11111]
  return text
}

/** Crockford's substitutions, for a code typed by hand. */
function normalizeCrockford(text: string): string {
  return text.replaceAll('-', '').toUpperCase().replaceAll(/[IL]/g, '1').replaceAll('O', '0')
}

/**
 * The inverse of `encodeBase32`, with Crockford's substitutions. No check digit:
 * the short code is protected by its 80 bits. Non-zero padding bits are rejected
 * so that each value has exactly one spelling.
 */
export function decodeBase32(text: string, byteLength: number): Checked<Uint8Array> {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) return reject(err('ERR_INPUT_INVALID'))
  const normalized = normalizeCrockford(text)
  if (normalized.length !== encodedLength(byteLength)) return reject(err('ERR_INPUT_INVALID'))

  const bytes = new Uint8Array(byteLength)
  let buffer = 0
  let bits = 0
  let written = 0
  for (const character of normalized) {
    const value = CROCKFORD_ALPHABET.indexOf(character)
    if (value < 0) return reject(err('ERR_INPUT_INVALID'))
    buffer = (buffer << BITS_PER_CHARACTER) | value
    bits += BITS_PER_CHARACTER
    if (bits >= 8) {
      bits -= 8
      bytes[written++] = (buffer >> bits) & 0xff
      buffer &= (1 << bits) - 1
    }
  }
  if (buffer !== 0) return reject(err('ERR_INPUT_INVALID'))
  return accept(bytes)
}

/** `XXXX-XXXX-XXXX-XXXX`, the code printed under the QR (RN-BOL-01). */
export function formatShortCode(id: Uint8Array): Checked<string> {
  if (id.length !== TICKET_ID_BYTES) return reject(err('ERR_INPUT_INVALID'))
  const text = encodeBase32(id)
  return accept(`${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}`)
}

/** What gets signed: the version and the identifier (RN-BOL-02). */
export function signedMessage(id: Uint8Array): Checked<Uint8Array> {
  if (id.length !== TICKET_ID_BYTES) return reject(err('ERR_INPUT_INVALID'))
  return accept(new TextEncoder().encode(`${QR_VERSION}.${encodeBase32(id)}`))
}

/**
 * `P1.{id}.{signature}`, 123 characters of `[0-9A-Z.]`: the QR uses alphanumeric
 * mode, denser than byte mode. No folio and no personal data (RN-BOL-02).
 */
export function formatQrPayload(id: Uint8Array, signature: Uint8Array): Checked<string> {
  if (id.length !== TICKET_ID_BYTES || signature.length !== SIGNATURE_BYTES) return reject(err('ERR_INPUT_INVALID'))
  return accept(`${QR_VERSION}.${encodeBase32(id)}.${encodeBase32(signature)}`)
}

export interface QrPayload {
  readonly id: Uint8Array
  readonly signature: Uint8Array
}

/**
 * The strict inverse of `formatQrPayload`: it only accepts the spelling that
 * function produces, without Crockford's substitutions, which are for codes typed
 * by hand, not for a QR. It does not verify the signature: the domain has no key.
 */
export function parseQrPayload(text: string): Checked<QrPayload> {
  const parts = text.split('.')
  if (parts.length !== 3 || parts[0] !== QR_VERSION) return reject(err('ERR_INPUT_INVALID'))

  const id = decodeBase32(parts[1]!, TICKET_ID_BYTES)
  const signature = decodeBase32(parts[2]!, SIGNATURE_BYTES)
  if (!id.ok || !signature.ok) return reject(err('ERR_INPUT_INVALID'))

  const canonical = formatQrPayload(id.value, signature.value)
  if (!canonical.ok || canonical.value !== text) return reject(err('ERR_INPUT_INVALID'))
  return accept({ id: id.value, signature: signature.value })
}

/**
 * The ticket identifiers of a purchase, one per ticket and in order. Duplicates
 * are rejected: the same QR cannot designate two tickets.
 */
export function issueTickets(quantity: number, ids: readonly Uint8Array[]): Checked<readonly Uint8Array[]> {
  if (!Number.isInteger(quantity) || quantity < 1 || ids.length !== quantity) return reject(err('ERR_INPUT_INVALID'))
  if (ids.some((id) => id.length !== TICKET_ID_BYTES)) return reject(err('ERR_INPUT_INVALID'))
  if (new Set(ids.map(encodeBase32)).size !== ids.length) return reject(err('ERR_INPUT_INVALID'))
  return accept([...ids])
}

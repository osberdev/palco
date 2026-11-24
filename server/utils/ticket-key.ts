import { createTicketSigner, TICKET_SEED_BYTES } from './ticket-signing'

/**
 * `NUXT_TICKET_SIGNING_KEY`: the 32-byte Ed25519 seed in base64, 44 characters
 * with the trailing `=`, as `openssl rand -base64 32` prints it. It is read from
 * `process.env` as text, like the Meta variables.
 *
 * The shape is checked with a regular expression rather than by decoding:
 * `Buffer.from(text, 'base64')` silently skips foreign characters. Not trimmed: a
 * space or a line break means a badly copied key, not the same key.
 */
export type TicketSigningKey =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok', readonly seed: Uint8Array }
  | { readonly kind: 'invalid' }

const SEED_BASE64 = /^[A-Za-z0-9+/]{43}=$/

/** Any ticket id, for the test signature. */
const PROBE_ID = new Uint8Array(10)

export function parseTicketSigningKey(text: string | undefined): TicketSigningKey {
  if (text === undefined || text === '') return { kind: 'absent' }
  if (!SEED_BASE64.test(text)) return { kind: 'invalid' }

  const seed = new Uint8Array(Buffer.from(text, 'base64'))
  // With the regular expression it is always 32 bytes; the check stays as a safeguard.
  if (seed.length !== TICKET_SEED_BYTES) return { kind: 'invalid' }

  // That Node imports it and that it signs and verifies: what the server will do with it.
  try {
    const signer = createTicketSigner(seed)
    if (!signer.verify(PROBE_ID, signer.sign(PROBE_ID))) return { kind: 'invalid' }
  }
  catch {
    return { kind: 'invalid' }
  }
  return { kind: 'ok', seed }
}

/** Without the value: neither the warning nor the error repeats it. */
export const TICKET_KEY_ABSENT_WARNING
  = '[palco] NUXT_TICKET_SIGNING_KEY no está definida: los QR de los boletos valen solo en esta ejecución (RN-BOL-03).'

export function ticketKeyInvalidMessage(): string {
  return 'NUXT_TICKET_SIGNING_KEY no es una clave válida: debe ser la semilla de 32 bytes en base64, de 44 caracteres. '
    + 'Genera una con: printf \'\\nNUXT_TICKET_SIGNING_KEY=%s\\n\' "$(openssl rand -base64 32)" >> .env'
}

import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * `NUXT_GATE_PIN` (RN-ACC-01): the gate PIN, with no default. It is read from
 * `process.env` as text, like the Meta variables: `destr` would turn a digits-only
 * PIN into a number.
 *
 * 6 to 64 printable ASCII characters, no spaces. Not trimmed: a space means a
 * badly copied PIN. Outside the rule the gate is disabled (it fails closed) and
 * the server keeps running: purchasing does not depend on the gate.
 */
export type GatePin =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok', readonly pin: string }
  | { readonly kind: 'invalid' }

const PIN_FORMAT = /^[\x21-\x7e]{6,64}$/

export function parseGatePin(text: string | undefined): GatePin {
  if (text === undefined || text === '') return { kind: 'absent' }
  return PIN_FORMAT.test(text) ? { kind: 'ok', pin: text } : { kind: 'invalid' }
}

/** What the server keeps of the PIN: not the PIN. */
export interface GateConfig {
  /** SHA-256 of the PIN, to compare it in constant time. */
  readonly digest: Buffer
  /** The PIN's tag in the cookie: a different PIN closes the open gates. */
  readonly tag: string
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest()
}

export function gateConfigFrom(pin: string): GateConfig {
  return { digest: sha256(pin), tag: sha256(`palco-gate:${pin}`).subarray(0, 8).toString('hex') }
}

/**
 * Constant time: both digests are 32 bytes even when the PINs are not, so timing
 * reveals neither how many characters match nor how long the PIN is.
 */
export function gatePinMatches(given: string, config: GateConfig): boolean {
  return timingSafeEqual(sha256(given), config.digest)
}

/** Without the value: it names the variable and its rule. */
export function gatePinWarning(kind: 'absent' | 'invalid'): string {
  return kind === 'absent'
    ? '[palco] Taquilla no disponible: falta NUXT_GATE_PIN.'
    : '[palco] Taquilla no disponible: NUXT_GATE_PIN debe tener de 6 a 64 caracteres, sin espacios.'
}

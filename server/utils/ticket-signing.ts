import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto'
import { signedMessage } from '../domain/ticket'

/**
 * Ed25519 ticket signatures (RN-BOL-02). Asymmetric rather than HMAC: whoever only
 * verifies cannot sign.
 *
 * The key is the `NUXT_TICKET_SIGNING_KEY` seed, read by
 * `server/plugins/ticket-key.ts`: with it, a printed QR survives restarts. Without
 * it, one key is generated per run and a QR from an earlier run fails the
 * signature check (RN-BOL-03); the short code, which carries no signature, keeps
 * working in both cases.
 */
export interface TicketSigner {
  readonly sign: (id: Uint8Array) => Uint8Array
  readonly verify: (id: Uint8Array, signature: Uint8Array) => boolean
  /** The 32 bytes of the public key: for the RFC 8032 seed, its test vector. */
  readonly publicKey: Uint8Array
}

/**
 * The DER prefix of an Ed25519 private key in PKCS #8 (RFC 8410): followed by the
 * 32 seed bytes, it is the key Node imports.
 */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
/** The public key in SPKI: a 12-byte prefix followed by the 32 key bytes. */
const ED25519_SPKI_PREFIX_LENGTH = 12

export const TICKET_SEED_BYTES = 32

function keysFrom(seed: Uint8Array | undefined): { privateKey: KeyObject, publicKey: KeyObject } {
  if (!seed) return generateKeyPairSync('ed25519')
  if (seed.length !== TICKET_SEED_BYTES) throw new Error('La semilla de la clave de firma debe medir 32 bytes')
  const privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' })
  return { privateKey, publicKey: createPublicKey(privateKey) }
}

/** Without a seed, a new pair: the per-run key. */
export function createTicketSigner(seed?: Uint8Array): TicketSigner {
  const { privateKey, publicKey } = keysFrom(seed)

  return {
    sign(id) {
      const message = signedMessage(id)
      // Only the endpoint calls it, with ids from `issueTickets`: a malformed one is a
      // server defect, not user input.
      if (!message.ok) throw new Error('Identificador de boleto mal formado')
      return new Uint8Array(sign(null, message.value, privateKey))
    },
    verify(id, signature) {
      const message = signedMessage(id)
      if (!message.ok) return false
      try {
        return verify(null, message.value, publicKey, signature)
      }
      catch {
        return false
      }
    },
    publicKey: new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(ED25519_SPKI_PREFIX_LENGTH)),
  }
}

let current: TicketSigner | null = null

/**
 * Sets the server signer: with the configured seed, or with `null`, a per-run one.
 * The plugin calls it at startup, and the tests call it to start over.
 */
export function configureTicketSigner(seed: Uint8Array | null): void {
  current = createTicketSigner(seed ?? undefined)
}

/**
 * The server signer. Without `configureTicketSigner` it is created on first use
 * rather than on import, because Nitro auto-imports `server/utils/`.
 */
export function ticketSigner(): TicketSigner {
  current ??= createTicketSigner()
  return current
}

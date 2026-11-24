import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TICKET_KEY_ABSENT_WARNING,
  parseTicketSigningKey,
  ticketKeyInvalidMessage,
} from '../server/utils/ticket-key'
import { configureTicketSigner, createTicketSigner, ticketSigner } from '../server/utils/ticket-signing'

// The configured signing key: the 32-byte Ed25519 seed in base64 in
// NUXT_TICKET_SIGNING_KEY. Without it, the key is per run (BT10–BT15). Each case
// carries its identifier in its name.

const ID = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x01, 0x23])

/** Test vector 1 of RFC 8032 §7.1: the seed and the public key it gives. */
const RFC_SEED = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex')
const RFC_PUBLIC = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'

/** A fixed seed, to compare two "runs". */
const SEED_TEXT = Buffer.alloc(32, 7).toString('base64')

afterEach(() => configureTicketSigner(null))

describe('la clave de firma configurada', () => {
  it('BT20: dos firmantes con la misma semilla se verifican uno al otro, como dos ejecuciones', () => {
    const seed = Buffer.from(SEED_TEXT, 'base64')
    const before = createTicketSigner(seed)
    const after = createTicketSigner(seed)
    const signature = before.sign(ID)
    expect(after.verify(ID, signature)).toBe(true)
    expect(Buffer.from(after.sign(ID))).toEqual(Buffer.from(signature))
  })

  it('BT21: con otra semilla, la firma anterior no verifica; con la de la ejecución, tampoco', () => {
    const signature = createTicketSigner(Buffer.alloc(32, 7)).sign(ID)
    expect(createTicketSigner(Buffer.alloc(32, 8)).verify(ID, signature)).toBe(false)
    expect(createTicketSigner().verify(ID, signature)).toBe(false)
  })

  it('BT22: la semilla del vector 1 de RFC 8032 da su clave pública', () => {
    expect(Buffer.from(createTicketSigner(RFC_SEED).publicKey).toString('hex')).toBe(RFC_PUBLIC)
  })

  it('BT23: la lectura distingue ausente, válida y cada forma inválida', () => {
    expect(parseTicketSigningKey(undefined)).toEqual({ kind: 'absent' })
    expect(parseTicketSigningKey('')).toEqual({ kind: 'absent' })

    const valid = parseTicketSigningKey(SEED_TEXT)
    expect(valid.kind).toBe('ok')
    if (valid.kind === 'ok') expect(Buffer.from(valid.seed)).toEqual(Buffer.alloc(32, 7))

    for (const text of [
      SEED_TEXT.slice(0, 43), // without the trailing "="
      Buffer.alloc(31, 7).toString('base64'), // 31 bytes
      Buffer.alloc(33, 7).toString('base64'), // 33 bytes
      Buffer.alloc(32, 0xfb).toString('base64url') + '=', // base64url: "-" and "_"
      '@'.repeat(43) + '=',
      ` ${SEED_TEXT}`, // with a space: it is not trimmed
      `${SEED_TEXT}\n`,
    ]) {
      expect(parseTicketSigningKey(text), JSON.stringify(text)).toEqual({ kind: 'invalid' })
    }
  })

  it('BT24: ticketSigner usa la clave configurada, y sin ella la de la ejecución', () => {
    configureTicketSigner(Buffer.alloc(32, 7))
    const configured = ticketSigner()
    expect(createTicketSigner(Buffer.alloc(32, 7)).verify(ID, configured.sign(ID))).toBe(true)
    expect(ticketSigner()).toBe(configured)

    configureTicketSigner(null)
    expect(createTicketSigner(Buffer.alloc(32, 7)).verify(ID, ticketSigner().sign(ID))).toBe(false)
  })

  it('BT25: la advertencia y el mensaje nombran la variable y nunca llevan un valor', () => {
    expect(TICKET_KEY_ABSENT_WARNING).toContain('NUXT_TICKET_SIGNING_KEY')
    expect(ticketKeyInvalidMessage()).toContain('NUXT_TICKET_SIGNING_KEY')
    expect(ticketKeyInvalidMessage()).toContain('openssl rand -base64 32')
  })

  it('BT26: start-check con una clave inválida sale con 1 antes de la base, sin el valor', () => {
    const ROOT = resolve(import.meta.dirname, '..')
    const secret = 'valor-que-no-debe-salir' + 'A'.repeat(21)
    const run = spawnSync('node', ['--import', join(ROOT, 'scripts/resolve-ts.ts'), join(ROOT, 'scripts/start-check.ts')], {
      cwd: ROOT,
      encoding: 'utf8',
      // Without NUXT_DATABASE_URL: the key is checked first.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NUXT_TICKET_SIGNING_KEY: secret },
    })
    expect(run.status).toBe(1)
    expect(run.stderr.trim()).toBe(ticketKeyInvalidMessage())
    expect(run.stdout + run.stderr).not.toContain('valor-que-no-debe-salir')
  })
})

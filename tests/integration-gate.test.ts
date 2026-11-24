import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHarness, SEEDED_USERS, type Harness } from './helpers/http-harness'

// The gate over HTTP: the real /api/gate endpoints with the origin middleware and
// the sealed cookie, on the integration test harness. RN-ACC-01, RN-ACC-02 and
// RN-SEG-03. Each case carries its identifier.

const PIN = 'Taquilla-2026'
const MET = { id: 'met', name: 'The Metropolitan Museum of Art' }

let harness: Harness

beforeAll(async () => {
  harness = await createHarness()
})

afterAll(async () => {
  await harness?.close()
})

// Each test starts with the gate configured and no failed attempts.
beforeEach(async () => {
  await harness.configureGate(PIN)
})

const cookieNames = (headers: Headers): string[] =>
  headers.getSetCookie().map((cookie) => cookie.split('=')[0]!)

describe('la taquilla', () => {
  it('INT14: sin NUXT_GATE_PIN, el estado lo dice sin recintos y abrir responde 503, sin cookie', async () => {
    await harness.configureGate(undefined)
    const client = harness.client()

    const status = await client.get('/api/gate')
    expect(status.status).toBe(200)
    expect(status.json).toEqual({ configured: false, venue: null, venues: [] })
    expect(status.headers.get('cache-control')).toBe('private, no-store')

    const open = await client.post('/api/gate/open', { venueId: 'met', pin: PIN })
    expect(open.status).toBe(503)
    expect(open.json).toEqual({ ok: false, field: null, code: 'ERR_GATE_UNAVAILABLE', message: 'La taquilla no está configurada en este servidor' })
    expect(cookieNames(open.headers)).toEqual([])
  })

  it('INT15: con la clave abre el recinto en su propia cookie; cerrar la borra; el estado no deja cookie', async () => {
    const client = harness.client()

    const closed = await client.get('/api/gate')
    expect(closed.json).toMatchObject({ configured: true, venue: null })
    expect((closed.json as { venues: unknown[] }).venues).toHaveLength(12)
    expect((closed.json as { venues: unknown[] }).venues[0]).toEqual({ id: 'teatro-colon', name: 'Teatro Colón' })
    expect(cookieNames(closed.headers)).toEqual([])

    const wrong = await client.post('/api/gate/open', { venueId: 'met', pin: 'Otra-clave' })
    expect(wrong.status).toBe(400)
    expect(wrong.json).toEqual({ ok: false, field: 'pin', code: 'ERR_GATE_PIN_INVALID', message: 'La clave de taquilla es incorrecta' })

    const open = await client.post('/api/gate/open', { venueId: 'met', pin: PIN })
    expect(open.status).toBe(200)
    expect(open.json).toEqual({ ok: true, venue: MET })
    expect(cookieNames(open.headers)).toEqual(['palco_gate'])
    const cookie = open.headers.getSetCookie()[0]!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    // h3 writes the duration as Expires: twelve hours, one shift.
    const expires = Date.parse(/Expires=([^;]+)/.exec(cookie)![1]!)
    expect(Math.abs(expires - (Date.now() + 12 * 3_600_000))).toBeLessThan(60_000)
    expect(cookie).not.toContain(PIN)

    expect((await client.get('/api/gate')).json).toMatchObject({ configured: true, venue: MET })

    expect((await client.post('/api/gate/close')).json).toEqual({ ok: true })
    expect((await client.get('/api/gate')).json).toMatchObject({ venue: null })
    // Idempotent.
    expect((await client.post('/api/gate/close')).status).toBe(200)
  })

  it('INT16: cinco claves equivocadas y el sexto intento, aun correcto, da 429 con Retry-After', async () => {
    const client = harness.client()
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await client.post('/api/gate/open', { venueId: 'met', pin: `Mala-${attempt}x` })
      expect(response.status, `intento ${attempt}`).toBe(400)
    }
    const sixth = await client.post('/api/gate/open', { venueId: 'met', pin: PIN })
    expect(sixth.status).toBe(429)
    expect(sixth.json).toEqual({ ok: false, field: null, code: 'ERR_GATE_RATE_LIMITED', message: 'Demasiados intentos de clave. Espera unos minutos e inténtalo de nuevo' })
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(890)
    expect(Number(sixth.headers.get('retry-after'))).toBeLessThanOrEqual(900)
    expect(cookieNames(sixth.headers)).toEqual([])
  })

  it('INT17: las aperturas correctas, la forma y el recinto no cuentan como intentos fallidos (RN-ACC-02, aclarada)', async () => {
    const client = harness.client()
    for (let attempt = 1; attempt <= 6; attempt++) {
      expect((await client.post('/api/gate/open', { venueId: 'met', pin: PIN })).status, `apertura ${attempt}`).toBe(200)
    }
    const extra = await client.post('/api/gate/open', { venueId: 'met', pin: PIN, recinto: 'met' })
    expect(extra.json).toEqual({ ok: false, field: null, code: 'ERR_INPUT_INVALID', message: 'Entrada inválida' })
    const unknown = await client.post('/api/gate/open', { venueId: 'opera-de-paris', pin: PIN })
    expect(unknown.json).toMatchObject({ field: 'venueId', code: 'ERR_INPUT_INVALID' })
    // With all of that, the five failed attempts remain.
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await client.post('/api/gate/open', { venueId: 'met', pin: 'Mala-clave' })).status, `fallo ${attempt}`).toBe(400)
    }
    expect((await client.post('/api/gate/open', { venueId: 'met', pin: PIN })).status).toBe(429)
  })

  it('INT18: cambiar NUXT_GATE_PIN cierra la taquilla abierta con la clave anterior', async () => {
    const client = harness.client()
    expect((await client.post('/api/gate/open', { venueId: 'met', pin: PIN })).status).toBe(200)
    await harness.configureGate('Otra-clave-2026')
    expect((await client.get('/api/gate')).json).toMatchObject({ configured: true, venue: null })
  })

  it('INT19: abrir desde otro sitio da 403 sin cookie ni intento contado (RN-SEG-03)', async () => {
    const client = harness.client()
    const crossSite = await client.post('/api/gate/open', { venueId: 'met', pin: 'Mala-clave' }, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' })
    expect(crossSite.status).toBe(403)
    expect(crossSite.json).toMatchObject({ code: 'ERR_CROSS_ORIGIN_REQUEST' })
    expect(cookieNames(crossSite.headers)).toEqual([])
    expect((await client.post('/api/gate/close', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    // The rejected attempt did not count: the five remain.
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await client.post('/api/gate/open', { venueId: 'met', pin: 'Mala-clave' })).status).toBe(400)
    }
  })

  it('INT20: la taquilla no toca la sesión del comprador: con sesión, abrir y cerrar solo escriben palco_gate', async () => {
    const [ana] = SEEDED_USERS
    const client = harness.client()
    expect((await client.login(ana!.username, ana!.password)).status).toBe(200)
    const open = await client.post('/api/gate/open', { venueId: 'met', pin: PIN })
    expect(cookieNames(open.headers)).toEqual(['palco_gate'])
    const close = await client.post('/api/gate/close')
    expect(cookieNames(close.headers)).toEqual(['palco_gate'])
  })
})

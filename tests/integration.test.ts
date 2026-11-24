import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freezeClock, thawClock } from './helpers/clock'
import { createHarness, SEEDED_USERS, type Harness, type HarnessClient } from './helpers/http-harness'

// Integration tests: the real server/api endpoints with their middleware, the
// sealed session, real PostgreSQL on PGlite in a temporary directory and the sales
// state started as in the server. No mocks of the domain, the repositories or the
// database. Each case carries its identifier.

const [ANA, BRUNO] = SEEDED_USERS

let harness: Harness

/** The first row of a query, as `palco_app`. */
async function one<T>(sql: string, ...params: unknown[]): Promise<T> {
  return (await harness.database().query<T>(sql, params)).rows[0] as T
}

beforeAll(async () => {
  freezeClock()
  harness = await createHarness()
})

afterAll(async () => {
  await harness?.close()
  thawClock()
})

describe('login', () => {
  it('INT1: con una CURP y contraseña sembradas da 200 con la cookie, y la sesión devuelve al usuario', async () => {
    const client = harness.client()
    const login = await client.login(ANA.username, ANA.password)
    expect(login.status).toBe(200)
    expect(login.json).toMatchObject({ ok: true, user: { username: ANA.username, displayName: ANA.displayName } })
    expect(login.headers.get('set-cookie')).toMatch(/^palco_session=[^;]+;.*HttpOnly/)

    const session = await client.get('/api/auth/session')
    expect(session.status).toBe(200)
    expect(session.json).toMatchObject({ user: { username: ANA.username, displayName: ANA.displayName } })
  })

  it('INT2: una CURP no registrada responde igual que una contraseña equivocada; una mal formada, 400 con su regla', async () => {
    const client = harness.client()
    // A valid format, with its check digit, and not in the database.
    const unregistered = await client.login('ABCD000229HDFXXXA8DF', 'Abc123$%')
    const wrongPassword = await client.login(BRUNO.username, 'Teatro8$')
    expect(unregistered.status).toBe(401)
    expect(unregistered.json).toEqual({ ok: false, code: 'ERR_CREDENTIALS_INVALID', message: 'Usuario o contraseña incorrectos' })
    expect(wrongPassword.status).toBe(401)
    expect(unregistered.bytes.equals(wrongPassword.bytes)).toBe(true)
    expect(unregistered.headers.get('set-cookie')).toBeNull()

    // The format rule decides before querying the database: with the users table out
    // of reach, a query would answer 500 and not 400.
    const database = harness.database()
    await database.asOwner(() => database.exec('ALTER TABLE users RENAME TO users_fuera_de_alcance'))
    try {
      const malformed = await client.login('RIVA030315-JCSLNA2JC', ANA.password)
      expect(malformed.status).toBe(400)
      expect(malformed.json).toEqual({ ok: false, code: 'ERR_CURP_SPECIAL_CHAR', message: 'El usuario no admite caracteres especiales' })
    }
    finally {
      await database.asOwner(() => database.exec('ALTER TABLE users_fuera_de_alcance RENAME TO users'))
    }
    // And with the table back in place, the same well-formed user signs in.
    expect((await client.login(ANA.username, ANA.password)).status).toBe(200)
  })
})

// ── Purchase ───────────────────────────────────────────────────────────────

const HOLDER = 'Elena Vela Torres'
const DEBIT = { method: 'debit', cardNumber: '5555555555554444', holder: HOLDER, expiry: '12/28', securityCode: '987', email: '' }
const CREDIT = { ...DEBIT, method: 'credit', cardNumber: '4111111111111111' }

/** Two VIP tickets for Insidious at Cinépolis: MXN 280 each plus a MXN 6 fee. */
function cinemaBody(overrides: { date?: string, quantity?: string, seats?: string[], payment?: unknown } = {}) {
  return {
    requestId: randomUUID(),
    venueId: 'cinepolis',
    tickets: { filmIndex: 3, age: '21', formatId: 'vip', date: overrides.date ?? '07/11/2026', time: '19:00', quantity: overrides.quantity ?? '2', seats: overrides.seats ?? ['12', '13'] },
    payment: overrides.payment ?? DEBIT,
  }
}

function theaterBody(venueId: string, quantity: string, payment: unknown = CREDIT) {
  return {
    requestId: randomUUID(),
    venueId,
    tickets: { playIndex: 0, sectionIndex: 1, date: '05/11/2026', time: '15:00', quantity },
    payment,
  }
}

async function available(client: HarnessClient, venueId: string): Promise<number> {
  const catalog = (await client.get('/api/catalog')).json as { venues: { id: string, available: number }[] }
  return catalog.venues.find((venue) => venue.id === venueId)!.available
}

/** Capacity minus what was sold in the database, for a venue. */
async function derivedFromDatabase(venueId: string): Promise<number> {
  return (await one<{ free: number }>(
    'SELECT v.capacity - COALESCE(SUM(p.quantity), 0) AS free FROM venues v LEFT JOIN purchases p ON p.venue_id = v.id WHERE v.id = $1 GROUP BY v.id',
    venueId,
  )).free
}

/** What a rejected purchase must not change. */
async function snapshot(client: HarnessClient, venueIds: readonly string[]) {
  return {
    purchases: (await one<{ n: number }>('SELECT COUNT(*) AS n FROM purchases')).n,
    tickets: (await one<{ n: number }>('SELECT COUNT(*) AS n FROM tickets')).n,
    nextSequence: (await one<{ next: number }>('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM purchases')).next,
    available: Object.fromEntries(await Promise.all(venueIds.map(async (id) => [id, await available(client, id)] as const))),
  }
}

async function signedIn(user: (typeof SEEDED_USERS)[number]): Promise<HarnessClient> {
  const client = harness.client()
  expect((await client.login(user.username, user.password)).status).toBe(200)
  return client
}

describe('compra', () => {
  // One test's purchases do not count in the next: availability and the per-user
  // limit are derived from what was sold.
  beforeEach(() => harness.resetSales())

  it('INT3: la compra queda en la base con sus boletos, sin datos sensibles, y la disponibilidad baja exactamente', async () => {
    const ana = await signedIn(ANA)
    const venue = await ana.get('/api/venues/cinepolis')
    expect(venue.status).toBe(200)
    const before = await available(ana, 'cinepolis')
    expect((venue.json as { available: number }).available).toBe(before)
    expect(await derivedFromDatabase('cinepolis')).toBe(before)

    // A fixed requestId: the row stores the key, and with a random one "987", the
    // security code searched for below, shows up by chance in 1 out of ~140 runs (30
    // positions of 32 hexadecimal digits).
    const posted = await ana.post('/api/purchases', { ...cinemaBody(), requestId: '00000000-0000-4000-8000-000000000003' })
    expect(posted.status).toBe(201)
    const { folio } = posted.json as { folio: string }
    expect(folio).toMatch(/^PLC-[0-9A-F]{4,}-\d{4}$/)

    const anaId = (await one<{ id: number }>('SELECT id FROM users WHERE username = $1', ANA.username)).id
    const row = await one<{ user_id: number, venue_id: string, quantity: number, payment_method: string, total_cents: number, currency: string, status: string, payment_summary: unknown }>(
      'SELECT user_id, venue_id, quantity, payment_method, total_cents, currency, status, payment_summary FROM purchases WHERE folio = $1',
      folio,
    )
    expect(row).toMatchObject({ user_id: anaId, venue_id: 'cinepolis', quantity: 2, payment_method: 'debit', total_cents: 57200, currency: 'MXN', status: 'confirmed' })
    expect((await one<{ n: number }>('SELECT COUNT(*) AS n FROM tickets WHERE folio = $1', folio)).n).toBe(2)

    // The RN-CON-05 summary: method, brand, masked number and holder. Never the full
    // number or the security code.
    expect(row.payment_summary).toEqual({ method: 'debit', brand: 'mastercard', maskedNumber: '************4444', holder: HOLDER })
    const allRows = JSON.stringify(await one('SELECT * FROM purchases WHERE folio = $1', folio))
    expect(allRows).not.toContain('5555555555554444')
    expect(allRows).not.toMatch(/\d{13,19}/)
    expect(allRows).not.toContain('987')
    expect(allRows).not.toContain('@')

    expect(await available(ana, 'cinepolis')).toBe(before - 2)
    expect(await derivedFromDatabase('cinepolis')).toBe(before - 2)

    const detail = await ana.get(`/api/purchases/${folio}`)
    expect(detail.status).toBe(200)
    expect((detail.json as { tickets: unknown[] }).tickets).toHaveLength(2)
  })

  it('INT4: cada rechazo da 400 y un fallo a mitad de la transacción da 500; ninguno cambia la base, y el folio no salta', async () => {
    // The Scala with 3 free seats, for the availability rejection.
    await harness.restart('teatro-scala=3')
    const ana = await signedIn(ANA)
    const bruno = await signedIn(BRUNO)
    const saved = await bruno.post('/api/payment-methods', { method: 'credit', cardNumber: '4111111111111111', holder: 'Marco Nava Orozco', expiry: '12/28', email: '' })
    expect(saved.status).toBe(201)
    const foreignMethodId = (saved.json as { method: { id: string } }).method.id

    const venues = ['cinepolis', 'teatro-colon', 'teatro-scala'] as const
    const before = await snapshot(ana, venues)
    const cases = [
      { name: 'fecha pasada', body: cinemaBody({ date: '01/10/2026' }), step: 'tickets', field: 'date', code: 'ERR_DATE_PAST' },
      { name: 'más que el límite de la categoría', body: theaterBody('teatro-colon', '11'), step: 'tickets', field: 'quantity', code: 'ERR_EXCEEDS_USER_LIMIT' },
      { name: 'más que la disponibilidad', body: theaterBody('teatro-scala', '4'), step: 'tickets', field: 'quantity', code: 'ERR_EXCEEDS_AVAILABILITY' },
      { name: 'tarjeta que no supera Luhn', body: cinemaBody({ payment: { ...DEBIT, cardNumber: '4111111111111112' } }), step: 'payment', field: 'cardNumber', code: 'ERR_CARD_LUHN' },
      { name: 'método guardado ajeno', body: cinemaBody({ payment: { savedMethodId: foreignMethodId, securityCode: '123' } }), step: 'payment', field: 'savedMethod', code: 'ERR_SAVED_METHOD_UNAVAILABLE' },
    ]
    for (const rejection of cases) {
      const response = await ana.post('/api/purchases', rejection.body)
      expect(response.status, rejection.name).toBe(400)
      expect(response.json, rejection.name).toMatchObject({ ok: false, step: rejection.step, field: rejection.field, code: rejection.code })
      expect(await snapshot(ana, venues), rejection.name).toEqual(before)
    }

    // A failure halfway through the transaction: a temporary trigger on the same
    // connection the server uses aborts the ticket insert, after the purchase was
    // inserted. Nothing is left: no purchase, no tickets, no folio, no deduction.
    const database = harness.database()
    const interrupted = cinemaBody({ quantity: '1', seats: ['7'] })
    await database.asOwner(() => database.exec(`
      CREATE FUNCTION fallo_inyectado() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fallo_inyectado BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION fallo_inyectado();
    `))
    try {
      const failed = await ana.post('/api/purchases', interrupted)
      expect(failed.status).toBe(500)
      expect(failed.json).toEqual({ ok: false, step: null, field: null, seatIndex: null, code: 'ERR_PURCHASE_NOT_RECORDED', message: 'No se pudo registrar la compra' })
      expect(await snapshot(ana, venues)).toEqual(before)
    }
    finally {
      await database.asOwner(() => database.exec('DROP TRIGGER fallo_inyectado ON tickets; DROP FUNCTION fallo_inyectado();'))
    }

    // No gap: the retry with the same requestId is a new purchase with the next folio,
    // and then the Scala gets the one after that.
    const year = new Date().getFullYear()
    const folioOf = (sequence: number) => `PLC-${sequence.toString(16).toUpperCase().padStart(4, '0')}-${year}`
    const retried = await ana.post('/api/purchases', interrupted)
    expect(retried.status).toBe(201)
    expect((retried.json as { folio: string }).folio).toBe(folioOf(before.nextSequence))
    const valid = await ana.post('/api/purchases', theaterBody('teatro-scala', '3'))
    expect(valid.status).toBe(201)
    expect((valid.json as { folio: string }).folio).toBe(folioOf(before.nextSequence + 1))
    expect(await available(ana, 'teatro-scala')).toBe(0)
  })

  it('INT5: el mismo requestId con la misma compra da el mismo folio una sola vez; con otra compra, 400', async () => {
    const ana = await signedIn(ANA)
    const body = cinemaBody({ quantity: '1', seats: ['30'] })
    const before = await snapshot(ana, ['cinepolis'])

    const first = await ana.post('/api/purchases', body)
    const retry = await ana.post('/api/purchases', body)
    expect(first.status).toBe(201)
    expect(retry.status).toBe(200)
    expect(retry.json).toEqual(first.json)
    const after = await snapshot(ana, ['cinepolis'])
    expect(after.purchases).toBe(before.purchases + 1)
    expect(after.tickets).toBe(before.tickets + 1)
    expect(after.available.cinepolis).toBe(before.available.cinepolis! - 1)

    const conflict = await ana.post('/api/purchases', { ...body, tickets: { ...body.tickets, seats: ['31'] } })
    expect(conflict.status).toBe(400)
    expect(conflict.json).toMatchObject({ ok: false, step: null, field: 'requestId', code: 'ERR_INPUT_INVALID' })
    expect(await snapshot(ana, ['cinepolis'])).toEqual(after)
  })

  it('INT6: una compra ajena y un folio inexistente responden igual, y la lista de cada usuario solo tiene las suyas', async () => {
    const ana = await signedIn(ANA)
    const bruno = await signedIn(BRUNO)
    const { folio } = (await ana.post('/api/purchases', cinemaBody({ quantity: '1', seats: ['40'] }))).json as { folio: string }
    const missing = 'PLC-0FFF-2026'

    for (const suffix of ['', '/tickets', '/whatsapp']) {
      const foreign = await bruno.get(`/api/purchases/${folio}${suffix}`)
      const inexistent = await bruno.get(`/api/purchases/${missing}${suffix}`)
      expect(foreign.status, suffix).toBe(404)
      expect(inexistent.status, suffix).toBe(404)
      expect(foreign.json, suffix).toMatchObject({ message: 'Compra inexistente' })
      expect(foreign.bytes.toString('utf8').replaceAll(folio, '{folio}'), suffix).toBe(inexistent.bytes.toString('utf8').replaceAll(missing, '{folio}'))
    }

    const brunoList = (await bruno.get('/api/purchases')).json as { purchases: { folio: string }[] }
    expect(brunoList.purchases.map((purchase) => purchase.folio)).not.toContain(folio)
    const anaList = (await ana.get('/api/purchases')).json as { purchases: { folio: string }[] }
    expect(anaList.purchases.map((purchase) => purchase.folio)).toContain(folio)
    expect(anaList.purchases[0]!.folio).toBe(folio)
  })

  it('INT7: tras reiniciar sobre el mismo archivo siguen la compra, sus boletos, su clave y la disponibilidad, y el folio continúa', async () => {
    const ana = await signedIn(ANA)
    const body = cinemaBody({ quantity: '2', seats: ['50', '51'] })
    const { folio } = (await ana.post('/api/purchases', body)).json as { folio: string }
    const idsOf = async () => (await harness.database().query<{ id: string }>('SELECT id FROM tickets WHERE folio = $1 ORDER BY ordinal', [folio])).rows.map((t) => t.id)
    const ticketIds = await idsOf()
    const before = await snapshot(ana, ['cinepolis'])

    await harness.restart()

    // The sealed cookie does not depend on the process: the same session carries on.
    expect(await snapshot(ana, ['cinepolis'])).toEqual(before)
    expect(before.available.cinepolis).toBe(await derivedFromDatabase('cinepolis'))
    const detail = await ana.get(`/api/purchases/${folio}`)
    expect(detail.status).toBe(200)
    expect((detail.json as { tickets: unknown[] }).tickets).toHaveLength(2)
    expect(await idsOf()).toEqual(ticketIds)

    const replay = await ana.post('/api/purchases', body)
    expect(replay.status).toBe(200)
    expect(replay.json).toEqual({ ok: true, folio })

    const next = await ana.post('/api/purchases', cinemaBody({ quantity: '1', seats: ['52'] }))
    expect(next.status).toBe(201)
    expect((next.json as { folio: string }).folio).toBe(`PLC-${before.nextSequence.toString(16).toUpperCase().padStart(4, '0')}-${new Date().getFullYear()}`)
  })

  it('INT8: sin sesión la compra da 401, y una petición de otro sitio da 403 sin tocar la base', async () => {
    const anonymous = harness.client()
    const ana = await signedIn(ANA)
    const before = await snapshot(ana, ['cinepolis'])

    expect((await anonymous.post('/api/purchases', cinemaBody({ quantity: '1', seats: ['60'] }))).status).toBe(401)
    const crossSite = await ana.post('/api/purchases', cinemaBody({ quantity: '1', seats: ['61'] }), { 'Sec-Fetch-Site': 'cross-site' })
    expect(crossSite.status).toBe(403)
    expect(crossSite.json).toEqual({ ok: false, code: 'ERR_CROSS_ORIGIN_REQUEST', message: 'La petición no proviene de PALCO' })
    expect(await snapshot(ana, ['cinepolis'])).toEqual(before)
  })
})

// ── Registration with optional email ───────────────────────────────────────

describe('registro', () => {
  it('INT12: el correo opcional se guarda en minúsculas o como NULL; uno inválido da 400 en email; cuatro claves, 400 de forma', async () => {
    const emailOf = async (username: string) => (await one<{ email: string | null } | undefined>('SELECT email FROM users WHERE username = $1', username))?.email
    const users = async () => (await one<{ n: number }>('SELECT COUNT(*) AS n FROM users')).n
    const body = (username: string, email: string) => ({
      username, displayName: 'Lucía Pérez Martínez', email, password: '!Palco26', passwordConfirmation: '!Palco26',
    })

    // (1) With an email: 201 and the database stores it in lowercase. The response does not carry it.
    const withEmail = await harness.client().post('/api/auth/register', body('PEML990417MJCRRC08JC', 'Lucia.Perez@Example.com'))
    expect(withEmail.status).toBe(201)
    expect(JSON.stringify(withEmail.json)).not.toContain('@')
    expect(await emailOf('PEML990417MJCRRC08JC')).toBe('lucia.perez@example.com')

    // (2) Without an email: 201 and NULL.
    const withoutEmail = await harness.client().post('/api/auth/register', body('LOMA081014MJCPRRA6JC', ''))
    expect(withoutEmail.status).toBe(201)
    expect(await emailOf('LOMA081014MJCPRRA6JC')).toBeNull()

    // (3) An invalid email: 400 on email and no new user.
    const before = await users()
    const invalid = await harness.client().post('/api/auth/register', body('PEFA080229MJCRRNA5JC', 'ana@example..com'))
    expect(invalid.status).toBe(400)
    expect(invalid.json).toMatchObject({ ok: false, field: 'email', code: 'ERR_EMAIL_DOMAIN' })
    expect(await users()).toBe(before)
    expect(await emailOf('PEFA080229MJCRRNA5JC')).toBeUndefined()

    // (4) The four earlier keys, without email: a 400 for the shape.
    const { email: _omitted, ...previous } = body('PEFA080229MJCRRNA5JC', '')
    const fourKeys = await harness.client().post('/api/auth/register', previous)
    expect(fourKeys.status).toBe(400)
    expect(fourKeys.json).toMatchObject({ ok: false, field: null, code: 'ERR_INPUT_INVALID' })
    expect(await users()).toBe(before)
  })
})

// ── The harness ─────────────────────────────────────────────────────────────

describe('arnés', () => {
  it('INT11: resetSales vacía compras, boletos y la bandeja de envíos, y la disponibilidad vuelve al aforo', async () => {
    const ana = await signedIn(ANA)
    const bought = await ana.post('/api/purchases', cinemaBody())
    expect(bought.status).toBe(201)
    const { folio } = bought.json as { folio: string }
    const anaId = (await one<{ id: number }>('SELECT id FROM users WHERE username = $1', ANA.username)).id
    // Without WhatsApp configured there is no automatic send: one is recorded by hand.
    const sends = await harness.load<typeof import('../server/data/whatsapp-sends')>('server/data/whatsapp-sends.ts')
    sends.startWhatsappSend(anaId, folio, Date.now(), [])
    expect(sends.findWhatsappSend(anaId, folio)).not.toBeNull()
    expect(await available(ana, 'cinepolis')).toBe(await derivedFromDatabase('cinepolis'))

    await harness.resetSales()

    const count = async (table: string) => (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)).n
    expect(await count('purchases')).toBe(0)
    expect(await count('tickets')).toBe(0)
    expect(sends.findWhatsappSend(anaId, folio)).toBeNull()
    const capacity = (await one<{ capacity: number }>("SELECT capacity FROM venues WHERE id = 'cinepolis'")).capacity
    expect(await available(ana, 'cinepolis')).toBe(capacity)
  })
})

// ── Limit per user, venue and date (RN-CAN-07) ────────────────────────────

function scalaBody(date: string, quantity: string) {
  return { ...theaterBody('teatro-scala', quantity), tickets: { playIndex: 0, sectionIndex: 1, date, time: '15:00', quantity } }
}

function louvreBody(quantity: string) {
  return { requestId: randomUUID(), venueId: 'louvre', tickets: { isResident: false, date: '05/11/2026', time: '10:00', quantity }, payment: CREDIT }
}

describe('límite por usuario', () => {
  beforeEach(() => harness.resetSales())

  it('INT10: el límite de la categoría se acumula por usuario, recinto y fecha; el reintento responde antes que el límite', async () => {
    // Scala dates in 2027, Monday and Tuesday: the 2026 ones have passed and the server
    // would reject them with ERR_DATE_PAST before reaching the limit. Without INT4's
    // override: the Scala with its capacity minus what was sold.
    await harness.restart()
    const ana = await signedIn(ANA)
    const bruno = await signedIn(BRUNO)

    const first = scalaBody('01/11/2027', '10')
    const bought = await ana.post('/api/purchases', first)
    expect(bought.status).toBe(201)
    const { folio } = bought.json as { folio: string }

    // One more on the same date: the limit rejection, without touching the database.
    const before = await snapshot(ana, ['teatro-scala'])
    const over = await ana.post('/api/purchases', scalaBody('01/11/2027', '1'))
    expect(over.status).toBe(400)
    expect(over.json).toMatchObject({ ok: false, step: 'tickets', field: 'quantity', code: 'ERR_EXCEEDS_USER_LIMIT', message: 'La cantidad excede el máximo permitido por usuario' })
    expect(await snapshot(ana, ['teatro-scala'])).toEqual(before)

    // Another date and another user have their own limit. On the other date everything
    // purchased adds up, not just the last purchase: 1 and 8 leave 1 free.
    expect((await ana.post('/api/purchases', scalaBody('02/11/2027', '1'))).status).toBe(201)
    expect((await ana.post('/api/purchases', scalaBody('02/11/2027', '8'))).status).toBe(201)
    expect((await ana.post('/api/purchases', scalaBody('02/11/2027', '2'))).json).toMatchObject({ field: 'quantity', code: 'ERR_EXCEEDS_USER_LIMIT' })
    expect((await ana.post('/api/purchases', scalaBody('02/11/2027', '1'))).status).toBe(201)
    expect((await bruno.post('/api/purchases', scalaBody('01/11/2027', '10'))).status).toBe(201)

    // The retry of the first purchase answers its folio even though an identical one
    // no longer fits: the retry comes before the limit (RN-CON-07).
    const replay = await ana.post('/api/purchases', first)
    expect(replay.status).toBe(200)
    expect(replay.json).toEqual({ ok: true, folio })

    // For museums the limit is 5: 3 and 3 do not fit; 3 and 2 do.
    expect((await ana.post('/api/purchases', louvreBody('3'))).status).toBe(201)
    const museumOver = await ana.post('/api/purchases', louvreBody('3'))
    expect(museumOver.status).toBe(400)
    expect(museumOver.json).toMatchObject({ step: 'tickets', field: 'quantity', code: 'ERR_EXCEEDS_USER_LIMIT' })
    expect((await ana.post('/api/purchases', louvreBody('2'))).status).toBe(201)

    const anaId = (await one<{ id: number }>('SELECT id FROM users WHERE username = $1', ANA.username)).id
    const boughtByAna = async (venueId: string, date: string) => (await one<{ n: number }>(
      'SELECT COALESCE(SUM(quantity), 0) AS n FROM purchases WHERE user_id = $1 AND venue_id = $2 AND event_date = $3',
      anaId, venueId, date,
    )).n
    expect(await boughtByAna('teatro-scala', '2027-11-01')).toBe(10)
    expect(await boughtByAna('teatro-scala', '2027-11-02')).toBe(10)
    expect(await boughtByAna('louvre', '2026-11-05')).toBe(5)
  })
})

describe('recintos de la base', () => {
  beforeEach(() => harness.resetSales())

  // The database is the source of the venues. A change made by the owner reaches the
  // server on restart, without touching the catalog in the code.
  it('INT13: un precio cambiado en la base se ve en el detalle tras reiniciar, y la compra se cobra con él', async () => {
    const database = harness.database()
    const original = await one<{ price_cents: number }>("SELECT price_cents FROM venue_sections WHERE venue_id = 'teatro-scala' AND position = 1")
    await database.asOwner(() => database.query("UPDATE venue_sections SET price_cents = 12345 WHERE venue_id = 'teatro-scala' AND position = 1"))
    try {
      await harness.restart()
      const ana = await signedIn(ANA)
      const detail = (await ana.get('/api/venues/teatro-scala')).json as { venue: { sections: { name: string, price: number }[] } }
      expect(detail.venue.sections[1]!.price).toBe(12345)
      expect(detail.venue.sections[1]!.price).not.toBe(original.price_cents)

      const bought = await ana.post('/api/purchases', theaterBody('teatro-scala', '2'))
      expect(bought.status).toBe(201)
      const { folio } = bought.json as { folio: string }
      expect(await one<{ total_cents: number }>('SELECT total_cents FROM purchases WHERE folio = $1', folio)).toEqual({ total_cents: 24690 })
    }
    finally {
      await harness.database().asOwner(() => harness.database().query("UPDATE venue_sections SET price_cents = $1 WHERE venue_id = 'teatro-scala' AND position = 1", [original.price_cents]))
      await harness.restart()
    }
  })
})

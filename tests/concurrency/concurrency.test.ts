import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { createMockMetaServer, type MockMetaRequest } from '../../scripts/mock-meta-server'
import { VENUES } from '../../server/data/catalog'
import { createDatabase, type Database } from '../../server/db/client'
import { FOLIO_LOCK_KEY, FOLIO_LOCK_SPACE, USER_LOCK_SPACE, VENUE_LOCK_SPACE } from '../../server/db/locks'
import { findPurchaseByFolio, insertPurchase, listPurchases, nextSequence, soldByVenue, type PurchaseRecord } from '../../server/db/purchases.repository'
import { confirmPurchase, type TicketsInput } from '../../server/domain/confirmation'
import type { PaymentInput } from '../../server/domain/payment'
import type { CalendarDate, Venue } from '../../types'
import { formatIsoDate, toCalendarDate } from '../../utils/date'
import { NOW } from '../helpers/clock'
import { createPostgresHarness, SEEDED_USERS, type HarnessClient, type HarnessResponse, type PostgresHarness } from '../helpers/http-harness'
import { createTestDatabase, fixedTicketId, resetTestDatabase } from '../support/database'
import { assertTestDatabase } from './test-database'

// The concurrency suite: the real endpoints on a real `pg.Pool` with `max: 2`, in
// a `palco_test_*` database of its own. Each race is forced: the test takes the
// contended lock from its own connection, fires the requests, waits until it sees
// them in `pg_stat_activity` and releases it. Each race is also repeated 20 times
// without that brake. The WhatsApp number is synthetic and Meta is the simulated one.

const ROOT = resolve(import.meta.dirname, '../..')
const REPETITIONS = 20
const [ANA, BRUNO] = SEEDED_USERS
const CARD = { method: 'credit', cardNumber: '4111111111111111', holder: 'Elena Vela Torres', expiry: '12/40', securityCode: '123', email: '' }
const QUIET = { info: () => {}, warn: () => {} }

const settings = inject('concurrencyDatabase')

let harness: PostgresHarness
let database: Database
/** The test's connection, as owner: it takes locks and prepares the cases. */
let admin: pg.Client
/** Another connection to watch the waits: inside a transaction, `pg_stat_activity` does not refresh. */
let watcher: pg.Client
let ana: HarnessClient
let bruno: HarnessClient

/** A Thursday at least 40 days ahead: the script's venues are open and it is not a holiday. */
function eventDate(): string {
  const closed = new Set(['1/1', '25/4', '1/5', '25/5', '9/7', '15/8', '16/9', '25/12'])
  const date = new Date()
  date.setDate(date.getDate() + 40)
  while (date.getDay() !== 4 || closed.has(`${date.getDate()}/${date.getMonth() + 1}`)) date.setDate(date.getDate() + 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

const DATE = eventDate()

function venueOf(id: string): Venue {
  return VENUES.find((venue) => venue.id === id)!
}

/** A valid purchase at any catalog venue. */
function ticketsFor(venue: Venue, quantity: number) {
  const count = String(quantity)
  if (venue.category === 'teatro') return { playIndex: 0, sectionIndex: 0, date: DATE, time: '15:00', quantity: count }
  if (venue.category === 'cine') {
    return { filmIndex: 0, age: '30', formatId: venue.formats[0]!.id, date: DATE, time: '19:00', quantity: count, seats: Array.from({ length: quantity }, (_, index) => String(index + 1)) }
  }
  return { isResident: false, date: DATE, time: '11:00', quantity: count }
}

function body(venueId: string, quantity: number, requestId: string = randomUUID()) {
  return { requestId, venueId, tickets: ticketsFor(venueOf(venueId), quantity), payment: CARD }
}

const buy = (client: HarnessClient, venueId: string, quantity: number) => client.post('/api/purchases', body(venueId, quantity))

async function resetSales(overrides = ''): Promise<void> {
  assertTestDatabase(settings.name)
  await admin.query('TRUNCATE purchases, whatsapp_numbers CASCADE')
  const { startSalesState } = await harness.load<typeof import('../../server/utils/sales-startup')>('server/utils/sales-startup.ts')
  await startSalesState(database, overrides, QUIET)
  const { resetWhatsappSends } = await harness.load<typeof import('../../server/data/whatsapp-sends')>('server/data/whatsapp-sends.ts')
  resetWhatsappSends()
}

const venueLock = (venueId: string) => ['SELECT pg_advisory_lock($1::int, hashtext($2::text))', [VENUE_LOCK_SPACE, venueId]] as const
const venueUnlock = (venueId: string) => ['SELECT pg_advisory_unlock($1::int, hashtext($2::text))', [VENUE_LOCK_SPACE, venueId]] as const
const folioLock = ['SELECT pg_advisory_lock($1::int, $2::int)', [FOLIO_LOCK_SPACE, FOLIO_LOCK_KEY]] as const
const folioUnlock = ['SELECT pg_advisory_unlock($1::int, $2::int)', [FOLIO_LOCK_SPACE, FOLIO_LOCK_KEY]] as const

/** Waits until `count` connections wait for that kind of lock; false if they never do. */
async function waitForWaiters(count: number, event: 'advisory' | 'transactionid' | 'relation' = 'advisory', timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { rows } = await watcher.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = $1",
      [event],
    )
    if (Number(rows[0]!.n) >= count) return true
    await new Promise((done) => setTimeout(done, 10))
  }
  return false
}

type Query = readonly [string, readonly unknown[]]

/** Fires the requests with the lock held, watches them wait and releases it. */
async function forced(lock: Query, unlock: Query, waiters: number, requests: () => readonly Promise<HarnessResponse>[]) {
  await admin.query(lock[0], [...lock[1]])
  let released = false
  const release = async () => {
    if (!released) await admin.query(unlock[0], [...unlock[1]])
    released = true
  }
  try {
    const pending = Promise.all(requests())
    const waited = await waitForWaiters(waiters)
    await release()
    return { waited, responses: await pending }
  }
  finally {
    await release()
  }
}

async function countOf(table: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(rows[0]!.n)
}

async function soldIn(venueId: string): Promise<number> {
  const { rows } = await admin.query<{ sold: string }>('SELECT COALESCE(SUM(quantity), 0) AS sold FROM purchases WHERE venue_id = $1', [venueId])
  return Number(rows[0]!.sold)
}

const statuses = (responses: readonly HarnessResponse[]) => responses.map((response) => response.status).sort()

async function available(client: HarnessClient, venueId: string): Promise<number> {
  const catalog = (await client.get('/api/catalog')).json as { venues: { id: string, available: number }[] }
  return catalog.venues.find((venue) => venue.id === venueId)!.available
}

async function signedIn(user: (typeof SEEDED_USERS)[number]): Promise<HarnessClient> {
  const client = harness.client()
  expect((await client.login(user.username, user.password)).status).toBe(200)
  return client
}

beforeAll(async () => {
  // No send in this suite reaches Meta: the real configuration is not inherited.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('NUXT_WHATSAPP_')) Reflect.deleteProperty(process.env, key)
  }
  admin = new pg.Client({ connectionString: settings.adminUrl })
  await admin.connect()
  watcher = new pg.Client({ connectionString: settings.adminUrl })
  await watcher.connect()
  const current = await admin.query<{ name: string }>('SELECT current_database() AS name')
  assertTestDatabase(current.rows[0]!.name)
  database = createDatabase(settings.appUrl, { max: 2 })
  harness = await createPostgresHarness(database)
  ana = await signedIn(ANA)
  bruno = await signedIn(BRUNO)
})

afterAll(async () => {
  await harness?.close()
  await admin?.end()
  await watcher?.end()
})

describe('la salvaguarda y la conexión', () => {
  it('C0: la suite se niega a operar sobre otra base, y la aplicación conecta como palco_app con sus tiempos', async () => {
    for (const name of ['palco', 'postgres', 'palco_test', 'palco_test_; DROP DATABASE palco']) {
      expect(() => assertTestDatabase(name)).toThrow('se niega')
    }
    expect(assertTestDatabase(settings.name)).toBe(settings.name)
    const { rows } = await database.query<{ who: string, lock: string, idle: string, statement: string, zone: string }>(
      `SELECT current_user AS who, current_setting('lock_timeout') AS lock,
              current_setting('idle_in_transaction_session_timeout') AS idle, current_setting('statement_timeout') AS statement,
              current_setting('TimeZone') AS zone`,
    )
    expect(rows[0]).toEqual({ who: 'palco_app', lock: '5s', idle: '15s', statement: '15s', zone: 'UTC' })
  })
})

describe('la disponibilidad', () => {
  beforeEach(() => resetSales('teatro-scala=4'))

  it('C1: dos compras de 3 con 4 libres dan una 201 y una 400 ERR_EXCEEDS_AVAILABILITY; vendidos 3', async () => {
    const check = (responses: readonly HarnessResponse[]) => {
      expect(statuses(responses)).toEqual([201, 400])
      expect(responses.find((response) => response.status === 400)!.json).toMatchObject({ step: 'tickets', field: 'quantity', code: 'ERR_EXCEEDS_AVAILABILITY' })
    }
    const { waited, responses } = await forced(venueLock('teatro-scala'), venueUnlock('teatro-scala'), 2, () => [buy(ana, 'teatro-scala', 3), buy(bruno, 'teatro-scala', 3)])
    check(responses)
    expect(await soldIn('teatro-scala')).toBe(3)
    expect(waited).toBe(true)

    for (let round = 0; round < REPETITIONS; round += 1) {
      await resetSales('teatro-scala=4')
      check(await Promise.all([buy(ana, 'teatro-scala', 3), buy(bruno, 'teatro-scala', 3)]))
      expect(await soldIn('teatro-scala'), `vuelta ${round}`).toBe(3)
    }
  })

  it('C14: una compra confirmada se ve al instante en el catálogo de otra sesión', async () => {
    const before = await available(bruno, 'teatro-scala')
    expect((await buy(ana, 'teatro-scala', 3)).status).toBe(201)
    expect(await available(bruno, 'teatro-scala')).toBe(before - 3)
    expect(((await bruno.get('/api/venues/teatro-scala')).json as { available: number }).available).toBe(before - 3)
  })

  it('C17: con el bloqueo del recinto tomado, el catálogo y el detalle responden sin esperar', async () => {
    const [sql, params] = venueLock('teatro-scala')
    await admin.query(sql, [...params])
    try {
      const started = performance.now()
      expect((await ana.get('/api/catalog')).status).toBe(200)
      expect((await ana.get('/api/venues/teatro-scala')).status).toBe(200)
      // Far below the 5 s `lock_timeout` it would hit if it waited.
      expect(performance.now() - started).toBeLessThan(1000)
    }
    finally {
      const [unlock, unlockParams] = venueUnlock('teatro-scala')
      await admin.query(unlock, [...unlockParams])
    }
  })

  it('C19: una compra que espera el bloqueo más de 5 s responde 500 sin nada escrito (55P03)', async () => {
    const [sql, params] = venueLock('teatro-scala')
    await admin.query(sql, [...params])
    try {
      const response = await buy(ana, 'teatro-scala', 1)
      expect(response.status).toBe(500)
      expect(response.json).toMatchObject({ ok: false, code: 'ERR_PURCHASE_NOT_RECORDED' })
    }
    finally {
      const [unlock, unlockParams] = venueUnlock('teatro-scala')
      await admin.query(unlock, [...unlockParams])
    }
    expect(await countOf('purchases')).toBe(0)
  })
})

describe('el límite por usuario', () => {
  beforeEach(() => resetSales())

  it('C2: el mismo usuario, recinto y fecha, dos compras de 6 en teatro: una 201 y una 400 ERR_EXCEEDS_USER_LIMIT', async () => {
    const check = (responses: readonly HarnessResponse[]) => {
      expect(statuses(responses)).toEqual([201, 400])
      expect(responses.find((response) => response.status === 400)!.json).toMatchObject({ field: 'quantity', code: 'ERR_EXCEEDS_USER_LIMIT' })
    }
    const { waited, responses } = await forced(venueLock('teatro-colon'), venueUnlock('teatro-colon'), 2, () => [buy(ana, 'teatro-colon', 6), buy(ana, 'teatro-colon', 6)])
    check(responses)
    expect(await soldIn('teatro-colon')).toBe(6)
    expect(waited).toBe(true)

    for (let round = 0; round < REPETITIONS; round += 1) {
      await resetSales()
      check(await Promise.all([buy(ana, 'teatro-colon', 6), buy(ana, 'teatro-colon', 6)]))
      expect(await soldIn('teatro-colon'), `vuelta ${round}`).toBe(6)
    }
  })
})

describe('la clave de solicitud', () => {
  beforeEach(() => resetSales())

  it('C3: el mismo requestId y cuerpo, dos veces: una 201 y una 200 con el mismo folio; una sola compra', async () => {
    const check = async (responses: readonly HarnessResponse[]) => {
      expect(statuses(responses)).toEqual([200, 201])
      expect(responses[0]!.json).toEqual(responses[1]!.json)
      expect(await countOf('purchases')).toBe(1)
      expect(await soldIn('cinepolis')).toBe(2)
    }
    const first = body('cinepolis', 2)
    const { waited, responses } = await forced(venueLock('cinepolis'), venueUnlock('cinepolis'), 2, () => [ana.post('/api/purchases', first), ana.post('/api/purchases', first)])
    await check(responses)
    expect(waited).toBe(true)

    for (let round = 0; round < REPETITIONS; round += 1) {
      await resetSales()
      const same = body('cinepolis', 2)
      await check(await Promise.all([ana.post('/api/purchases', same), ana.post('/api/purchases', same)]))
    }
  })

  it('C4: el mismo requestId en dos recintos: una 201 y una 400 en requestId; una sola compra', async () => {
    const check = async (responses: readonly HarnessResponse[]) => {
      expect(statuses(responses)).toEqual([201, 400])
      expect(responses.find((response) => response.status === 400)!.json).toMatchObject({ ok: false, step: null, field: 'requestId', code: 'ERR_INPUT_INVALID' })
      expect(await countOf('purchases')).toBe(1)
    }
    const id = randomUUID()
    // They do not wait for the venue: the folio lock brings them together, and they
    // collide on insert.
    const { waited, responses } = await forced(folioLock, folioUnlock, 2, () => [ana.post('/api/purchases', body('teatro-scala', 1, id)), ana.post('/api/purchases', body('louvre', 1, id))])
    await check(responses)
    expect(waited).toBe(true)

    for (let round = 0; round < REPETITIONS; round += 1) {
      await resetSales()
      const shared = randomUUID()
      await check(await Promise.all([ana.post('/api/purchases', body('teatro-scala', 1, shared)), ana.post('/api/purchases', body('louvre', 1, shared))]))
    }
  })
})

describe('el folio', () => {
  beforeEach(() => resetSales())

  const EIGHT = ['teatro-colon', 'teatro-scala', 'teatro-metropolitan', 'cinepolis', 'cinemex', 'amc', 'cinemark', 'louvre']

  it('C5: ocho compras simultáneas en ocho recintos: ocho 201, con folios consecutivos y sin huecos', async () => {
    const check = (responses: readonly HarnessResponse[]) => {
      expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201))
      const year = new Date().getFullYear()
      const folios = responses.map((response) => (response.json as { folio: string }).folio).sort()
      expect(folios).toEqual(Array.from({ length: 8 }, (_, index) => `PLC-${(index + 1).toString(16).toUpperCase().padStart(4, '0')}-${year}`))
    }
    // With `max: 2`, two reach the lock and the rest wait for a connection.
    const { waited, responses } = await forced(folioLock, folioUnlock, 2, () => EIGHT.map((venueId) => buy(ana, venueId, 1)))
    check(responses)
    expect(waited).toBe(true)

    for (let round = 0; round < REPETITIONS; round += 1) {
      await resetSales()
      check(await Promise.all(EIGHT.map((venueId) => buy(ana, venueId, 1))))
    }
  })

  it('C6: un fallo a mitad de la transacción da 500, sin compra ni boletos, y la siguiente lleva el folio que tocaba', async () => {
    const year = new Date().getFullYear()
    expect((await buy(ana, 'cinepolis', 1)).status).toBe(201)
    await admin.query(`
      CREATE FUNCTION fallo_inyectado() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fallo_inyectado BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION fallo_inyectado();
    `)
    const retried = body('cinepolis', 2)
    try {
      const failed = await ana.post('/api/purchases', retried)
      expect(failed.status).toBe(500)
      expect(failed.json).toMatchObject({ ok: false, code: 'ERR_PURCHASE_NOT_RECORDED' })
      expect(await countOf('purchases')).toBe(1)
      expect(await countOf('tickets')).toBe(1)
    }
    finally {
      await admin.query('DROP TRIGGER fallo_inyectado ON tickets; DROP FUNCTION fallo_inyectado();')
    }
    const next = await ana.post('/api/purchases', retried)
    expect(next.status).toBe(201)
    expect((next.json as { folio: string }).folio).toBe(`PLC-0002-${year}`)
    expect(await countOf('tickets')).toBe(3)
  })
})

describe('la cuenta', () => {
  const CARDS = ['4111111111111111', '5555555555554444', '5105105105105100', '4012888888881881', '4242424242424242']
  const card = (cardNumber: string, holder = 'Ana Ríos') => ({ method: 'credit', cardNumber, holder, expiry: '12/40', email: '' })
  const save = (body: unknown) => ana.post('/api/payment-methods', body)
  const userLock: Query = ['SELECT pg_advisory_lock($1::int, $2::int)', [USER_LOCK_SPACE, 1]]
  const userUnlock: Query = ['SELECT pg_advisory_unlock($1::int, $2::int)', [USER_LOCK_SPACE, 1]]

  async function resetAccount(): Promise<void> {
    await admin.query('TRUNCATE payment_methods, payment_method_additions')
  }

  /** Tests the race with the brake and then 20 times without it. */
  async function raced(prepare: () => Promise<void>, requests: () => readonly Promise<HarnessResponse>[], check: (responses: readonly HarnessResponse[]) => Promise<void>) {
    await prepare()
    const { waited, responses } = await forced(userLock, userUnlock, 2, requests)
    await check(responses)
    expect(waited).toBe(true)
    for (let round = 0; round < REPETITIONS; round += 1) {
      await prepare()
      await check(await Promise.all(requests()))
    }
  }

  const expectRejected = (responses: readonly HarnessResponse[], ok: number, code: string) => {
    expect(statuses(responses)).toEqual([ok, 400])
    expect(responses.find((response) => response.status === 400)!.json).toMatchObject({ ok: false, code })
  }

  beforeAll(async () => {
    const { rows } = await admin.query<{ id: number }>('SELECT id FROM users WHERE username = $1', [ANA.username])
    expect(rows[0]!.id).toBe(1)
  })

  it('C8: con 2 métodos guardados, dos altas distintas dan una 201 y una 400 ERR_SAVED_METHODS_LIMIT; quedan 3 filas', async () => {
    await raced(async () => {
      await resetAccount()
      expect((await save(card(CARDS[0]!))).status).toBe(201)
      expect((await save(card(CARDS[1]!))).status).toBe(201)
    }, () => [save(card(CARDS[2]!)), save(card(CARDS[3]!))], async (responses) => {
      expectRejected(responses, 201, 'ERR_SAVED_METHODS_LIMIT')
      expect(await countOf('payment_methods')).toBe(3)
    })
  })

  it('C9: el mismo método, dos veces a la vez: una 201 y una 400 ERR_SAVED_METHOD_DUPLICATE', async () => {
    await raced(resetAccount, () => [save(card(CARDS[0]!)), save(card(CARDS[0]!))], async (responses) => {
      expectRejected(responses, 201, 'ERR_SAVED_METHOD_DUPLICATE')
      expect(await countOf('payment_methods')).toBe(1)
    })
  })

  it('C10: con 4 altas hoy, dos altas simultáneas dan una 201 y una 400 ERR_SAVED_METHOD_DAILY_LIMIT', async () => {
    const today = formatIsoDate(toCalendarDate(new Date()))
    await raced(async () => {
      await resetAccount()
      for (let index = 0; index < 4; index += 1) {
        await admin.query('INSERT INTO payment_method_additions (user_id, added_on) VALUES ($1, $2)', [1, today])
      }
    }, () => [save(card(CARDS[0]!)), save(card(CARDS[1]!))], async (responses) => {
      expectRejected(responses, 201, 'ERR_SAVED_METHOD_DAILY_LIMIT')
      expect(await countOf('payment_methods')).toBe(1)
      expect(await countOf('payment_method_additions')).toBe(5)
    })
  })

  it('C11: dos ediciones que crearían el mismo duplicado dan una 200 y una 400; una edición y una baja nunca dan un 200 sobre una fila borrada', async () => {
    // The same card with different holders is not a duplicate, until they match.
    let ids: string[] = []
    const edit = (id: string, holder = 'Zoe Ríos') => ana.patch(`/api/payment-methods/${id}`, { holder, expiry: '12/40' })
    await raced(async () => {
      await resetAccount()
      ids = []
      for (const holder of ['Ana Ríos', 'Bea Ríos', 'Carla Ríos']) {
        ids.push(((await save(card(CARDS[0]!, holder))).json as { method: { id: string } }).method.id)
      }
    }, () => [edit(ids[1]!), edit(ids[2]!)], async (responses) => {
      expectRejected(responses, 200, 'ERR_SAVED_METHOD_DUPLICATE')
    })

    await raced(async () => {
      await resetAccount()
      ids = [((await save(card(CARDS[0]!))).json as { method: { id: string } }).method.id]
    }, () => [edit(ids[0]!), ana.delete(`/api/payment-methods/${ids[0]!}`)], async (responses) => {
      expect(responses[1]!.status).toBe(200)
      expect([200, 404]).toContain(responses[0]!.status)
      expect(await countOf('payment_methods')).toBe(0)
    })
  })
})

describe('el registro', () => {
  const CURP = 'LOMA081014MJCPRRA6JC'
  const REGISTRATION = { username: CURP, displayName: 'Lucía Pérez', email: '', password: 'Abc123$%', passwordConfirmation: 'Abc123$%' }
  const register = (body: unknown = REGISTRATION) => harness.client().post('/api/auth/register', body)

  async function setPolicy(policy?: { limit: number, windowMs: number }): Promise<void> {
    const { resetRegistrationAttempts } = await harness.load<typeof import('../../server/data/registration-attempts')>('server/data/registration-attempts.ts')
    resetRegistrationAttempts(policy)
  }

  afterAll(() => setPolicy())

  it('C7: dos registros simultáneos de la misma CURP dan una 201 y una 400 ERR_CURP_ALREADY_REGISTERED, nunca 500', async () => {
    await setPolicy({ limit: 1000, windowMs: 60_000 })
    const check = async (responses: readonly HarnessResponse[]) => {
      expect(statuses(responses)).toEqual([201, 400])
      expect(responses.find((response) => response.status === 400)!.json).toEqual({
        ok: false,
        field: null,
        code: 'ERR_CURP_ALREADY_REGISTERED',
        message: 'Esta CURP ya está registrada. Inicia sesión con ella',
      })
      const { rows } = await admin.query<{ n: string }>('SELECT COUNT(*) AS n FROM users WHERE username = $1', [CURP])
      expect(Number(rows[0]!.n)).toBe(1)
      await admin.query('DELETE FROM users WHERE username = $1', [CURP])
    }

    // The brake: an uncommitted insert of the same CURP leaves both requests waiting
    // on the `UNIQUE`, already past the pre-check. When it is rolled back, they collide.
    await admin.query('BEGIN')
    let pending: Promise<HarnessResponse[]>
    let waited: boolean
    try {
      await admin.query("INSERT INTO users (username, password_hash, display_name) VALUES ($1, 'x', 'Freno')", [CURP])
      pending = Promise.all([register(), register()])
      waited = await waitForWaiters(2, 'transactionid')
    }
    finally {
      await admin.query('ROLLBACK')
    }
    await check(await pending)
    expect(waited).toBe(true)

    for (let round = 0; round < REPETITIONS; round += 1) {
      await check(await Promise.all([register(), register()]))
    }
  })

  it('C13: con la política 2/60, tres registros simultáneos desde la misma IP: dos admitidos y un 429', async () => {
    await setPolicy({ limit: 2, windowMs: 60_000 })
    const responses = await Promise.all([register({}), register({}), register({})])
    expect(statuses(responses)).toEqual([400, 400, 429])
    const limited = responses.find((response) => response.status === 429)!
    expect(limited.json).toMatchObject({ ok: false, field: null, code: 'ERR_REGISTRATION_RATE_LIMITED' })
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
  })
})

describe('el envío', () => {
  let mock: Server
  let received: MockMetaRequest[] = []
  // The send stays in progress until the test releases it: if it ended before the
  // second POST decided, that would be another legitimate send and not a race.
  let hold: Promise<void> = Promise.resolve()

  beforeAll(async () => {
    mock = createMockMetaServer({ scenario: 'ok', onRequest: (entry) => received.push(entry), holdMessages: () => hold })
    await new Promise<void>((done) => mock.listen(0, '127.0.0.1', done))
    await harness.configureWhatsapp({
      NUXT_WHATSAPP_ACCESS_TOKEN: 'token-sintetico-de-c12',
      NUXT_WHATSAPP_PHONE_NUMBER_ID: 'phone-sintetico',
      NUXT_WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-sintetica',
      NUXT_WHATSAPP_TICKET_TEMPLATE: 'palco_boletos_v2',
      NUXT_WHATSAPP_TEMPLATE_LANGUAGE: 'es_MX',
      NUXT_WHATSAPP_API_BASE: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`,
    })
  })

  afterAll(async () => {
    await harness.configureWhatsapp(null)
    await new Promise<void>((done) => mock.close(() => done()))
  })

  async function settled(folio: string) {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const status = (await ana.get(`/api/purchases/${folio}/whatsapp`)).json as { state: string, remaining: number }
      if (status.state !== 'sending') return status
      await new Promise((done) => setTimeout(done, 10))
    }
    throw new Error('El envío no terminó')
  }

  it('C12: dos POST de envío simultáneos dan dos 202 y un solo envío iniciado', async () => {
    await resetSales()
    // The purchase happens before saving the number, so there is no automatic send.
    const { folio } = (await buy(ana, 'louvre', 1)).json as { folio: string }
    expect((await ana.put('/api/profile/whatsapp', { country: 'ES', number: '612345678', consent: true })).status).toBe(200)
    const { resetWhatsappSends } = await harness.load<typeof import('../../server/data/whatsapp-sends')>('server/data/whatsapp-sends.ts')

    for (let round = 0; round < REPETITIONS; round += 1) {
      resetWhatsappSends()
      received = []
      let release = () => {}
      hold = new Promise((done) => {
        release = done
      })
      const responses = await Promise.all([ana.post(`/api/purchases/${folio}/whatsapp`), ana.post(`/api/purchases/${folio}/whatsapp`)])
      release()
      expect(responses.map((response) => response.status)).toEqual([202, 202])
      const status = await settled(folio)
      expect(status.state).toBe('sent')
      expect(status.remaining).toBe(2)
      expect(received.filter((entry) => entry.resource === 'media')).toHaveLength(1)
      expect(received.filter((entry) => entry.resource === 'messages')).toHaveLength(1)
    }
  })
})

describe('la admisión', () => {
  // RN-ACC-04: a ticket enters only once, decided by the primary key of `admissions`
  // with `INSERT … ON CONFLICT DO NOTHING`, without an advisory lock. The process
  // clock starts on Monday, October 26, 2026 at 18:00 and advances in real time:
  // Cinépolis opens from 11:00 to 23:30, and the suite does not depend on the time it
  // runs. The race is forced with a `LOCK TABLE` that collides with both INSERTs.
  const PIN = 'Taquilla-2026'

  interface Issued { readonly shortCode: string, readonly qrPayload: string }

  async function cinemaTickets(): Promise<readonly Issued[]> {
    const response = await ana.post('/api/purchases', {
      requestId: randomUUID(),
      venueId: 'cinepolis',
      tickets: { filmIndex: 3, age: '21', formatId: 'vip', date: '26/10/2026', time: '20:00', quantity: '2', seats: ['12', '13'] },
      payment: CARD,
    })
    expect(response.status, JSON.stringify(response.json)).toBe(201)
    const { folio } = response.json as { folio: string }
    return ((await ana.get(`/api/purchases/${folio}`)).json as { tickets: Issued[] }).tickets
  }

  async function gate(venueId: string): Promise<HarnessClient> {
    const client = harness.client()
    expect((await client.post('/api/gate/open', { venueId, pin: PIN })).status).toBe(200)
    return client
  }

  const admit = (client: HarnessClient, code: string) => client.post('/api/gate/admissions', { code })

  /** The requests wait for the test's `LOCK TABLE admissions`, and are released together. */
  async function forcedOnAdmissions(waiters: number, requests: () => readonly Promise<HarnessResponse>[]) {
    await admin.query('BEGIN')
    let released = false
    const release = async () => {
      if (!released) await admin.query('COMMIT')
      released = true
    }
    try {
      await admin.query('LOCK TABLE admissions IN SHARE ROW EXCLUSIVE MODE')
      const pending = Promise.all(requests())
      const waited = await waitForWaiters(waiters, 'relation')
      await release()
      return { waited, responses: await pending }
    }
    finally {
      await release()
    }
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(NOW)
    await harness.configureGate(PIN)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(async () => {
    vi.setSystemTime(NOW)
    await resetSales()
  })

  it('C20: dos lecturas simultáneas del mismo boleto, QR y código corto: una 201 y una 409 con la misma hora; una sola fila', async () => {
    const [ticket] = await cinemaTickets()
    const [first, second] = [await gate('cinepolis'), await gate('cinepolis')]

    const { waited, responses } = await forcedOnAdmissions(2, () => [admit(first, ticket!.qrPayload), admit(second, ticket!.shortCode)])
    expect(waited).toBe(true)
    expect(statuses(responses)).toEqual([201, 409])
    const admitted = responses.find((response) => response.status === 201)!.json as { admittedAt: string }
    const refused = responses.find((response) => response.status === 409)!.json as { code: string, admittedAt: string }
    expect(refused.code).toBe('ERR_TICKET_ALREADY_USED')
    expect(refused.admittedAt).toBe(admitted.admittedAt)
    expect(await countOf('admissions')).toBe(1)

    for (let repetition = 0; repetition < REPETITIONS; repetition++) {
      await admin.query('TRUNCATE admissions')
      const both = await Promise.all([admit(first, ticket!.shortCode), admit(second, repetition % 2 === 0 ? ticket!.qrPayload : ticket!.shortCode)])
      expect(statuses(both), `repetición ${repetition}`).toEqual([201, 409])
      expect(await countOf('admissions'), `repetición ${repetition}`).toBe(1)
    }
  })

  it('C21: dos boletos de la misma compra a la vez entran los dos: ninguna serialización de más', async () => {
    const tickets = await cinemaTickets()
    const cinepolis = await gate('cinepolis')
    const { waited, responses } = await forcedOnAdmissions(2, () => tickets.map((ticket) => admit(cinepolis, ticket.shortCode)))
    expect(waited).toBe(true)
    expect(statuses(responses)).toEqual([201, 201])
    expect(await countOf('admissions')).toBe(2)
  })

  it('C22: el mismo boleto en dos taquillas de recintos distintos: una 201 y una 400 de otro recinto', async () => {
    const [ticket] = await cinemaTickets()
    const [cinepolis, cinemex] = [await gate('cinepolis'), await gate('cinemex')]
    for (let repetition = 0; repetition < REPETITIONS; repetition++) {
      await admin.query('TRUNCATE admissions')
      const both = await Promise.all([admit(cinepolis, ticket!.shortCode), admit(cinemex, ticket!.shortCode)])
      expect(statuses(both), `repetición ${repetition}`).toEqual([201, 400])
      expect(both.map((response) => (response.json as { code?: string }).code).filter(Boolean), `repetición ${repetition}`).toEqual(['ERR_TICKET_OTHER_VENUE'])
      expect(await countOf('admissions')).toBe(1)
    }
  })
})

describe('los roles', () => {
  /** A connection of its own with a role's URL, closed when done. */
  async function as<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      return await fn(client)
    }
    finally {
      await client.end()
    }
  }

  // On the real server, not with `SET ROLE` as in PGlite: the reader connects with
  // its own role, and `default_transaction_read_only` stops its writes (25006).
  it('C16: el lector no lee el número ni los bytes y no escribe; lee las vistas, los ingresos y lo demás; palco_app no tiene DDL ni borra compras ni ingresos', async () => {
    await resetSales()
    await buy(ana, 'teatro-scala', 1)
    await admin.query("INSERT INTO whatsapp_numbers (user_id, e164) SELECT id, '+523312345678' FROM users WHERE username = $1", [ANA.username])
    await admin.query("INSERT INTO profile_photos (user_id, format, data, version) SELECT id, 'png', '\\x89504e47'::bytea, 'v-c16' FROM users WHERE username = $1", [ANA.username])
    try {
      await as(settings.readerUrl, async (reader) => {
        for (const sql of ['SELECT e164 FROM whatsapp_numbers', 'SELECT * FROM whatsapp_numbers', 'SELECT data FROM profile_photos']) {
          await expect(reader.query(sql), sql).rejects.toMatchObject({ code: '42501' })
        }
        const status = (await reader.query<{ display_name: string, registered: boolean }>('SELECT * FROM whatsapp_status')).rows
        expect(status).toMatchObject([{ display_name: ANA.displayName, registered: true }])
        expect(JSON.stringify(status)).not.toContain('3312345678')
        expect((await reader.query('SELECT user_id, format, bytes FROM profile_photo_summary')).rows).toMatchObject([{ format: 'png', bytes: 4 }])
        for (const sql of ['SELECT holder FROM payment_methods', 'SELECT password_hash FROM users', 'SELECT payment_summary FROM purchases', 'SELECT * FROM payments', 'SELECT * FROM purchase_history', 'SELECT * FROM admissions']) {
          await expect(reader.query(sql), sql).resolves.toBeDefined()
        }
        for (const sql of ["INSERT INTO venue_sections (venue_id, position, name, price_cents) VALUES ('teatro-scala', 99, 'x', 1)", 'DELETE FROM tickets', "UPDATE users SET display_name = 'x'", 'DELETE FROM admissions']) {
          await expect(reader.query(sql), sql).rejects.toMatchObject({ code: '25006' })
        }
      })
      await as(settings.appUrl, async (app) => {
        for (const sql of ['DROP TABLE tickets', "INSERT INTO venues (id, category, name, city, jurisdiction, currency, capacity, opens, closes, restrictions) VALUES ('c16', 'cine', 'x', 'x', 'MX', 'MXN', 1, '10:00', '11:00', 'x')", 'DELETE FROM purchases', 'CREATE TABLE c16 (id integer)', 'DELETE FROM admissions', 'UPDATE admissions SET admitted_at = now()']) {
          await expect(app.query(sql), sql).rejects.toMatchObject({ code: '42501' })
        }
      })
      expect(await countOf('purchases')).toBe(1)
      expect(await countOf('tickets')).toBe(1)
    }
    finally {
      await admin.query('TRUNCATE profile_photos')
    }
  })
})

describe('la paridad y la evidencia', () => {
  const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
  const PAYMENT: PaymentInput = { method: 'credit', cardNumber: '4111111111111111', holder: 'Ana Sofía Ríos Vela', expiry: '12/28', securityCode: '987', email: '' }
  const CASES: readonly (readonly [string, TicketsInput, PaymentInput])[] = [
    ['teatro-scala', { category: 'teatro', input: { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '3' } }, PAYMENT],
    ['cinepolis', { category: 'cine', input: { filmIndex: 3, age: '21', formatId: 'vip', date: '10/10/2026', time: '19:00', quantity: '2', seats: ['12', '13'] } }, { ...PAYMENT, method: 'debit', cardNumber: '5555555555554444' }],
    ['louvre', { category: 'museo', input: { isResident: true, date: '15/10/2026', time: '10:00', quantity: '3' } }, { method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email: 'ana.rios@example.com' }],
  ]

  function records(): PurchaseRecord[] {
    return CASES.map(([venueId, tickets, payment], index) => {
      const sequence = index + 1
      const venue = venueOf(venueId)
      const confirmation = confirmPurchase(venue, tickets, payment, { userLimit: 10, available: venue.capacity, today: TODAY, sequence })
      if (!confirmation.ok) throw new Error(`La compra de ${venueId} debe ser válida`)
      return {
        userId: 1,
        sequence,
        requestId: `c15-${index}`,
        fingerprint: `huella-${index}`,
        purchase: confirmation.purchase,
        ticketIds: Array.from({ length: confirmation.purchase.quantity }, (_, offset) => fixedTicketId(sequence, offset + 1)),
      }
    })
  }

  it('C15: la misma compra, escrita y leída en PGlite y en pg, da el mismo JSON', async () => {
    await resetSales()
    const pglite = await createTestDatabase()
    try {
      await resetTestDatabase(pglite)
      const read = async (target: Database) => {
        const folios = []
        for (const record of records()) {
          await insertPurchase(record, target)
          folios.push(await findPurchaseByFolio(1, record.purchase.folio, target))
        }
        return {
          folios,
          list: await listPurchases(1, target),
          sold: [...(await soldByVenue(target))].sort(),
          next: await nextSequence(target),
          raw: (await target.query(
            `SELECT sequence, folio, event_date, event_time, quantity, total_cents, payment_summary, details, purchased_on
             FROM purchases ORDER BY sequence`,
          )).rows,
          // Both connections pin the time zone: the same timestamp reads the same.
          stamp: (await target.query("SELECT TIMESTAMPTZ '2026-01-01 12:00:00-06' AS stamp")).rows,
        }
      }
      const fromPostgres = await read(database)
      const fromPglite = await read(pglite)
      expect(JSON.stringify(fromPglite)).toBe(JSON.stringify(fromPostgres))
    }
    finally {
      await pglite.close()
    }
  })

  it('C18: db:evidence, en un proceso aparte, sale con 0 y, con la consistencia rota, con 1', async () => {
    await resetSales()
    const { folio } = (await buy(ana, 'teatro-scala', 2)).json as { folio: string }
    const run = () => spawnSync('node', ['--import', join(ROOT, 'scripts/resolve-ts.ts'), join(ROOT, 'scripts/db-evidence.ts')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NUXT_DATABASE_READER_URL: settings.readerUrl },
    })
    const clean = run()
    expect(clean.status, clean.stderr.slice(0, 200)).toBe(0)
    expect(clean.stdout).toContain('Todas las comprobaciones de consistencia pasan.')
    expect(clean.stdout).toContain('Servidor: PostgreSQL 18.6')

    await admin.query('DELETE FROM tickets WHERE folio = $1 AND ordinal = 2', [folio])
    const broken = run()
    expect(broken.status).toBe(1)
    expect(broken.stdout).toContain(`${folio}: cantidad 2, boletos 1`)
  })
})

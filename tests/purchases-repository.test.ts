import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveAvailability, freeSeats, setAvailabilityOverrides } from '../server/data/availability'
import { VENUES } from '../server/data/catalog'
import type { Queryable } from '../server/db/client'
import { countAdditionsOn, insertPaymentMethod } from '../server/db/payment-methods.repository'
import {
  findPurchaseByFolio,
  findRequest,
  findTicket,
  findTicketsByFolio,
  insertPurchase,
  listPurchases,
  nextSequence,
  purchasedQuantity,
  soldByVenue,
  soldInVenue,
  type PurchaseRecord,
} from '../server/db/purchases.repository'
import { confirmPurchase, type TicketsInput } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import { requestReplay } from '../server/utils/purchase-request'
import { startSalesState } from '../server/utils/sales-startup'
import type { CalendarDate, Purchase, Venue } from '../types'
import { ANA, BRUNO, createTestDatabase, fixedTicketId, resetTestDatabase, seedTestUsers, type TestDatabase } from './support/database'

// Purchases in the database, on PGlite with the real schema and as `palco_app`.
// Each case carries its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }

const CREDIT: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const DEBIT: PaymentInput = { ...CREDIT, method: 'debit', cardNumber: '5555555555554444' }
const PAYPAL: PaymentInput = { method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email: 'ana.rios@example.com' }

// The B, K and M bases.
const CASES: readonly { readonly venueId: string, readonly tickets: TicketsInput, readonly payment: PaymentInput }[] = [
  { venueId: 'teatro-scala', tickets: { category: 'teatro', input: { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '3' } }, payment: CREDIT },
  { venueId: 'cinepolis', tickets: { category: 'cine', input: { filmIndex: 3, age: '21', formatId: 'vip', date: '10/10/2026', time: '19:00', quantity: '2', seats: ['12', '13'] } }, payment: DEBIT },
  { venueId: 'louvre', tickets: { category: 'museo', input: { isResident: true, date: '15/10/2026', time: '10:00', quantity: '3' } }, payment: PAYPAL },
  // B on another date, for the per-date limit (PU12).
  { venueId: 'teatro-scala', tickets: { category: 'teatro', input: { playIndex: 0, sectionIndex: 0, date: '06/10/2026', time: '15:00', quantity: '2' } }, payment: CREDIT },
]

let database: TestDatabase

function venue(id: string): Venue {
  return VENUES.find((candidate) => candidate.id === id)!
}

/** The confirmed purchase the endpoint would record, with the database counter. */
function confirmed(index: number, sequence: number): Purchase {
  const { venueId, tickets, payment } = CASES[index]!
  const target = venue(venueId)
  const confirmation = confirmPurchase(target, tickets, payment, { userLimit: 10, available: target.capacity, today: TODAY, sequence })
  if (!confirmation.ok) throw new Error(`La compra ${index} debe ser válida: ${confirmation.result.code}`)
  return confirmation.purchase
}

async function record(userId: number, index: number, requestId: string, db = database): Promise<PurchaseRecord> {
  const sequence = await nextSequence(db)
  const purchase = confirmed(index, sequence)
  return {
    userId,
    sequence,
    requestId,
    fingerprint: `huella-${index}`,
    purchase,
    ticketIds: Array.from({ length: purchase.quantity }, (_, offset) => fixedTicketId(sequence, offset + 1)),
  }
}

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => resetTestDatabase(database))

afterAll(() => database.close())

describe('repositorio de compras', () => {
  it.each([
    ['PU1a', 0],
    ['PU1b', 1],
    ['PU1c', 2],
  ])('%s: lo que se lee es igual en profundidad a lo que se registró', async (_, index) => {
    const stored = await record(ANA, index, `req-${index}`)
    await insertPurchase(stored, database)
    const read = await findPurchaseByFolio(ANA, stored.purchase.folio, database)
    expect(read).toStrictEqual(stored.purchase)
    // The key order too, so the API response does not change.
    expect(JSON.stringify(read)).toBe(JSON.stringify(stored.purchase))
    expect(await findTicketsByFolio(ANA, stored.purchase.folio, database)).toEqual(stored.ticketIds)
    for (const [offset, id] of stored.ticketIds.entries()) {
      expect(await findTicket(id, database)).toEqual({ id, folio: stored.purchase.folio, userId: ANA, number: offset + 1 })
    }
  })

  it('PU2: la lista va de la más reciente a la más antigua y no incluye compras ajenas', async () => {
    const first = await record(ANA, 0, 'a1')
    await insertPurchase(first, database)
    const foreign = await record(BRUNO, 1, 'b1')
    await insertPurchase(foreign, database)
    const last = await record(ANA, 2, 'a2')
    await insertPurchase(last, database)

    expect((await listPurchases(ANA, database)).map((purchase) => purchase.folio)).toEqual([last.purchase.folio, first.purchase.folio])
    expect((await listPurchases(BRUNO, database)).map((purchase) => purchase.folio)).toEqual([foreign.purchase.folio])
    expect(await findPurchaseByFolio(BRUNO, first.purchase.folio, database)).toBeNull()
    expect(await findTicketsByFolio(BRUNO, first.purchase.folio, database)).toBeNull()
    expect(await findPurchaseByFolio(ANA, 'PLC-0099-2026', database)).toBeNull()
  })

  describe('PU3: persistencia entre reinicios', () => {
    let directory = ''
    afterEach(() => {
      if (directory) rmSync(directory, { recursive: true, force: true })
    })

    it('PU3: el folio continúa y la clave devuelve el folio original', async () => {
      directory = mkdtempSync(join(tmpdir(), 'palco-pu3-'))
      const dataDir = join(directory, 'pgdata')
      const before = await createTestDatabase({ dataDir })
      await before.asOwner(() => seedTestUsers(before))
      expect(await nextSequence(before)).toBe(1)
      const first = await record(ANA, 0, 'clave-1', before)
      await insertPurchase(first, before)
      await before.close()

      const after = await createTestDatabase({ dataDir })
      expect(await nextSequence(after)).toBe(2)
      expect(await findRequest(ANA, 'clave-1', after)).toEqual({ fingerprint: 'huella-0', folio: 'PLC-0001-2026' })
      const second = await record(ANA, 1, 'clave-2', after)
      expect(second.purchase.folio).toBe('PLC-0002-2026')
      await insertPurchase(second, after)
      expect(await listPurchases(ANA, after)).toHaveLength(2)
      expect(await soldByVenue(after)).toEqual(new Map([['teatro-scala', 3], ['cinepolis', 2]]))
      await after.close()
    })
  })

  it('PU4: la misma clave de otro usuario es otra compra; del mismo usuario, la base la rechaza', async () => {
    await insertPurchase(await record(ANA, 0, 'misma'), database)
    await expect(insertPurchase(await record(BRUNO, 0, 'misma'), database)).resolves.toBeUndefined()
    expect((await findRequest(BRUNO, 'misma', database))?.folio).toBe('PLC-0002-2026')
    await expect(insertPurchase(await record(ANA, 1, 'misma'), database)).rejects.toMatchObject({ code: '23505', constraint: 'purchases_user_id_request_id_key' })
    expect(await nextSequence(database)).toBe(3)
  })

  it('PU7: ninguna fila contiene el número completo ni el código de seguridad (RNF-15)', async () => {
    for (const index of [0, 1, 2]) await insertPurchase(await record(ANA, index, `r${index}`), database)
    const dump = JSON.stringify(await Promise.all(['purchases', 'tickets', 'venues', 'venue_prices'].map(async (table) => (await database.query(`SELECT * FROM ${table}`)).rows)))
    expect(dump).toContain('************1111')
    expect(dump).not.toContain('4111111111111111')
    expect(dump).not.toContain('5555555555554444')
    expect(dump).not.toContain('987')
  })

  it('PU7b: ninguna columna nueva se llama como un dato prohibido (extiende SC1)', async () => {
    // The views too: `information_schema` gives their columns all the same. The venue
    // tables as well: that is why `attire` and not `dress_code`.
    for (const table of ['purchases', 'tickets', 'venues', 'venue_prices', 'payments', 'purchase_history',
      'venue_hours', 'venue_closed_weekdays', 'venue_exceptions', 'venue_annual_closures', 'venue_theaters',
      'venue_sections', 'venue_plays', 'venue_cinemas', 'venue_formats', 'venue_films', 'venue_museums']) {
      const columns = await database.asOwner(async () => (await database.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table])).rows.map((column) => column.column_name))
      expect(columns.length, table).toBeGreaterThan(0)
      for (const column of columns) expect(column).not.toMatch(/number|card|cvv|code|security/i)
    }
  })
})

describe('PU12: lo comprado por usuario, recinto y fecha (RN-CAN-07)', () => {
  it('PU12: suma las compras del usuario en ese recinto y esa fecha, y nada más', async () => {
    expect(await purchasedQuantity(ANA, 'teatro-scala', '2026-10-05', database)).toBe(0)
    await insertPurchase(await record(ANA, 0, 'a1'), database)
    expect(await purchasedQuantity(ANA, 'teatro-scala', '2026-10-05', database)).toBe(3)
    // It adds up: two purchases on the same date.
    await insertPurchase(await record(ANA, 0, 'a2'), database)
    expect(await purchasedQuantity(ANA, 'teatro-scala', '2026-10-05', database)).toBe(6)
    // Another date, another venue and another user do not count.
    await insertPurchase(await record(ANA, 3, 'a3'), database)
    await insertPurchase(await record(ANA, 1, 'a4'), database)
    await insertPurchase(await record(BRUNO, 0, 'b1'), database)
    expect(await purchasedQuantity(ANA, 'teatro-scala', '2026-10-05', database)).toBe(6)
    expect(await purchasedQuantity(ANA, 'teatro-scala', '2026-10-06', database)).toBe(2)
    expect(await purchasedQuantity(ANA, 'cinepolis', '2026-10-10', database)).toBe(2)
    expect(await purchasedQuantity(ANA, 'cinepolis', '2026-10-05', database)).toBe(0)
    expect(await purchasedQuantity(BRUNO, 'teatro-scala', '2026-10-05', database)).toBe(3)
    expect(await purchasedQuantity(BRUNO, 'teatro-scala', '2026-10-06', database)).toBe(0)
  })
})

describe('PU8: restricciones de la base', () => {
  const VALID = {
    sequence: 1,
    folio: 'PLC-0001-2026',
    user_id: ANA,
    venue_id: 'louvre',
    request_id: 'r',
    fingerprint: 'f',
    category: 'museo',
    venue_name: 'Museo del Louvre',
    city: 'París',
    restrictions: '',
    event_date: '2026-11-12',
    event_time: '10:00',
    quantity: 1,
    subtotal_cents: 3200,
    fee_cents: 0,
    total_cents: 3200,
    currency: 'EUR',
    payment_method: 'paypal',
    payment_summary: '{"method":"paypal","email":"a@b.co"}',
    details: '{}',
    purchased_on: '2026-10-25',
  }
  // The columns come from the assembled row, so that an `overrides` key that is not
  // in VALID, such as `status`, really reaches the INSERT.
  async function insertRaw(overrides: Readonly<Record<string, unknown>>): Promise<void> {
    const row = { ...VALID, ...overrides }
    const columns = Object.keys(row)
    await database.query(
      `INSERT INTO purchases (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    )
  }

  const insertTicket = (id: string, folio: string, ordinal: number) =>
    database.query('INSERT INTO tickets (id, folio, ordinal) VALUES ($1, $2, $3)', [id, folio, ordinal])
  const countOf = async (table: string) => (await database.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]

  it('PU8a: las claves foráneas están efectivas en la conexión', async () => {
    await expect(insertRaw({ venue_id: 'recinto-inexistente' })).rejects.toMatchObject({ code: '23503' })
  })

  it('PU8b: la fila de referencia se acepta', async () => {
    await expect(insertRaw({})).resolves.toBeUndefined()
  })

  it.each([
    ['PU8c', 'cantidad 0', { quantity: 0 }, '23514'],
    ['PU8d', 'método fuera del enum', { payment_method: 'cash', payment_summary: '{"method":"cash"}' }, '23514'],
    ['PU8e', 'details que no es JSON', { details: 'no es json' }, '22P02'],
    ['PU8f', 'resumen de pago que no es JSON', { payment_summary: 'no es json' }, '22P02'],
    ['PU8g', 'método distinto del resumen', { payment_method: 'credit' }, '23514'],
    ['PU8h', 'total que no es subtotal más cargo', { total_cents: 3300 }, '23514'],
    ['PU8i', 'cargo fuera de cine', { fee_cents: 100, total_cents: 3300 }, '23514'],
    ['PU8j', 'estado distinto de confirmed', { status: 'cancelled' }, '23514'],
    ['PU8k', 'fecha imposible', { event_date: '2026-13-45' }, '22008'],
    ['PU8l', 'recinto inexistente', { venue_id: 'opera' }, '23503'],
    ['PU8m', 'usuario inexistente', { user_id: 99 }, '23503'],
  ])('%s: %s se rechaza', async (_, __, overrides, code) => {
    await expect(insertRaw(overrides)).rejects.toMatchObject({ code })
    expect(await countOf('purchases')).toEqual({ n: 0 })
  })

  // PostgreSQL silently reads "12/11/2026" as December 11: the column does not
  // guarantee the ISO form, which is why the repository requires it.
  it('PU8k2: el repositorio rechaza una fecha que no es ISO sin llegar a la base', async () => {
    const reached = vi.fn(async () => ({ rows: [] }))
    const counting: Queryable = { query: reached as Queryable['query'] }
    await expect(purchasedQuantity(ANA, 'teatro-scala', '12/11/2026', counting)).rejects.toThrow('AAAA-MM-DD')
    expect(reached).not.toHaveBeenCalled()
    await expect(purchasedQuantity(ANA, 'teatro-scala', '2026-11-12', counting)).resolves.toBe(0)
    expect(reached).toHaveBeenCalledOnce()

    await expect(countAdditionsOn(ANA, '12/11/2026', counting)).rejects.toThrow('AAAA-MM-DD')
    await expect(insertPaymentMethod(ANA, { method: 'paypal', email: 'a@b.co' }, '12/11/2026', counting)).rejects.toThrow('AAAA-MM-DD')

    const stored = await record(ANA, 0, 'fecha-rara')
    const shifted = { ...stored, purchase: { ...stored.purchase, purchasedOn: { year: 20266, month: 11, day: 12 } } }
    await expect(insertPurchase(shifted, database)).rejects.toThrow('AAAA-MM-DD')
    expect(await countOf('purchases')).toEqual({ n: 0 })
  })

  it('PU8n: un boleto de una compra inexistente o con id de otra longitud se rechaza', async () => {
    await insertRaw({})
    await expect(insertTicket('0000000000000001', 'PLC-0002-2026', 1)).rejects.toMatchObject({ code: '23503' })
    await expect(insertTicket('CORTO', 'PLC-0001-2026', 1)).rejects.toMatchObject({ code: '23514' })
    await expect(insertTicket('0000000000000001', 'PLC-0001-2026', 0)).rejects.toMatchObject({ code: '23514' })
  })

  it('PU8o: borrar al usuario borra sus compras y sus boletos', async () => {
    await insertRaw({})
    await insertTicket('0000000000000001', 'PLC-0001-2026', 1)
    await database.asOwner(() => database.query('DELETE FROM users WHERE id = $1', [ANA]))
    expect(await countOf('purchases')).toEqual({ n: 0 })
    expect(await countOf('tickets')).toEqual({ n: 0 })
  })
})

// ── The purchase transaction ────────────────────────────────────────────────

const FAIL_AT_COMMIT = 'falla-en-el-commit'

/** The current availability, read from the database. */
async function available(venueId: string): Promise<number> {
  return freeSeats(venue(venueId), await soldInVenue(venueId, database))
}

/** What the endpoint would do: confirm with the current availability and record. */
async function attempt(
  userId: number,
  index: number,
  requestId: string,
  options: {
    readonly ids?: (sequence: number, quantity: number) => string[]
    readonly quantity?: string
    /** The flag that makes the deferred trigger fail: COMMIT fails after the seats were deducted. */
    readonly failAtCommit?: boolean
  } = {},
) {
  const { venueId, tickets, payment } = CASES[index]!
  const target = venue(venueId)
  const sequence = await nextSequence(database)
  const input = options.quantity === undefined ? tickets : { ...tickets, input: { ...tickets.input, quantity: options.quantity } } as TicketsInput
  const confirmation = confirmPurchase(target, input, payment, { userLimit: 10, available: await available(venueId), today: TODAY, sequence })
  if (!confirmation.ok) return { kind: 'rejected' as const, code: confirmation.result.code }
  const quantity = confirmation.purchase.quantity
  const ticketIds = options.ids?.(sequence, quantity) ?? Array.from({ length: quantity }, (_, offset) => fixedTicketId(sequence, offset + 1))
  const fingerprint = options.failAtCommit ? FAIL_AT_COMMIT : `huella-${index}`
  try {
    await insertPurchase({ userId, sequence, requestId, fingerprint, purchase: confirmation.purchase, ticketIds }, database)
    return { kind: 'recorded' as const, folio: confirmation.purchase.folio }
  }
  catch {
    return { kind: 'failed' as const }
  }
}

async function counts() {
  const count = async (table: string) => (await database.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]!.n
  return {
    purchases: await count('purchases'),
    tickets: await count('tickets'),
    next: await nextSequence(database),
    seats: Object.fromEntries(await Promise.all(CASES.map(async ({ venueId }) => [venueId, await available(venueId)] as const))),
  }
}

describe('transacción de la compra', () => {
  // A deferred trigger fails on COMMIT. It only exists in this test: the real
  // database does not have it.
  beforeAll(() => database.asOwner(() => database.exec(`
    CREATE FUNCTION fail_at_commit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fallo inyectado en el COMMIT'; END $$ LANGUAGE plpgsql;
    CREATE CONSTRAINT TRIGGER fail_at_commit AFTER INSERT ON purchases DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.fingerprint = '${FAIL_AT_COMMIT}') EXECUTE FUNCTION fail_at_commit();
  `)))

  beforeEach(() => {
    setAvailabilityOverrides(new Map())
  })

  it('PU5a: un id de boleto repetido a mitad de la transacción no deja nada', async () => {
    expect((await attempt(ANA, 0, 'antes')).kind).toBe('recorded')
    const before = await counts()
    const repeated = await attempt(ANA, 0, 'repetido', { ids: (sequence) => [fixedTicketId(sequence, 1), fixedTicketId(sequence, 2), fixedTicketId(sequence, 1)] })
    expect(repeated.kind).toBe('failed')
    expect(await counts()).toEqual(before)
    expect(await findRequest(ANA, 'repetido', database)).toBeNull()
  })

  it('PU5b: un id que ya es de otra compra tampoco deja nada', async () => {
    expect((await attempt(ANA, 0, 'primera')).kind).toBe('recorded')
    const before = await counts()
    expect((await attempt(ANA, 1, 'choca', { ids: () => [fixedTicketId(1, 1), fixedTicketId(9, 9)] })).kind).toBe('failed')
    expect(await counts()).toEqual(before)
  })

  it('PU5d: si el COMMIT falla, no queda nada', async () => {
    const before = await counts()
    expect((await attempt(ANA, 2, 'commit', { failAtCommit: true })).kind).toBe('failed')
    expect(database.inTransaction()).toBe(false)
    expect(await counts()).toEqual(before)
  })

  it('PU10: tras el 500, el reintento con el mismo requestId crea la compra y no la trata como repetida', async () => {
    const fingerprint = 'huella-1'
    expect((await attempt(ANA, 1, 'reintento', { ids: (sequence) => [fixedTicketId(sequence, 1), fixedTicketId(sequence, 1)] })).kind).toBe('failed')
    // What the endpoint's retry check decides from what is left in the database.
    expect(requestReplay(await findRequest(ANA, 'reintento', database), fingerprint)).toEqual({ kind: 'new' })

    const retried = await attempt(ANA, 1, 'reintento')
    expect(retried).toEqual({ kind: 'recorded', folio: 'PLC-0001-2026' })
    expect(requestReplay(await findRequest(ANA, 'reintento', database), fingerprint)).toEqual({ kind: 'replay', folio: 'PLC-0001-2026' })
    expect(await available('cinepolis')).toBe(venue('cinepolis').capacity - 2)
  })

  it('INV31: para cada recinto, lo vendido en la base más lo disponible es la base', async () => {
    const BASE = new Map([['teatro-scala', 8], ['cinepolis', 5], ['louvre', 6]])
    setAvailabilityOverrides(BASE)
    const plan: readonly (() => ReturnType<typeof attempt>)[] = [
      async () => await attempt(ANA, 0, 'i1'),
      async () => await attempt(ANA, 0, 'i2', { quantity: '11' }),
      async () => await attempt(BRUNO, 1, 'i3'),
      async () => await attempt(ANA, 2, 'i4', { ids: (sequence) => [fixedTicketId(sequence, 1), fixedTicketId(sequence, 1), fixedTicketId(sequence, 2)] }),
      async () => await attempt(ANA, 0, 'i5'),
      async () => await attempt(ANA, 0, 'i6'),
      async () => await attempt(BRUNO, 1, 'i7', { quantity: '2' }),
      async () => await attempt(BRUNO, 1, 'i8', { quantity: '2' }),
      async () => await attempt(ANA, 2, 'i9'),
      async () => await attempt(ANA, 2, 'i10'),
      // COMMIT failure: the Scala still has 2.
      async () => await attempt(ANA, 0, 'i11', { quantity: '2', failAtCommit: true }),
      async () => await attempt(ANA, 0, 'i12', { quantity: '0' }),
    ]
    const kinds: string[] = []
    for (const step of plan) {
      kinds.push((await step()).kind)
      const sold = await soldByVenue(database)
      for (const [venueId, base] of BASE) {
        expect((sold.get(venueId) ?? 0) + await available(venueId), `${venueId} tras ${kinds.length}`).toBe(base)
      }
    }
    expect(kinds).toEqual(['recorded', 'rejected', 'recorded', 'failed', 'recorded', 'rejected', 'recorded', 'rejected', 'recorded', 'recorded', 'failed', 'rejected'])
    expect(Object.fromEntries(await Promise.all([...BASE.keys()].map(async (venueId) => [venueId, await available(venueId)] as const)))).toEqual({ 'teatro-scala': 2, 'cinepolis': 1, 'louvre': 0 })
  })
})

// ── Derived availability ────────────────────────────────────────────────────

describe('PU6: disponibilidad derivada de lo vendido', () => {
  const capacity = (id: string) => venue(id).capacity

  it('PU6a: sin ventas, cada recinto tiene su aforo y nada se advierte', async () => {
    const derived = deriveAvailability(VENUES, new Map(), await soldByVenue(database))
    expect(derived.oversold).toEqual([])
    for (const target of VENUES) expect(derived.seats.get(target.id)).toBe(target.capacity)
  })

  it('PU6b: la sobrescritura es la base', async () => {
    const derived = deriveAvailability(VENUES, new Map([['teatro-scala', 5]]), await soldByVenue(database))
    expect(derived.seats.get('teatro-scala')).toBe(5)
    expect(derived.seats.get('cinepolis')).toBe(capacity('cinepolis'))
  })

  it('PU6c: con ventas, la base menos lo vendido, con y sin sobrescritura', async () => {
    for (const index of [0, 1, 2]) await insertPurchase(await record(ANA, index, `v${index}`), database)
    await insertPurchase(await record(BRUNO, 0, 'v3'), database)
    const sold = await soldByVenue(database)
    expect(sold).toEqual(new Map([['teatro-scala', 6], ['cinepolis', 2], ['louvre', 3]]))
    const derived = deriveAvailability(VENUES, new Map([['louvre', 10]]), sold)
    expect(derived.seats.get('teatro-scala')).toBe(capacity('teatro-scala') - 6)
    expect(derived.seats.get('cinepolis')).toBe(capacity('cinepolis') - 2)
    expect(derived.seats.get('louvre')).toBe(7)
    expect(derived.oversold).toEqual([])
  })

  it('PU6d: lo vendido mayor que la base deja 0 y se advierte', async () => {
    for (const index of [0, 0]) await insertPurchase(await record(ANA, index, `s${await nextSequence(database)}`), database)
    const derived = deriveAvailability(VENUES, new Map([['teatro-scala', 5]]), await soldByVenue(database))
    expect(derived.seats.get('teatro-scala')).toBe(0)
    expect(derived.oversold).toEqual([{ venueId: 'teatro-scala', base: 5, sold: 6 }])
  })

  it('PU6e: lo vendido en un recinto que ya no está en el catálogo se ignora', () => {
    const derived = deriveAvailability(VENUES, new Map(), new Map([['opera', 3]]))
    expect(derived.oversold).toEqual([])
    expect([...derived.seats.keys()]).toHaveLength(12)
  })
})

// ── Startup ─────────────────────────────────────────────────────────────────

describe('PU11: el arranque deriva la disponibilidad de la base', () => {
  const quiet = { info: () => {}, warn: () => {} }

  beforeEach(() => {
    setAvailabilityOverrides(new Map())
  })

  it('PU11a: tras startSalesState, la disponibilidad refleja lo vendido y la sobrescritura', async () => {
    await insertPurchase(await record(ANA, 0, 'pu11-a'), database)
    await insertPurchase(await record(BRUNO, 0, 'pu11-b'), database)
    await insertPurchase(await record(ANA, 1, 'pu11-c'), database)
    await startSalesState(database, 'teatro-scala=10,louvre=4', quiet)

    expect(await available('teatro-scala')).toBe(10 - 6)
    expect(await available('cinepolis')).toBe(venue('cinepolis').capacity - 2)
    expect(await available('louvre')).toBe(4)
    expect(await available('met')).toBe(venue('met').capacity)
  })

  it('PU11b: lo vendido de más deja el recinto en 0 y se advierte', async () => {
    await insertPurchase(await record(ANA, 0, 'pu11-d'), database)
    const warnings: string[] = []

    await startSalesState(database, 'teatro-scala=2', { info: () => {}, warn: (message) => warnings.push(message) })

    expect(await available('teatro-scala')).toBe(0)
    expect(warnings).toEqual(['[palco] teatro-scala: vendidos 3 superan la base de 2. Se deja en 0 lugares libres.'])
  })

  it('PU11c: una sobrescritura inválida se advierte y la base es el aforo', async () => {
    await insertPurchase(await record(ANA, 0, 'pu11-e'), database)
    const warnings: string[] = []

    await startSalesState(database, 'teatro-scala=x', { info: () => {}, warn: (message) => warnings.push(message) })

    expect(await available('teatro-scala')).toBe(venue('teatro-scala').capacity - 3)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('NUXT_AVAILABILITY_OVERRIDES ignorada')
  })
})

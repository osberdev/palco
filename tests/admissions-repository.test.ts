import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { admitTicket } from '../server/db/admissions.repository'
import { findPurchaseByTicket, insertPurchase, nextSequence } from '../server/db/purchases.repository'
import { confirmPurchase } from '../server/domain/confirmation'
import { ANA, createTestDatabase, fixedTicketId, resetTestDatabase, type TestDatabase } from './support/database'

// Admissions in the database, on PGlite as `palco_app`. The race between two
// simultaneous scans is tested by C20 against the real server: PGlite serializes
// everything on one connection. Each case carries its identifier.

let database: TestDatabase

/** Two Cinépolis VIP tickets, recorded as the endpoint would. */
async function cinemaTickets(): Promise<{ readonly folio: string, readonly ids: readonly string[] }> {
  const cinepolis = VENUES.find((venue) => venue.id === 'cinepolis')!
  const sequence = await nextSequence(database)
  const confirmation = confirmPurchase(
    cinepolis,
    { category: 'cine', input: { filmIndex: 3, age: '21', formatId: 'vip', date: '26/10/2026', time: '20:00', quantity: '2', seats: ['12', '13'] } },
    { method: 'credit', cardNumber: '4111111111111111', holder: 'Elena Vela Torres', expiry: '12/28', securityCode: '987', email: '' },
    { userLimit: 10, available: cinepolis.capacity, today: { year: 2026, month: 10, day: 26 }, sequence },
  )
  if (!confirmation.ok) throw new Error(confirmation.result.code)
  const ids = [fixedTicketId(sequence, 1), fixedTicketId(sequence, 2)]
  await insertPurchase({ userId: ANA, sequence, requestId: `req-${sequence}`, fingerprint: 'huella', purchase: confirmation.purchase, ticketIds: ids }, database)
  return { folio: confirmation.purchase.folio, ids }
}

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => resetTestDatabase(database))

afterAll(() => database.close())

describe('los ingresos', () => {
  it('AM1: el primer ingreso se registra; el segundo no, y devuelve la hora del primero', async () => {
    const { ids } = await cinemaTickets()
    const first = new Date('2026-10-27T00:00:00Z')
    expect(await admitTicket(ids[0]!, first, database)).toEqual({ admitted: true, at: first })
    expect(await admitTicket(ids[0]!, new Date('2026-10-27T00:05:00Z'), database)).toEqual({ admitted: false, at: first })
    // The purchase's other ticket is another admission.
    expect(await admitTicket(ids[1]!, first, database)).toMatchObject({ admitted: true })
  })

  it('AM2: la hora se guarda en segundos, como la muestra la taquilla', async () => {
    const { ids } = await cinemaTickets()
    const result = await admitTicket(ids[0]!, new Date('2026-10-27T00:02:41.400Z'), database)
    expect(result).toEqual({ admitted: true, at: new Date('2026-10-27T00:02:41Z') })
  })

  it('AM3: un boleto que no existe no se admite, sin error: null', async () => {
    expect(await admitTicket('0000000000000000', new Date(), database)).toBeNull()
  })

  it('AM4: la compra del boleto se lee con su lugar, sin usuario', async () => {
    const { folio, ids } = await cinemaTickets()
    const found = await findPurchaseByTicket(ids[1]!, database)
    expect(found?.number).toBe(2)
    expect(found?.purchase.folio).toBe(folio)
    expect(found?.purchase.venueId).toBe('cinepolis')
    expect(await findPurchaseByTicket('0000000000000000', database)).toBeNull()
  })

  it('AM5: borrar la compra borra sus boletos y sus ingresos (ON DELETE CASCADE)', async () => {
    const { folio, ids } = await cinemaTickets()
    await admitTicket(ids[0]!, new Date(), database)
    await database.asOwner(() => database.query('DELETE FROM purchases WHERE folio = $1', [folio]))
    expect((await database.query('SELECT 1 FROM admissions')).rows).toHaveLength(0)
  })
})

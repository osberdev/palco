import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { findPurchaseByFolio, findRequest, insertPurchase, listPurchases } from '../server/db/purchases.repository'
import { confirmPurchase } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import type { TheaterSelectionInput } from '../server/domain/purchase'
import type { CalendarDate, TheaterVenue } from '../types'
import { ANA, BRUNO, createTestDatabase, resetTestDatabase, type TestDatabase } from './support/database'

// The idempotency keys (RN-CON-07). They live in the purchase row, in the
// database: PS2 and PS3 store the key by inserting a purchase. Each case carries
// its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
const SCALA = VENUES.find((venue): venue is TheaterVenue => venue.id === 'teatro-scala' && venue.category === 'teatro')!
const B: TheaterSelectionInput = { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '10' }
const Y: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const REQUEST_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

let database: TestDatabase

function theater() {
  const confirmation = confirmPurchase(SCALA, { category: 'teatro', input: B }, Y, {
    userLimit: 10,
    available: SCALA.capacity,
    today: TODAY,
    sequence: 1,
  })
  if (!confirmation.ok) throw new Error('La compra base debe ser válida')
  return confirmation.purchase
}

async function remember(userId: number): Promise<void> {
  await insertPurchase({ userId, sequence: 1, requestId: REQUEST_ID, fingerprint: 'huella', purchase: theater(), ticketIds: [] }, database)
}

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => resetTestDatabase(database))

afterAll(() => database.close())

describe('claves de solicitud', () => {
  it('PS1: sin registros no hay clave', async () => {
    expect(await findRequest(ANA, REQUEST_ID, database)).toBeNull()
  })

  it('PS2: la clave guardada conserva su huella y su folio', async () => {
    await remember(ANA)
    expect(await findRequest(ANA, REQUEST_ID, database)).toEqual({ fingerprint: 'huella', folio: 'PLC-0001-2026' })
  })

  it('PS3: la misma clave de otro usuario no existe', async () => {
    await remember(ANA)
    expect(await findRequest(BRUNO, REQUEST_ID, database)).toBeNull()
  })

  // The key is part of the purchase and goes with it, which is what `db:reset` does
  // when it deletes the sales.
  it('PS4: borrar las compras borra sus claves', async () => {
    await remember(ANA)
    expect(await listPurchases(ANA, database)).toHaveLength(1)

    await database.asOwner(() => database.query('DELETE FROM purchases'))

    expect(await listPurchases(ANA, database)).toHaveLength(0)
    expect(await findPurchaseByFolio(ANA, 'PLC-0001-2026', database)).toBeNull()
    expect(await findRequest(ANA, REQUEST_ID, database)).toBeNull()
  })
})

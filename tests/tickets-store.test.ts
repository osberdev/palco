import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { findTicket, findTicketsByFolio, insertPurchase, ticketExists } from '../server/db/purchases.repository'
import { confirmPurchase } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import type { TheaterSelectionInput } from '../server/domain/purchase'
import type { CalendarDate, TheaterVenue } from '../types'
import { ANA, BRUNO, createTestDatabase, resetTestDatabase, type TestDatabase } from './support/database'

// The issued tickets (RN-BOL-01 and 03). They live in the `tickets` table: BT16 to
// BT19 record the ticket with its purchase. Each case carries its identifier in its
// name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
const SCALA = VENUES.find((venue): venue is TheaterVenue => venue.id === 'teatro-scala' && venue.category === 'teatro')!
const B: TheaterSelectionInput = { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '3' }
const Y: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const IDS = ['0000000000000001', '0000000000000002', '0000000000000003']

function purchase() {
  const confirmation = confirmPurchase(SCALA, { category: 'teatro', input: B }, Y, {
    userLimit: 10,
    available: SCALA.capacity,
    today: TODAY,
    sequence: 1,
  })
  if (!confirmation.ok) throw new Error('La compra base debe ser válida')
  return confirmation.purchase
}

let database: TestDatabase

async function record(userId: number): Promise<string> {
  const bought = purchase()
  await insertPurchase({ userId, sequence: 1, requestId: 'bt', fingerprint: 'f', purchase: bought, ticketIds: IDS }, database)
  return bought.folio
}

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => resetTestDatabase(database))

afterAll(() => database.close())

describe('boletos emitidos', () => {
  it('BT16: registra y encuentra, numerados de 1 a M', async () => {
    const folio = await record(ANA)
    for (const [index, id] of IDS.entries()) {
      expect(await ticketExists(id, database)).toBe(true)
      expect(await findTicket(id, database)).toEqual({ id, folio, userId: ANA, number: index + 1 })
    }
  })

  it('BT17: un id desconocido no existe', async () => {
    await record(ANA)
    expect(await findTicket('ZZZZZZZZZZZZZZZZ', database)).toBeNull()
    expect(await ticketExists('ZZZZZZZZZZZZZZZZ', database)).toBe(false)
  })

  // Tickets go with their purchase, through `ON DELETE CASCADE`.
  it('BT18: borrar la compra borra también sus boletos', async () => {
    const folio = await record(ANA)
    expect(await findTicketsByFolio(ANA, folio, database)).toEqual(IDS)

    await database.asOwner(() => database.query('DELETE FROM purchases WHERE folio = $1', [folio]))

    expect(await findTicketsByFolio(ANA, folio, database)).toBeNull()
    for (const id of IDS) expect(await findTicket(id, database)).toBeNull()
  })

  it('BT19: una compra ajena y una inexistente responden igual (RN-CON-06)', async () => {
    const folio = await record(ANA)
    expect(await findTicketsByFolio(ANA, folio, database)).toEqual(IDS)
    expect(await findTicketsByFolio(BRUNO, folio, database)).toBeNull()
    expect(await findTicketsByFolio(ANA, 'PLC-0002-2026', database)).toBeNull()
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { insertPurchase, listPurchases } from '../server/db/purchases.repository'
import { confirmPurchase, type TicketsInput } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import { TICKET_ID_BYTES, encodeBase32, parseQrPayload } from '../server/domain/ticket'
import { createTicketSigner } from '../server/utils/ticket-signing'
import { toTicketViews } from '../server/utils/ticket-views'
import type { CalendarDate, Purchase, PurchaseDetail } from '../types'
import { ANA, createTestDatabase, resetTestDatabase, type TestDatabase } from './support/database'

// The tickets in the purchase detail (RF-ENV-07). Each case carries its identifier
// in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
const CARD: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const USER_LIMITS = { teatro: 10, cine: 10, museo: 5 } as const

function purchase(venueId: string, tickets: TicketsInput): Purchase {
  const venue = VENUES.find((candidate) => candidate.id === venueId)!
  const confirmation = confirmPurchase(venue, tickets, CARD, {
    userLimit: USER_LIMITS[venue.category],
    available: venue.capacity,
    today: TODAY,
    sequence: 1,
  })
  if (!confirmation.ok) throw new Error(`${venueId}: ${confirmation.result.code}`)
  return confirmation.purchase
}

const CINEMA = purchase('cinepolis', {
  category: 'cine',
  input: { filmIndex: 3, age: '21', formatId: 'vip', date: '13/11/2026', time: '19:00', quantity: '2', seats: ['12', '13'] },
})
const THEATER = purchase('teatro-scala', {
  category: 'teatro',
  input: { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '2' },
})
const MUSEUM = purchase('met', { category: 'museo', input: { isResident: false, date: '21/11/2026', time: '19:45', quantity: '3' } })

/** Fixed ids, as the store keeps them: 16 base32 characters. */
function storedIds(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => encodeBase32(Uint8Array.from({ length: TICKET_ID_BYTES }, (_, byte) => index * 16 + byte)))
}

const signer = createTicketSigner()

describe('boletos del detalle', () => {
  it('TV1: cine con dos boletos, en orden y con su asiento', () => {
    const views = toTicketViews(CINEMA, storedIds(2), signer.sign)
    expect(views?.map((view) => view.number)).toEqual([1, 2])
    expect(views?.map((view) => view.seat)).toEqual([12, 13])
    expect(views?.[1]?.seat).toBe(CINEMA.category === 'cine' ? CINEMA.seats[1] : null)
  })

  it('TV2: en teatro y museo no hay asiento', () => {
    expect(toTicketViews(THEATER, storedIds(2), signer.sign)?.map((view) => view.seat)).toEqual([null, null])
    expect(toTicketViews(MUSEUM, storedIds(3), signer.sign)?.map((view) => view.seat)).toEqual([null, null, null])
  })

  it('TV3: cada QR se lee, su id es el código corto y su firma verifica', () => {
    const ids = storedIds(3)
    const views = toTicketViews(MUSEUM, ids, signer.sign) ?? []
    expect(views).toHaveLength(3)
    views.forEach((view, index) => {
      const parsed = parseQrPayload(view.qrPayload)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(encodeBase32(parsed.value.id)).toBe(view.shortCode.replaceAll('-', ''))
      expect(encodeBase32(parsed.value.id)).toBe(ids[index])
      expect(signer.verify(parsed.value.id, parsed.value.signature)).toBe(true)
    })
    expect(toTicketViews(MUSEUM, ['NO-ES-UN-ID'], signer.sign)).toBeNull()
  })

  it('TV4: el detalle no lleva el número completo ni el código de seguridad (RNF-15)', () => {
    // A fixed signature: with a random one, '987' could show up in the QR by chance.
    const detail: PurchaseDetail = { ...THEATER, tickets: toTicketViews(THEATER, storedIds(2), () => new Uint8Array(64)) ?? [] }
    const serialized = JSON.stringify(detail)
    expect(detail.tickets).toHaveLength(2)
    expect(serialized).not.toContain('4111111111111111')
    expect(serialized).not.toContain('987')
  })
})

describe('lista de compras', () => {
  // The list comes from the database: PGlite, only in this test.
  let database: TestDatabase
  beforeAll(async () => {
    database = await createTestDatabase()
    await resetTestDatabase(database)
  })
  afterAll(() => database.close())

  it('TV5: la lista no expone los ids de los boletos', async () => {
    const ids = storedIds(2)
    await insertPurchase({ userId: ANA, sequence: 1, requestId: 'tv5', fingerprint: 'f', purchase: CINEMA, ticketIds: ids }, database)
    const listed = await listPurchases(ANA, database)
    expect(listed).toEqual([CINEMA])
    const serialized = JSON.stringify(listed)
    for (const id of ids) expect(serialized).not.toContain(id)
    expect(serialized).not.toContain('tickets')
    expect(serialized).not.toContain('ticketIds')
  })
})

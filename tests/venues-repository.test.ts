import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { loadVenues, syncVenues, venuePrices } from '../server/db/venues.repository'
import { referencePrice } from '../server/domain/booking'
import type { Venue } from '../types'
import { createTestDatabase, SCHEMA, type TestDatabase } from './support/database'

// The venues in the database, which is their source, on PGlite with the real
// schema. `syncVenues` runs as owner, because `palco_app` does not write the
// venues; `loadVenues` as `palco_app`, like the server. Each case carries its
// identifier in its name.

interface VenueRow {
  readonly id: string
  readonly category: string
  readonly name: string
  readonly city: string
  readonly currency: string
  readonly capacity: number
  readonly opens: string
  readonly closes: string
}

interface PriceRow {
  readonly venue_id: string
  readonly kind: string
  readonly label: string
  readonly price_cents: number
}

let instance: TestDatabase

const sync = (catalog: readonly Venue[]) => instance.asOwner(() => syncVenues(instance, catalog))

async function venues(): Promise<VenueRow[]> {
  return (await instance.query<VenueRow>('SELECT * FROM venues ORDER BY id')).rows
}

async function prices(): Promise<PriceRow[]> {
  return (await instance.query<PriceRow>('SELECT * FROM venue_prices ORDER BY venue_id, kind, label')).rows
}

/** How many prices the catalog declares, counted here rather than with `venuePrices`. */
function declaredPrices(venue: Venue): number {
  if (venue.category === 'teatro') return venue.sections.length
  if (venue.category === 'cine') return venue.formats.length + 1
  return venue.hasDifferentiatedFee ? 2 : 1
}

beforeAll(async () => {
  instance = await createTestDatabase({ syncCatalog: false })
})

// Each case starts without venues, like a freshly created database.
beforeEach(() => instance.asOwner(() => instance.exec('TRUNCATE users, venues RESTART IDENTITY CASCADE')))

afterAll(() => instance.close())

describe('syncVenues', () => {
  it('PU9a: doce recintos con sus datos del catálogo', async () => {
    await sync(VENUES)
    const rows = await venues()
    expect(rows).toHaveLength(12)
    for (const venue of VENUES) {
      const row = rows.find((candidate) => candidate.id === venue.id)
      expect(row).toMatchObject({
        category: venue.category,
        name: venue.name,
        city: venue.city,
        currency: venue.currency,
        capacity: venue.capacity,
      })
      expect(row?.opens).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('PU9b: un precio por cada sección, formato, tarifa y cargo; la vista da las filas de la tabla anterior', async () => {
    await sync(VENUES)
    const rows = await prices()
    // The former price table was filled with `venuePrices`: the view gives exactly
    // those rows, 53, and without a differentiated fee there is no resident row.
    const table = VENUES.flatMap((venue) => venuePrices(venue).map((price) => ({ venue_id: venue.id, kind: price.kind, label: price.label, price_cents: price.priceCents })))
    const key = (row: PriceRow) => `${row.venue_id}|${row.kind}|${row.label}`
    expect(rows).toHaveLength(53)
    expect([...rows].sort((a, b) => key(a).localeCompare(key(b)))).toEqual([...table].sort((a, b) => key(a).localeCompare(key(b))))
    for (const venue of VENUES) {
      const own = rows.filter((row) => row.venue_id === venue.id)
      expect(own, venue.id).toHaveLength(declaredPrices(venue))
      if (venue.category === 'teatro') {
        for (const section of venue.sections) expect(own).toContainEqual({ venue_id: venue.id, kind: 'section', label: section.name, price_cents: section.price })
      }
      if (venue.category === 'cine') {
        for (const format of venue.formats) expect(own).toContainEqual({ venue_id: venue.id, kind: 'format', label: format.id, price_cents: format.price })
        expect(own).toContainEqual({ venue_id: venue.id, kind: 'service_fee', label: 'service_fee', price_cents: venue.serviceFee })
      }
      if (venue.category === 'museo') {
        expect(own).toContainEqual({ venue_id: venue.id, kind: 'general', label: 'general', price_cents: venue.generalFee })
        if (venue.hasDifferentiatedFee) expect(own).toContainEqual({ venue_id: venue.id, kind: 'resident', label: 'resident', price_cents: venue.residentFee })
      }
    }
  })

  // The catalog written and read back is the same, in order, venue by venue, with
  // the keys in the same order and the same properties.
  it('PU9c: ida y vuelta; syncVenues y loadVenues dan VENUES, y el precio de referencia coincide', async () => {
    await sync(VENUES)
    const loaded = await loadVenues(instance)
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems))
    expect(loaded.venues.map((venue) => venue.id)).toEqual(VENUES.map((venue) => venue.id))
    for (const [index, venue] of VENUES.entries()) expect(loaded.venues[index], venue.id).toEqual(venue)
    expect(loaded.venues).toEqual(VENUES)
    expect(JSON.stringify(loaded.venues)).toBe(JSON.stringify(VENUES))

    const reference = (await instance.query<{ id: string, capacity: number, reference: number }>(
      `SELECT v.id, v.capacity, MIN(p.price_cents) AS reference
       FROM venues v JOIN venue_prices p ON p.venue_id = v.id AND p.kind <> 'service_fee'
       GROUP BY v.id`,
    )).rows
    expect(reference).toHaveLength(12)
    for (const venue of VENUES) {
      expect(reference.find((row) => row.id === venue.id)).toEqual({ id: venue.id, capacity: venue.capacity, reference: referencePrice(venue) })
    }
  })

  it('PU9d: idempotente', async () => {
    await sync(VENUES)
    const first = { venues: await venues(), prices: await prices() }
    await sync(VENUES)
    await sync(VENUES)
    expect({ venues: await venues(), prices: await prices() }).toEqual(first)
  })

  it('PU9e: un cambio del catálogo llega a la base, y una sección retirada desaparece', async () => {
    await sync(VENUES)
    const scala = VENUES.find((venue) => venue.id === 'teatro-scala')!
    if (scala.category !== 'teatro') throw new Error('La Scala es un teatro')
    const changed: Venue = { ...scala, capacity: 1000, sections: scala.sections.slice(1) }
    await sync(VENUES.map((venue) => (venue.id === 'teatro-scala' ? changed : venue)))
    expect((await venues()).find((row) => row.id === 'teatro-scala')?.capacity).toBe(1000)
    const labels = (await prices()).filter((row) => row.venue_id === 'teatro-scala').map((row) => row.label)
    expect(labels).not.toContain(scala.sections[0]!.name)
    expect(labels).toHaveLength(scala.sections.length - 1)
    // And the server reads it that way: the withdrawn section is gone, and the
    // positions close up.
    const loaded = await loadVenues(instance)
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems))
    expect(loaded.venues.find((venue) => venue.id === 'teatro-scala')).toEqual(changed)
  })

  it('PU9f: un recinto fuera del catálogo se borra solo si no tiene compras', async () => {
    await sync(VENUES)
    await instance.asOwner(() => instance.query("INSERT INTO users (username, password_hash, display_name) VALUES ('RIVA030315MJCSLNA2JC', 'x', 'Ana')"))
    await instance.asOwner(() => instance.query(
      `INSERT INTO purchases (sequence, folio, user_id, venue_id, request_id, fingerprint, category, venue_name, city,
         restrictions, event_date, event_time, quantity, subtotal_cents, fee_cents, total_cents, currency,
         payment_method, payment_summary, details, purchased_on)
       VALUES (1, 'PLC-0001-2026', 1, 'louvre', 'r', 'f', 'museo', 'Louvre', 'París', '', '2026-11-12', '10:00', 1,
         3200, 0, 3200, 'EUR', 'paypal', '{"method":"paypal","email":"a@b.co"}', '{}', '2026-10-25')`,
    ))
    await sync(VENUES.filter((venue) => venue.id !== 'louvre' && venue.id !== 'met'))
    const ids = (await venues()).map((row) => row.id)
    expect(ids).toContain('louvre')
    expect(ids).not.toContain('met')
    // The one kept for its purchases has no position: the server does not sell it.
    const loaded = await loadVenues(instance)
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems))
    expect(loaded.venues.map((venue) => venue.id)).toEqual(VENUES.filter((venue) => venue.id !== 'louvre' && venue.id !== 'met').map((venue) => venue.id))
  })

  it('PU9g: el CHECK de venues.position llega a una base anterior a él, una sola vez, y rechaza una posición negativa', async () => {
    const previous = readFileSync(join(import.meta.dirname, 'fixtures/schema-before-position-check.sql'), 'utf8')
    const old = await createTestDatabase({ schema: previous })
    try {
      const checks = async () => (await old.asOwner(() => old.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM pg_constraint WHERE conname = 'venues_position_check'",
      ))).rows[0]!.n
      expect(await checks()).toBe(0)
      await old.asOwner(() => old.exec(SCHEMA))
      await old.asOwner(() => old.exec(SCHEMA))
      expect(await checks()).toBe(1)
      await expect(old.asOwner(() => old.query("UPDATE venues SET position = -1 WHERE id = 'met'")))
        .rejects.toMatchObject({ code: '23514', constraint: 'venues_position_check' })
    }
    finally {
      await old.close()
    }
  })
})

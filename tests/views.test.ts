import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { insertPurchase } from '../server/db/purchases.repository'
import { syncVenues } from '../server/db/venues.repository'
import { DEMO_PURCHASES, demoRecords } from '../scripts/demo-purchases'
import type { CalendarDate } from '../types'
import { createTestDatabase, SCHEMA, type TestDatabase } from './support/database'

// The `payments` and `purchase_history` views, and the reader's views, on PGlite,
// with the sample purchases. They are read as `palco_lector`, the role that uses
// them. Each case carries its identifier in its name.

/**
 * The schema as it was before the views: the current one without the payment,
 * history and reader views. `venue_prices` stays: the privileges block names it.
 */
const SCHEMA_WITHOUT_VIEWS = SCHEMA.replace(/CREATE OR REPLACE VIEW (?!venue_prices)[\s\S]*?;\n/g, '')
const TODAY: CalendarDate = { year: 2026, month: 10, day: 26 }

const PAYMENTS_COLUMNS = ['folio', 'user_id', 'method', 'brand', 'amount_cents', 'currency', 'status', 'paid_on']
const HISTORY_COLUMNS = ['user_id', 'display_name', 'folio', 'category', 'venue_name', 'city', 'event_date', 'event_time',
  'quantity', 'total_cents', 'currency', 'status', 'purchased_on']

const SEED_USERS = [
  ['RIVA030315MJCSLNA2JC', 'Ana Sofía Ríos Vela'],
  ['TENB010908HCMLVRA6CM', 'Bruno Téllez Nava'],
  ['IASC951122MQTBLR02QT', 'Carmen Ibarra Solís'],
  ['MEXD980704HNLNXG10NL', 'Diego Méndez'],
] as const

let database: TestDatabase

/** The sample purchases, with fixed ticket ids. */
async function insertDemo(): Promise<void> {
  let counter = 0
  const demo = await demoRecords(database, TODAY, () => {
    counter += 1
    return new Uint8Array(10).fill(counter)
  })
  if (!demo.ok) throw new Error(demo.message)
  for (const record of demo.records) await insertPurchase(record, database)
}

/** The four users and the purchases, over whatever schema there is. */
async function seed(): Promise<void> {
  await database.asOwner(async () => {
    await database.exec('TRUNCATE users RESTART IDENTITY CASCADE')
    for (const [username, name] of SEED_USERS) {
      await database.query('INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)', [username, '$2b$10$hash', name])
    }
  })
  await insertDemo()
}

const asLector = <T>(sql: string, params?: readonly unknown[]) =>
  database.asRole('palco_lector', async () => (await database.query<T>(sql, params)).rows)

const columnsOf = async (view: string): Promise<string[]> =>
  (await database.asOwner(() => database.query<{ column_name: string }>(
    'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
    [view],
  ))).rows.map((column) => column.column_name)

/** What defines the tables and the views. */
const catalog = async (): Promise<unknown[]> => (await database.asOwner(() => database.query(
  `SELECT c.relname, c.relkind, CASE WHEN c.relkind = 'v' THEN pg_get_viewdef(c.oid) END AS definition
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'i')
   ORDER BY c.relkind, c.relname`,
))).rows

const viewNames = async (): Promise<unknown[]> => (await database.asOwner(() => database.query(
  "SELECT table_name AS name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name",
))).rows

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(seed)

afterAll(() => database.close())

interface PurchaseColumns {
  readonly folio: string
  readonly user_id: number
  readonly category: string
  readonly venue_name: string
  readonly city: string
  readonly event_date: string
  readonly event_time: string
  readonly quantity: number
  readonly total_cents: number
  readonly currency: string
  readonly payment_method: string
  readonly payment_summary: { readonly brand?: string }
  readonly status: string
  readonly purchased_on: string
}

describe('vistas', () => {
  it('VW1: una fila por compra en cada vista, con los valores de purchases; brand es la marca, o NULL con PayPal', async () => {
    // A user without purchases does not appear in the history.
    await database.asOwner(() => database.query('INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)', ['PEML990417MJCRRC08JC', '$2b$10$hash', 'Lucía Pérez Martínez']))
    expect(await columnsOf('payments')).toEqual(PAYMENTS_COLUMNS)
    expect(await columnsOf('purchase_history')).toEqual(HISTORY_COLUMNS)

    const purchases = await asLector<PurchaseColumns>('SELECT * FROM purchases ORDER BY folio')
    expect(purchases).toHaveLength(DEMO_PURCHASES.length)
    const names = new Map((await asLector<{ id: number, display_name: string }>('SELECT id, display_name FROM users'))
      .map((user) => [user.id, user.display_name]))

    expect(await asLector('SELECT * FROM payments ORDER BY folio')).toEqual(purchases.map((purchase) => ({
      folio: purchase.folio,
      user_id: purchase.user_id,
      method: purchase.payment_method,
      brand: purchase.payment_summary.brand ?? null,
      amount_cents: purchase.total_cents,
      currency: purchase.currency,
      status: purchase.status,
      paid_on: purchase.purchased_on,
    })))
    // Credit Visa, debit Mastercard, PayPal, credit Mastercard and PayPal.
    expect(await asLector('SELECT method, brand FROM payments ORDER BY folio')).toEqual([
      { method: 'credit', brand: 'visa' },
      { method: 'debit', brand: 'mastercard' },
      { method: 'paypal', brand: null },
      { method: 'credit', brand: 'mastercard' },
      { method: 'paypal', brand: null },
    ])

    expect(await asLector('SELECT * FROM purchase_history ORDER BY folio')).toEqual(purchases.map((purchase) => ({
      user_id: purchase.user_id,
      display_name: names.get(purchase.user_id),
      folio: purchase.folio,
      category: purchase.category,
      venue_name: purchase.venue_name,
      city: purchase.city,
      event_date: purchase.event_date,
      event_time: purchase.event_time,
      quantity: purchase.quantity,
      total_cents: purchase.total_cents,
      currency: purchase.currency,
      status: purchase.status,
      purchased_on: purchase.purchased_on,
    })))
    expect(await asLector("SELECT count(*) AS n FROM purchase_history WHERE display_name = 'Lucía Pérez Martínez'")).toEqual([{ n: 0 }])
  })

  it('VW2: ninguna columna se llama como un dato prohibido, y el volcado no lleva titulares, correos de PayPal, máscaras ni códigos', async () => {
    for (const view of ['payments', 'purchase_history']) {
      for (const column of await columnsOf(view)) expect(column, view).not.toMatch(/number|card|cvv|code|security/i)
    }
    const holders = DEMO_PURCHASES.flatMap((demo) => (demo.payment.method === 'paypal' ? [] : [demo.payment.holder]))
    const emails = DEMO_PURCHASES.flatMap((demo) => (demo.payment.method === 'paypal' ? [demo.payment.email] : []))
    const codes = [...new Set(DEMO_PURCHASES.map((demo) => demo.payment.securityCode).filter((code) => code !== ''))]
    expect(holders).toHaveLength(3)
    expect(emails).toHaveLength(2)
    expect(codes).toEqual(['123'])

    const rows = [...await asLector('SELECT * FROM payments'), ...await asLector('SELECT * FROM purchase_history')]
    const dump = JSON.stringify(rows)
    for (const sensitive of [...holders, ...emails, '*', '4111', '@']) expect(dump).not.toContain(sensitive)
    // The code as a cell value or inside a text: the sample dates, times and amounts do
    // not contain it, and the purchase's random ids are not in the views.
    for (const code of codes) expect(dump).not.toContain(code)
  })

  it('VW3: una base sin vistas las recibe con el esquema, y dos aplicaciones más no cambian el catálogo', async () => {
    expect(SCHEMA_WITHOUT_VIEWS).not.toMatch(/CREATE OR REPLACE VIEW (?!venue_prices)/)
    await database.asOwner(() => database.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; ${SCHEMA_WITHOUT_VIEWS}`))
    await database.asOwner(async () => syncVenues(database, VENUES))
    await seed()
    expect(await viewNames()).toEqual([{ name: 'venue_prices' }])

    await database.asOwner(() => database.exec(SCHEMA))
    // The two reader views and venue_prices included.
    expect(await viewNames()).toEqual([{ name: 'payments' }, { name: 'profile_photo_summary' }, { name: 'purchase_history' }, { name: 'venue_prices' }, { name: 'whatsapp_status' }])
    expect(await asLector('SELECT count(*) AS n FROM payments')).toEqual([{ n: DEMO_PURCHASES.length }])
    expect(await asLector('SELECT count(*) AS n FROM purchase_history')).toEqual([{ n: DEMO_PURCHASES.length }])

    const once = await catalog()
    await database.asOwner(() => database.exec(SCHEMA))
    await database.asOwner(() => database.exec(SCHEMA))
    expect(await catalog()).toEqual(once)
  })

  it('VW5: ninguna vista expone el número de WhatsApp ni los bytes de la foto, y el lector los resume por ellas', async () => {
    const photo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    await database.asOwner(async () => {
      await database.query("INSERT INTO whatsapp_numbers (user_id, e164) VALUES (1, '+523312345678')")
      await database.query("INSERT INTO profile_photos (user_id, format, data, version) VALUES (1, 'png', $1, 'v-1')", [photo])
    })
    const views = (await viewNames()).map((view) => (view as { name: string }).name)
    expect(views).toEqual(['payments', 'profile_photo_summary', 'purchase_history', 'venue_prices', 'whatsapp_status'])
    for (const view of views) {
      for (const column of await columnsOf(view)) expect(column, view).not.toMatch(/e164|^data$/)
    }
    expect(await columnsOf('whatsapp_status')).toEqual(['user_id', 'display_name', 'registered', 'verified', 'consented_at'])
    expect(await columnsOf('profile_photo_summary')).toEqual(['user_id', 'format', 'bytes', 'version', 'updated_at'])

    // The reader cannot read those columns, and through the view it does read the summary.
    const status = await asLector<{ user_id: number, display_name: string, registered: boolean, verified: boolean }>('SELECT * FROM whatsapp_status')
    expect(status).toMatchObject([{ user_id: 1, display_name: 'Ana Sofía Ríos Vela', registered: true, verified: false }])
    expect(await asLector('SELECT user_id, format, bytes, version FROM profile_photo_summary')).toEqual([{ user_id: 1, format: 'png', bytes: photo.length, version: 'v-1' }])
    const dump = JSON.stringify([...status, ...await asLector('SELECT * FROM profile_photo_summary')])
    for (const form of ['+523312345678', '523312345678', '3312345678']) expect(dump).not.toContain(form)
  })
})

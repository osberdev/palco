import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from './support/database'

// The privileges of `palco_app`: only what the server uses. If a new route needs
// more, this test forces declaring it. Also those of `palco_lector`: it reads
// everything except two columns, and writes nothing. The case carries its
// identifier in its name.

const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  // An admission is never corrected or voided.
  admissions: ['INSERT', 'SELECT'],
  payment_method_additions: ['DELETE', 'INSERT', 'SELECT'],
  payment_methods: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  profile_photos: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  purchases: ['INSERT', 'SELECT'],
  tickets: ['INSERT', 'SELECT'],
  users: ['INSERT', 'SELECT'],
  // The venues: SELECT only, also on the venue_prices view.
  venue_annual_closures: ['SELECT'],
  venue_cinemas: ['SELECT'],
  venue_closed_weekdays: ['SELECT'],
  venue_exceptions: ['SELECT'],
  venue_films: ['SELECT'],
  venue_formats: ['SELECT'],
  venue_hours: ['SELECT'],
  venue_museums: ['SELECT'],
  venue_plays: ['SELECT'],
  venue_prices: ['SELECT'],
  venue_sections: ['SELECT'],
  venue_theaters: ['SELECT'],
  venues: ['SELECT'],
  whatsapp_numbers: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
}

/** The tables and views the reader reads in full. */
const READER_TABLES = [
  'admissions', 'payment_method_additions', 'payment_methods', 'payments', 'profile_photo_summary', 'purchase_history',
  'purchases', 'tickets', 'users', 'venue_annual_closures', 'venue_cinemas', 'venue_closed_weekdays',
  'venue_exceptions', 'venue_films', 'venue_formats', 'venue_hours', 'venue_museums', 'venue_plays', 'venue_prices',
  'venue_sections', 'venue_theaters', 'venues', 'whatsapp_status',
]
/** The two tables it reads by column, without the number or the bytes. */
const READER_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  profile_photos: ['format', 'updated_at', 'user_id', 'version'],
  whatsapp_numbers: ['consented_at', 'user_id', 'verified'],
}

let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(() => database.close())

describe('privilegios de palco_app', () => {
  it('PRV1: son exactamente los que usa el servidor, sin DELETE ni UPDATE en usuarios, compras y boletos', async () => {
    const { rows } = await database.asOwner(() => database.query<{ table_name: string, privilege_type: string }>(
      "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'palco_app' ORDER BY table_name, privilege_type",
    ))
    const granted: Record<string, string[]> = {}
    for (const { table_name: table, privilege_type: privilege } of rows) (granted[table] ??= []).push(privilege)
    expect(granted).toEqual(EXPECTED)

    for (const table of ['users', 'purchases', 'tickets']) {
      expect(granted[table], table).not.toContain('DELETE')
      expect(granted[table], table).not.toContain('UPDATE')
    }
    expect(granted.payment_method_additions).not.toContain('UPDATE')

    // And what is granted is what the database enforces, not just what the catalog says.
    await expect(database.query('DELETE FROM purchases')).rejects.toMatchObject({ code: '42501' })
    await expect(database.query("UPDATE users SET email = 'a@b.co'")).rejects.toMatchObject({ code: '42501' })

    // No privileges on sequences: identity columns do not need them.
    const sequences = await database.asOwner(() => database.query<{ grantee: string }>(
      "SELECT grantee FROM information_schema.usage_privileges WHERE object_type = 'SEQUENCE' AND grantee IN ('palco_app', 'palco_lector')",
    ))
    expect(sequences.rows).toEqual([])

    // palco_lector.
    const reader = await database.asOwner(() => database.query<{ table_name: string, privilege_type: string }>(
      "SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'palco_lector' ORDER BY table_name, privilege_type",
    ))
    expect(reader.rows.map((row) => row.table_name)).toEqual(READER_TABLES)
    expect(new Set(reader.rows.map((row) => row.privilege_type))).toEqual(new Set(['SELECT']))
    const columns = await database.asOwner(() => database.query<{ table_name: string, column_name: string, privilege_type: string }>(
      `SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee = 'palco_lector' AND table_name IN ('whatsapp_numbers', 'profile_photos') ORDER BY table_name, column_name`,
    ))
    const readable: Record<string, string[]> = {}
    for (const { table_name: table, column_name: column, privilege_type: privilege } of columns.rows) {
      expect(privilege).toBe('SELECT')
      ;(readable[table] ??= []).push(column)
    }
    expect(readable).toEqual(READER_COLUMNS)
  })
})

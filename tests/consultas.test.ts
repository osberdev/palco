import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import bcrypt from 'bcrypt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insertPurchase } from '../server/db/purchases.repository'
import { demoRecords } from '../scripts/demo-purchases'
import { SEEDED_USERS } from './helpers/seeded-users'
import { createTestDatabase, type TestDatabase } from './support/database'

// `docs/consultas.sql` on PGlite: each query runs as `palco_lector`, the role used
// to open them, over the `db:seed` and `db:seed:demo` seed. If one stops running on
// PostgreSQL, reads a denied column or changes its row count, it fails here.

const FILE = readFileSync(join(import.meta.dirname, '../docs/consultas.sql'), 'utf8')
const MARKER = /^-- @consulta (\S+)$/
const EXPECTED = /^-- espera: (\d+) filas?$/

interface Query {
  readonly name: string
  readonly sql: string
  readonly expected: number | null
}

/** The file's queries, one per marker. */
function parseQueries(text: string): { readonly preamble: string, readonly queries: readonly Query[] } {
  const lines = text.split('\n')
  const starts = lines.flatMap((line, index) => (MARKER.test(line) ? [index] : []))
  const queries = starts.map((start, position) => {
    const block = lines.slice(start + 1, starts[position + 1] ?? lines.length)
    const expected = block.map((line) => EXPECTED.exec(line)).find((match) => match !== null)
    return {
      name: MARKER.exec(lines[start]!)![1]!,
      sql: block.join('\n'),
      expected: expected ? Number(expected[1]) : null,
    }
  })
  return { preamble: lines.slice(0, starts[0] ?? lines.length).join('\n'), queries }
}

/** The text without line comments: what PostgreSQL executes. */
const withoutComments = (sql: string) => sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n').trim()

const { preamble, queries } = parseQueries(FILE)

let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
  await database.asOwner(async () => {
    for (const user of SEEDED_USERS) {
      const email = `${user.displayName.split(' ')[0]!.toLowerCase()}@example.com`
      await database.query('INSERT INTO users (username, password_hash, display_name, email) VALUES ($1, $2, $3, $4)', [user.username, bcrypt.hashSync(user.password, 10), user.displayName, email])
    }
  })
  let counter = 0
  const demo = await demoRecords(database, { year: 2026, month: 10, day: 26 }, () => {
    counter += 1
    return new Uint8Array(10).fill(counter)
  })
  if (!demo.ok) throw new Error(demo.message)
  for (const record of demo.records) await insertPurchase(record, database)
})

afterAll(() => database.close())

describe('consultas.sql', () => {
  it('CQ1: cada consulta corre como palco_lector sobre la semilla, una sentencia por marcador, con las filas que espera', async () => {
    expect(withoutComments(preamble)).toBe('')
    expect(queries.length).toBeGreaterThanOrEqual(25)
    expect(new Set(queries.map((query) => query.name)).size).toBe(queries.length)

    const counts: Record<string, number> = {}
    for (const query of queries) {
      const statement = withoutComments(query.sql)
      // A single statement, ending in a semicolon: no literal in the file contains one.
      expect(statement, query.name).toMatch(/;$/)
      expect(statement.slice(0, -1), query.name).not.toContain(';')
      const rows = await database.asRole('palco_lector', async () => {
        try {
          return (await database.query(statement)).rows
        }
        catch (error) {
          throw new Error(`La consulta ${query.name} falla: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
      counts[query.name] = rows.length
    }
    const expected = Object.fromEntries(queries.flatMap((query) => (query.expected === null ? [] : [[query.name, query.expected]])))
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(20)
    expect(Object.fromEntries(Object.keys(expected).map((name) => [name, counts[name]]))).toEqual(expected)
  })

  it('CQ2: los ingresos, y los que no son de la fecha de su evento', async () => {
    const byName = new Map(queries.map((query) => [query.name, withoutComments(query.sql)]))
    const tickets = (await database.query<{ id: string, event_date: string }>(
      'SELECT t.id, p.event_date FROM tickets t JOIN purchases p ON p.folio = t.folio ORDER BY t.folio, t.ordinal LIMIT 2',
    )).rows
    // At 23:30 Guadalajara time on its date, which in UTC is already the next day: with
    // the session's time zone, the query would report it as off-date. The other one, a
    // day earlier.
    await database.query('INSERT INTO admissions (ticket_id, admitted_at) VALUES ($1, ($2::date + time \'23:30\') AT TIME ZONE \'America/Mexico_City\'), ($3, ($4::date - 1 + time \'12:00\') AT TIME ZONE \'America/Mexico_City\')',
      [tickets[0]!.id, tickets[0]!.event_date, tickets[1]!.id, tickets[1]!.event_date])
    try {
      const run = (name: string) => database.asRole('palco_lector', async () => (await database.query(byName.get(name)!)).rows)
      expect(await run('ingresos')).toHaveLength(2)
      const off = await run('ingresos_fuera_de_fecha') as { folio: string, boleto: number, evento: string, fecha_del_ingreso: string }[]
      expect(off).toHaveLength(1)
      expect(off[0]!.fecha_del_ingreso).not.toBe(off[0]!.evento)
      // The one from the day before; not the one at 23:30.
      expect(off[0]!.evento).toBe(tickets[1]!.event_date)
    }
    finally {
      await database.asOwner(() => database.query('DELETE FROM admissions'))
    }
  })
})

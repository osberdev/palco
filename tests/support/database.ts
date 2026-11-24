import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { VENUES } from '../../server/data/catalog'
import { CONNECTION_TIME_ZONE, type Database, type Queryable } from '../../server/db/client'
import { TYPE_PARSERS } from '../../server/db/type-parsers'
import { syncVenues } from '../../server/db/venues.repository'

// A test database on PGlite, PostgreSQL in WASM inside the process: in memory by
// default, or in a directory to test what survives closing the connection. The
// schema is applied as owner, and the tests run with `SET ROLE palco_app`: a
// missing GRANT fails here and not in production. `SET ROLE` does not apply
// `default_transaction_read_only`, which is a role setting applied at login: that is
// why here the reader writing gives 42501 and not 25006.

export const SCHEMA = readFileSync(join(import.meta.dirname, '../../server/db/schema.sql'), 'utf8')

export const ANA = 1
export const BRUNO = 2

// In Docker, 01-roles.sh creates them, with a password. PGlite does not authenticate.
const CREATE_ROLES = 'CREATE ROLE palco_app; CREATE ROLE palco_lector;'
const APP_ROLE = 'palco_app'

export interface TestDatabase extends Database {
  /** Runs `fn` as the schema owner: DDL and whatever `palco_app` cannot do. */
  asOwner<T>(fn: () => Promise<T>): Promise<T>
  /** Runs `fn` with another role, and goes back to `palco_app`. */
  asRole<T>(role: 'palco_lector' | 'palco_app', fn: () => Promise<T>): Promise<T>
  inTransaction(): boolean
  /** An independent copy of the database, with the same schema and data. */
  copy(): Promise<TestDatabase>
}

function queryableOf(client: PGlite | Transaction): Queryable {
  return {
    query: async <T>(sql: string, params: readonly unknown[] = []) => {
      const { rows } = await client.query<T>(sql, [...params])
      return { rows }
    },
  }
}

function wrap(pglite: PGlite): TestDatabase {
  const asRole: TestDatabase['asRole'] = async (role, fn) => {
    await pglite.exec(`SET ROLE ${role}`)
    try {
      return await fn()
    }
    finally {
      await pglite.exec(`SET ROLE ${APP_ROLE}`)
    }
  }
  return {
    ...queryableOf(pglite),
    withTransaction: async <T>(fn: (tx: Queryable) => Promise<T>) => (await pglite.transaction((tx) => fn(queryableOf(tx)))) as T,
    exec: async (sql) => {
      await pglite.exec(sql)
    },
    close: () => pglite.close(),
    asOwner: async (fn) => {
      await pglite.exec('RESET ROLE')
      try {
        return await fn()
      }
      finally {
        await pglite.exec(`SET ROLE ${APP_ROLE}`)
      }
    },
    asRole,
    inTransaction: () => pglite.isInTransaction(),
    copy: async () => {
      const dump = await pglite.dumpDataDir('none')
      const copied = await PGlite.create({ loadDataDir: dump, parsers: TYPE_PARSERS })
      await copied.exec(`SET TIME ZONE '${CONNECTION_TIME_ZONE}'; SET ROLE ${APP_ROLE}`)
      return wrap(copied)
    },
  }
}

export interface TestDatabaseOptions {
  /** A directory: when opened again, it keeps what it had. */
  readonly dataDir?: string
  /** The schema to apply; `null` applies none, to test an empty database. */
  readonly schema?: string | null
  /** Sync the catalog venues, like `db:init`. */
  readonly syncCatalog?: boolean
}

/**
 * The default database (in memory, with the schema and the venues) is created from
 * one template per process: applying the schema and writing the complete venues
 * costs more than loading a dump, and almost every test asks for it.
 */
let template: Promise<File | Blob> | undefined

async function fromTemplate(): Promise<TestDatabase> {
  template ??= (async () => {
    const seed = await createFresh({})
    const dump = await seed.dump()
    await seed.close()
    return dump
  })()
  const pglite = await PGlite.create({ loadDataDir: await template, parsers: TYPE_PARSERS })
  await pglite.exec(`SET TIME ZONE '${CONNECTION_TIME_ZONE}'; SET ROLE ${APP_ROLE}`)
  return wrap(pglite)
}

export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  if (options.dataDir === undefined && options.schema === undefined && options.syncCatalog !== false) return fromTemplate()
  return createFresh(options)
}

async function createFresh(options: TestDatabaseOptions): Promise<TestDatabase & { dump(): Promise<File | Blob> }> {
  const pglite = await PGlite.create({ dataDir: options.dataDir, parsers: TYPE_PARSERS })
  const database = wrap(pglite)
  await pglite.exec(`SET TIME ZONE '${CONNECTION_TIME_ZONE}'`)
  const known = await pglite.query<{ readonly n: number }>("SELECT COUNT(*) AS n FROM pg_roles WHERE rolname = 'palco_app'")
  if (known.rows[0]?.n === 0) await pglite.exec(CREATE_ROLES)
  const schema = options.schema === undefined ? SCHEMA : options.schema
  const applied = await pglite.query<{ readonly found: string | null }>("SELECT to_regclass('public.users')::text AS found")
  if (schema !== null && !applied.rows[0]?.found) {
    await database.exec(schema)
    if (options.syncCatalog !== false) await syncVenues(database, VENUES)
  }
  await pglite.exec(`SET ROLE ${APP_ROLE}`)
  return { ...database, dump: () => pglite.dumpDataDir('none') }
}

/** Empties what the tests write, resets the ids and seeds Ana and Bruno. */
export async function resetTestDatabase(database: TestDatabase): Promise<void> {
  await database.asOwner(async () => {
    await database.exec('TRUNCATE users RESTART IDENTITY CASCADE')
    await seedTestUsers(database)
  })
}

export async function seedTestUsers(database: Queryable): Promise<void> {
  const insert = 'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)'
  await database.query(insert, ['RIVA030315MJCSLNA2JC', '$2b$10$x', 'Ana Sofía Ríos Vela'])
  await database.query(insert, ['TENB010908HCMLVRA6CM', '$2b$10$y', 'Bruno Téllez Nava'])
}

/** A 16-character ticket id, fixed so the test is deterministic. */
export function fixedTicketId(sequence: number, number: number): string {
  return `${String(sequence).padStart(8, '0')}${String(number).padStart(8, '0')}`
}

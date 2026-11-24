import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TYPE_PARSERS } from './type-parsers.ts'

/** What a query needs: the `Pool` outside a transaction, and `tx` inside one. */
export interface Queryable {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ readonly rows: T[] }>
}

/**
 * A database connection. The server and the scripts create it with `pg`; the tests,
 * with PGlite (`tests/support/database.ts`). Inside `withTransaction` every query
 * goes through `tx`: in PGlite using the connection deadlocks, and with `pg` it
 * would read outside the transaction.
 */
export interface Database extends Queryable {
  withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  /** Several statements without parameters: the schema. */
  exec(sql: string): Promise<void>
  close(): Promise<void>
}

function queryableOf(client: pg.Pool | pg.PoolClient): Queryable {
  return {
    query: async <T>(sql: string, params: readonly unknown[] = []) => {
      const { rows } = await client.query({ text: sql, values: [...params] })
      return { rows: rows as T[] }
    },
  }
}

const TYPES = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    const parser = format === 'binary' ? undefined : TYPE_PARSERS[oid]
    return parser ?? pg.types.getTypeParser(oid, format as 'text')
  }) as typeof pg.types.getTypeParser,
}

/**
 * Per-connection timeouts, in milliseconds. A purchase that waits more than 5 s for
 * a lock answers 500 with nothing written (55P03); an idle transaction or a
 * statement that exceeds 15 s is cancelled, so nothing holds on to the locks.
 */
export const CONNECTION_TIMEOUTS = {
  lock_timeout: 5000,
  idle_in_transaction_session_timeout: 15_000,
  statement_timeout: 15_000,
} as const

/**
 * The time zone of every connection. With any other, a timestamp would read
 * differently depending on the server; PGlite pins the same one so the tests agree
 * (C15).
 */
export const CONNECTION_TIME_ZONE = 'UTC'

/** Server connections. The concurrency suite uses 2 so that a query outside `tx` shows up. */
export const SERVER_POOL_MAX = 10

/** A `pg` `Pool` with the application's parsers, connected as the URL says. */
export function createDatabase(url: string, options: { readonly max?: number } = {}): Database {
  const pool = new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    max: options.max ?? SERVER_POOL_MAX,
    types: TYPES,
    options: `-c TimeZone=${CONNECTION_TIME_ZONE}`,
    ...CONNECTION_TIMEOUTS,
  })
  // An idle connection that drops must not bring the process down: the next
  // query fails and its endpoint answers 500.
  pool.on('error', (error: Error & { code?: string }) => {
    console.error(`[palco] Se perdió una conexión con PostgreSQL (${error.code ?? 'sin código'})`)
  })
  return {
    ...queryableOf(pool),
    withTransaction: async (fn) => {
      const client = await pool.connect()
      let broken = false
      try {
        await client.query('BEGIN')
        const result = await fn(queryableOf(client))
        await client.query('COMMIT')
        return result
      }
      catch (error) {
        try {
          await client.query('ROLLBACK')
        }
        catch {
          broken = true
        }
        throw error
      }
      finally {
        client.release(broken)
      }
    },
    exec: async (sql) => {
      await pool.query(sql)
    },
    close: () => pool.end(),
  }
}

let connection: Database | null = null

/**
 * The process connection, from `NUXT_DATABASE_URL`: `palco_app`, without DDL. The
 * variable is read from `process.env` as text and has no default.
 */
export function getDatabase(): Database {
  if (connection === null) {
    const url = process.env.NUXT_DATABASE_URL
    if (!url) throw new Error('Falta NUXT_DATABASE_URL. Ver .env.example.')
    connection = createDatabase(url)
  }
  return connection
}

/** Sets the process connection: the tests swap it for a PGlite one. */
export function setDatabase(database: Database | null): void {
  connection = database
}

export async function closeDatabase(): Promise<void> {
  const open = connection
  connection = null
  await open?.close()
}

/** Applies the text of `schema.sql`. It is idempotent and run by the schema owner. */
export async function applySchemaSql(database: Database, sql: string): Promise<void> {
  await database.exec(sql)
}

/** Reads `schema.sql` from disk and applies it. Only for the scripts: the server has no DDL. */
export async function applySchema(database: Database): Promise<void> {
  const schemaFile = resolve(dirname(fileURLToPath(import.meta.url)), 'schema.sql')
  if (!existsSync(schemaFile)) {
    throw new Error(`No se encontró el esquema en ${schemaFile}`)
  }
  await applySchemaSql(database, readFileSync(schemaFile, 'utf8'))
}

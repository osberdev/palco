import { createDatabase, type Database } from '../server/db/client.ts'
import { checkDatabase, describeDatabaseFailure, type DatabaseCheck } from '../server/utils/database-startup.ts'

type Variable = 'NUXT_DATABASE_ADMIN_URL' | 'NUXT_DATABASE_READER_URL'

/**
 * A script's connection, from its variable. Without it, or if the database does
 * not answer, it exits with 1 and the same message as the server, without a stack
 * trace or password. With `requireSchema` it also requires the schema, like the
 * server: the read-only scripts ask for it.
 */
export async function connectWith(variable: Variable, options: { readonly requireSchema?: boolean } = {}): Promise<Database> {
  const url = process.env[variable]
  if (!url) {
    console.error(`Falta ${variable}. Ver .env.example.`)
    process.exit(1)
  }
  const database = createDatabase(url)
  const check = options.requireSchema
    ? await checkDatabase(database, [], url)
    : await database.query('SELECT 1').then((): DatabaseCheck => ({ ok: true }), (error: unknown) => describeDatabaseFailure(error, url))
  if (!check.ok) {
    console.error(check.message)
    await database.close().catch(() => {})
    process.exit(1)
  }
  return database
}

/** `host:port/database`, without user or password, for the messages. */
export function describeTarget(variable: Variable): string {
  const parsed = new URL(process.env[variable] ?? '')
  return `${parsed.host}${parsed.pathname}`
}

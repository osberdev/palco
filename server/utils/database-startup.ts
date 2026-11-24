import type { Queryable } from '../db/client'

/** How long to wait between attempts: the container may still be starting. */
export const DATABASE_RETRY_ATTEMPTS = 5
export const DATABASE_RETRY_DELAY_MS = 2000

export type DatabaseCheck =
  | { readonly ok: true }
  | { readonly ok: false, readonly message: string, readonly retry: boolean }

/** `host:port` and user from the URL, never the password. */
function describeUrl(url: string): { readonly address: string, readonly user: string } {
  try {
    const parsed = new URL(url)
    return { address: `${parsed.hostname}:${parsed.port || '5432'}`, user: decodeURIComponent(parsed.username) }
  }
  catch {
    return { address: 'la dirección de NUXT_DATABASE_URL', user: 'de NUXT_DATABASE_URL' }
  }
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
}

/**
 * Messages for a database failure, without the password or the stack trace. The
 * server and the scripts share them, with the same text.
 */
export function describeDatabaseFailure(error: unknown, url: string): DatabaseCheck {
  const { address, user } = describeUrl(url)
  const code = codeOf(error)
  if (code === '28P01' || code === '28000') {
    return { ok: false, retry: false, message: `PostgreSQL rechazó al usuario ${user}. Revisa NUXT_DATABASE_URL en .env.` }
  }
  if (code === '3D000') return { ok: false, retry: false, message: 'La base no tiene el esquema. Corre `bun run db:init`.' }
  if (code === '42501') return { ok: false, retry: false, message: `El usuario ${user} no tiene privilegios sobre el esquema. Corre \`bun run db:init\`.` }
  // Any other PostgreSQL code is no longer a connection problem, unless it is still starting up.
  if (/^[0-9A-Z]{5}$/.test(code) && code !== '57P03') {
    return { ok: false, retry: false, message: `PostgreSQL respondió con el error ${code}.` }
  }
  return { ok: false, retry: true, message: `PostgreSQL no responde en ${address}. Corre \`bun run db:up\`.` }
}

/**
 * What the server requires from the database before serving, as `palco_app`: that
 * it answers, accepts the credentials, has the schema and has every catalog venue.
 * Without the last one, a purchase at a new venue would fail on the foreign key.
 * It does not throw: it says what is missing.
 */
export async function checkDatabase(database: Queryable, venueIds: readonly string[], url: string): Promise<DatabaseCheck> {
  try {
    const { rows } = await database.query<{ readonly found: string | null }>("SELECT to_regclass('public.purchases')::text AS found")
      // After `DROP SCHEMA`, the new schema does not grant USAGE yet: there is no schema either.
      .catch((error: unknown) => {
        if (codeOf(error) === '42501') return { rows: [] }
        throw error
      })
    if (!rows[0]?.found) return { ok: false, retry: false, message: 'La base no tiene el esquema. Corre `bun run db:init`.' }
    const stored = await database.query<{ readonly id: string }>('SELECT id FROM venues')
    const known = new Set(stored.rows.map((row) => row.id))
    if (venueIds.some((id) => !known.has(id))) {
      return { ok: false, retry: false, message: 'La base no tiene los recintos del catálogo. Corre `bun run db:init`.' }
    }
    return { ok: true }
  }
  catch (error) {
    return describeDatabaseFailure(error, url)
  }
}

/** `checkDatabase` with retries for a database that does not answer yet. */
export async function waitForDatabase(
  database: Queryable,
  venueIds: readonly string[],
  url: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<DatabaseCheck> {
  let check: DatabaseCheck = { ok: false, retry: true, message: '' }
  for (let attempt = 1; attempt <= DATABASE_RETRY_ATTEMPTS; attempt += 1) {
    check = await checkDatabase(database, venueIds, url)
    if (check.ok || !check.retry) return check
    if (attempt < DATABASE_RETRY_ATTEMPTS) await sleep(DATABASE_RETRY_DELAY_MS)
  }
  return check
}

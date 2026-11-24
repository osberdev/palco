import { getDatabase } from '../db/client'
import { prepareServerDatabase } from '../utils/sales-startup'

/**
 * Checks the database at startup, loads the venues and sets availability, in a
 * single promise every request waits for: none, not even the catalog, sees
 * availability before it is derived.
 *
 * The server neither applies the schema nor syncs the venues: it connects as
 * `palco_app`, without DDL, and `bun run db:init` does that. If the database is not
 * ready, the process exits with a message that says what to do, without the
 * password: it does not start as if nothing were wrong only to answer 500 to every
 * query without saying why.
 */
export default defineNitroPlugin((nitroApp) => {
  const configured = useRuntimeConfig().availabilityOverrides
  const overridesText = typeof configured === 'string' ? configured : ''

  const fail = (message: string): never => {
    console.error(message)
    process.exit(1)
  }

  const prepare = async (): Promise<void> => {
    const url = process.env.NUXT_DATABASE_URL
    if (!url) return fail('Falta NUXT_DATABASE_URL. Ver .env.example.')
    const started = await prepareServerDatabase(getDatabase(), url, overridesText)
    if (!started.ok) return fail(started.message)
  }

  const ready = prepare().catch((error: unknown) => {
    fail(`No se pudo preparar la base de datos: ${error instanceof Error ? error.message : 'error desconocido'}`)
  })

  nitroApp.hooks.hook('request', async () => {
    await ready
  })
})

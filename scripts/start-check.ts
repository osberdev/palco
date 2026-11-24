import { createDatabase } from '../server/db/client.ts'
import { prepareServerDatabase } from '../server/utils/sales-startup.ts'
import { sessionPasswordMessage, sessionPasswordProblem } from '../server/utils/session-password.ts'
import { parseTicketSigningKey, ticketKeyInvalidMessage } from '../server/utils/ticket-key.ts'

/**
 * The pre-flight check of `bun run start`: what the server plugin requires from the
 * database (that it answers, has the schema and has valid venues), with the same
 * function. Nitro calls its plugins without awaiting them and listens before the
 * check ends; without this step, with a broken database, the server would print
 * "Listening" and then exit with the error. Exits with 1 and the server's message,
 * or with 0 without writing anything. The server checks again at startup: this
 * step does not replace that.
 *
 * Before the database, the ticket signing key and then the session sealing key: an
 * invalid signing key, or a session key that is missing or shorter than 32
 * characters, does not start, and this is reported without the database getting in
 * the way. A missing signing key is not an error: the plugin warns about it at
 * startup.
 */

if (parseTicketSigningKey(process.env.NUXT_TICKET_SIGNING_KEY).kind === 'invalid') {
  console.error(ticketKeyInvalidMessage())
  process.exit(1)
}

const sessionProblem = sessionPasswordProblem(process.env.NUXT_SESSION_PASSWORD)
if (sessionProblem) {
  console.error(sessionPasswordMessage(sessionProblem))
  process.exit(1)
}

const url = process.env.NUXT_DATABASE_URL
if (!url) {
  console.error('Falta NUXT_DATABASE_URL. Ver .env.example.')
  process.exit(1)
}

const database = createDatabase(url, { max: 1 })
const quiet = { info: () => {}, warn: () => {} }
const started = await prepareServerDatabase(database, url, process.env.NUXT_AVAILABILITY_OVERRIDES ?? '', quiet)
  .catch((error: unknown) => ({ ok: false as const, message: `No se pudo preparar la base de datos: ${error instanceof Error ? error.message : 'error desconocido'}` }))
await database.close()
if (!started.ok) {
  console.error(started.message)
  process.exit(1)
}

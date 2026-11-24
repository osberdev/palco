import { VENUES } from '../server/data/catalog.ts'
import { applySchema } from '../server/db/client.ts'
import { insertPurchaseRows } from '../server/db/purchases.repository.ts'
import { syncVenues } from '../server/db/venues.repository.ts'
import { toCalendarDate } from '../utils/date.ts'
import { connectWith, describeTarget } from './db-connection.ts'
import { demoRecords } from './demo-purchases.ts'

/**
 * Sample purchases defined in `demo-purchases.ts`: one per category and a few
 * more, with debit, credit and PayPal, all with their tickets. They are inserted
 * through the repository, not over HTTP, and each one goes through
 * `confirmPurchase` first.
 *
 * It refuses to run if the database already has purchases, so the sample data is
 * never mixed with real sales. Run it with the server stopped: availability is
 * derived at startup.
 */

const database = await connectWith('NUXT_DATABASE_ADMIN_URL')
await applySchema(database)
await syncVenues(database, VENUES)

const { rows } = await database.query<{ readonly n: number }>('SELECT COUNT(*) AS n FROM purchases')
const existing = rows[0]?.n ?? 0
if (existing > 0) {
  await database.close()
  console.error(`La base ya tiene ${existing} compras: db:seed:demo no las mezcla. Para empezar de cero, detén el servidor y corre bun run db:reset.`)
  process.exit(1)
}

const demo = await demoRecords(database, toCalendarDate(new Date()))
if (!demo.ok) {
  await database.close()
  console.error(demo.message)
  process.exit(1)
}

// All or nothing: a single transaction for the sample purchases.
await database.withTransaction(async (tx) => {
  for (const record of demo.records) await insertPurchaseRows(tx, record)
})
await database.close()

console.info(`Sembradas ${demo.records.length} compras de demostración en ${describeTarget('NUXT_DATABASE_ADMIN_URL')}:`)
for (const { purchase } of demo.records) {
  const tickets = `${purchase.quantity} ${purchase.quantity === 1 ? 'boleto' : 'boletos'}`
  console.info(`  ${purchase.folio} · ${purchase.venueName} · ${tickets} · ${purchase.payment.method}`)
}

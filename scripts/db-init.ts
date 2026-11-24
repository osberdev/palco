import { VENUES } from '../server/data/catalog.ts'
import { applySchema } from '../server/db/client.ts'
import { syncVenues } from '../server/db/venues.repository.ts'
import { connectWith, describeTarget } from './db-connection.ts'

// The owner applies the schema and the venue projection: the server has no DDL
// and only reads the venues.
const database = await connectWith('NUXT_DATABASE_ADMIN_URL')
await applySchema(database)
await syncVenues(database, VENUES)
await database.close()

console.info(`Esquema aplicado en ${describeTarget('NUXT_DATABASE_ADMIN_URL')}`)

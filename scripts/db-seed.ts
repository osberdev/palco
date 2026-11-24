import bcrypt from 'bcrypt'
import { VENUES } from '../server/data/catalog.ts'
import { applySchema } from '../server/db/client.ts'
import { syncVenues } from '../server/db/venues.repository.ts'
import { connectWith } from './db-connection.ts'

const BCRYPT_COST = 10

/**
 * The four seed users. They are synthetic people: the CURPs were generated and
 * verified with `computeCheckDigit`, and belong to nobody.
 *
 * They cover both century resolutions (a letter homoclave for the 21st century, a
 * digit for the 20th) and the three possible positions of the symbol in the
 * password, all valid under the current rule. MEXD980704HNLNXG10NL is the edge
 * case: without a second surname, it has X in positions 3 and 15.
 */
const USERS = [
  {
    username: 'RIVA030315MJCSLNA2JC',
    password: '!Palco26',
    displayName: 'Ana Sofía Ríos Vela',
    email: 'ana.rios@example.com',
  },
  {
    username: 'TENB010908HCMLVRA6CM',
    password: 'Teatro9$',
    displayName: 'Bruno Téllez Nava',
    email: 'bruno.tellez@example.com',
  },
  {
    username: 'IASC951122MQTBLR02QT',
    password: 'Cine#204',
    displayName: 'Carmen Ibarra Solís',
    email: 'carmen.ibarra@example.com',
  },
  {
    username: 'MEXD980704HNLNXG10NL',
    password: 'Museo$7A',
    displayName: 'Diego Méndez',
    email: 'diego.mendez@example.com',
  },
] as const

const database = await connectWith('NUXT_DATABASE_ADMIN_URL')
await applySchema(database)
await syncVenues(database, VENUES)

const hashed = USERS.map((user) => ({ ...user, passwordHash: bcrypt.hashSync(user.password, BCRYPT_COST) }))
await database.withTransaction(async (tx) => {
  for (const user of hashed) {
    await tx.query(
      `INSERT INTO users (username, password_hash, display_name, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = excluded.password_hash,
         display_name  = excluded.display_name,
         email         = excluded.email`,
      [user.username, user.passwordHash, user.displayName, user.email],
    )
  }
})
await database.close()

console.info(`Sembrados ${USERS.length} usuarios: ${USERS.map((u) => u.displayName).join(', ')}`)

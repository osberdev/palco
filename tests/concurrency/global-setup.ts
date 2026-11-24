import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import pg from 'pg'
import { VENUES } from '../../server/data/catalog'
import { applySchema, createDatabase } from '../../server/db/client'
import { syncVenues } from '../../server/db/venues.repository'
import { SEEDED_USERS } from '../helpers/seeded-users'
import { assertTestDatabase, hostOf, urlForDatabase } from './test-database'

export interface ConcurrencyDatabase {
  readonly name: string
  readonly adminUrl: string
  readonly appUrl: string
  readonly readerUrl: string
}

declare module 'vitest' {
  export interface ProvidedContext {
    concurrencyDatabase: ConcurrencyDatabase
  }
}

function required(preferred: string, fallback: string): string {
  const url = process.env[preferred] ?? process.env[fallback]
  if (!url) throw new Error(`La suite de concurrencia necesita ${preferred} o ${fallback}. Ver .env.example.`)
  return url
}

/** A connection to the maintenance database: never to `palco`. */
async function connectAdmin(adminUrl: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: urlForDatabase(adminUrl, 'postgres'), connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    return client
  }
  catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'sin respuesta'
    throw new Error(`La suite de concurrencia necesita PostgreSQL en ${hostOf(adminUrl)} (${code}). Corre \`docker compose up -d --wait\`.`)
  }
}

async function dropDatabase(client: pg.Client, name: string): Promise<void> {
  await client.query(`DROP DATABASE IF EXISTS ${assertTestDatabase(name)} WITH (FORCE)`)
}

export default async function setup({ provide }: { provide: (key: 'concurrencyDatabase', value: ConcurrencyDatabase) => void }) {
  const adminUrl = required('PALCO_TEST_ADMIN_URL', 'NUXT_DATABASE_ADMIN_URL')
  const appUrl = required('PALCO_TEST_APP_URL', 'NUXT_DATABASE_URL')
  const readerUrl = required('PALCO_TEST_READER_URL', 'NUXT_DATABASE_READER_URL')
  if (hostOf(adminUrl) !== hostOf(appUrl) || hostOf(adminUrl) !== hostOf(readerUrl)) {
    throw new Error('Las URL de la suite de concurrencia apuntan a servidores distintos')
  }

  const name = assertTestDatabase(`palco_test_${process.pid}_${randomBytes(4).toString('hex')}`)
  const client = await connectAdmin(adminUrl)
  // Whatever an interrupted run left behind.
  const leftovers = await client.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname LIKE 'palco\\_test\\_%'")
  for (const { datname } of leftovers.rows) await dropDatabase(client, datname)
  await client.query(`CREATE DATABASE ${name} TEMPLATE template0`)
  await client.end()

  const owner = createDatabase(urlForDatabase(adminUrl, name), { max: 2 })
  await applySchema(owner)
  await syncVenues(owner, VENUES)
  await owner.withTransaction(async (tx) => {
    for (const user of SEEDED_USERS) {
      await tx.query('INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)', [user.username, bcrypt.hashSync(user.password, 10), user.displayName])
    }
  })
  await owner.close()

  provide('concurrencyDatabase', {
    name,
    adminUrl: urlForDatabase(adminUrl, name),
    appUrl: urlForDatabase(appUrl, name),
    readerUrl: urlForDatabase(readerUrl, name),
  })

  return async () => {
    const teardown = await connectAdmin(adminUrl)
    await dropDatabase(teardown, name)
    await teardown.end()
  }
}

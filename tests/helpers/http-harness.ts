import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import bcrypt from 'bcrypt'
import * as h3 from 'h3'
import { vi } from 'vitest'
import type { Database } from '../../server/db/client'
import { createTestDatabase, type TestDatabase } from '../support/database'
import { SEEDED_USERS } from './seeded-users'

// Harness for the integration tests: the real `server/api/**` endpoints and the
// origin middleware, mounted on h3 on a free port, with the real session, PGlite in
// a temporary directory with the real schema and the sales state started as the
// plugin does. Nitro's auto-imports are replaced by what Nitro injects: all of
// `h3` and everything `server/utils/` exports. It does not change the application.
//
// The endpoints ask `getDatabase()` for the connection, and the harness sets it
// with `setDatabase`: no test connects to a PostgreSQL server. A test file uses a
// single harness: the database module is one per file.

const ROOT = resolve(import.meta.dirname, '../..')
const API = join(ROOT, 'server/api')

export { SEEDED_USERS }

export interface HarnessResponse {
  readonly status: number
  readonly headers: Headers
  /** The body as JSON if it is JSON; otherwise null. */
  readonly json: unknown
  readonly bytes: Buffer
}

export interface HarnessClient {
  login(username: string, password: string): Promise<HarnessResponse>
  get(path: string): Promise<HarnessResponse>
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<HarnessResponse>
  put(path: string, body?: unknown): Promise<HarnessResponse>
  patch(path: string, body?: unknown): Promise<HarnessResponse>
  delete(path: string): Promise<HarnessResponse>
}

export interface Harness {
  readonly baseUrl: string
  /** The current connection to the temporary database, to read it directly, as `palco_app`. */
  database(): TestDatabase
  /** A new client, with its own cookie jar. */
  client(): HarnessClient
  /** Closes the database and opens it again with the schema and the sales state, like a restart. */
  restart(availabilityOverrides?: string): Promise<void>
  /**
   * Empties the sales (tickets and purchases) and derives availability again with
   * `startSalesState`, without touching users, methods or WhatsApp: every test that
   * purchases starts from the same database, whatever the order. It also empties the
   * send outbox: folios start again at 1, and another test's send with the same folio
   * would count towards RN-ENV-04.
   */
  resetSales(availabilityOverrides?: string): Promise<void>
  /** What the WhatsApp plugin does at startup, with this environment; null leaves it unconfigured. */
  configureWhatsapp(env: Readonly<Record<string, string>> | null): Promise<void>
  /** What the gate plugin does at startup, with this `NUXT_GATE_PIN`; it clears the failed attempts. */
  configureGate(pin: string | undefined): Promise<void>
  /** Imports a server module into the same graph as the endpoints. */
  load<T>(path: string): Promise<T>
  close(): Promise<void>
}

export interface HarnessOptions {
  /** The startup `NUXT_AVAILABILITY_OVERRIDES`, as text. */
  readonly availabilityOverrides?: string
  /** A ready database, with `pg`, for the concurrency suite. Without it, PGlite. */
  readonly database?: Database
}

/** The harness on a real PostgreSQL: without PGlite's restarts or roles. */
export type PostgresHarness = Omit<Harness, 'database' | 'restart' | 'resetSales'> & { database(): Database }

/** `server/api/purchases/[folio]/tickets.get.ts` → `get /api/purchases/:folio/tickets`. */
function routeOf(file: string): { readonly method: string, readonly path: string } | null {
  const match = /^(.*?)(?:\.(get|post|put|patch|delete))\.ts$/.exec(relative(API, file).split(sep).join('/'))
  if (!match) return null
  const segments = match[1]!.split('/').filter((segment) => segment !== 'index')
  const path = `/api/${segments.map((segment) => segment.replace(/^\[(.+)\]$/, ':$1')).join('/')}`.replace(/\/$/, '')
  return { method: match[2]!, path }
}

function apiFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? apiFiles(path) : [path]
  })
}

/** Every function export of a module, as a global: that is how Nitro code sees them. */
function exposeAsGlobals(module: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(module)) {
    if (name !== 'default' && typeof value === 'function') vi.stubGlobal(name, value)
  }
}

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), 'palco-int-'))
  let server: Server | null = null
  try {
    // Nitro's auto-imports: h3, the configuration, the asset storage (the PDF fonts)
    // and the plugins.
    exposeAsGlobals(h3 as unknown as Record<string, unknown>)
    vi.stubGlobal('useRuntimeConfig', () => ({ sessionPassword: 'clave-de-sellado-del-arnes-con-mas-de-32-caracteres' }))
    vi.stubGlobal('useStorage', () => ({
      getItemRaw: async (key: string) => readFileSync(join(ROOT, 'server/assets', key)),
    }))
    vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
    for (const name of readdirSync(join(ROOT, 'server/utils')).filter((file) => file.endsWith('.ts'))) {
      exposeAsGlobals(await import(join(ROOT, 'server/utils', name)) as Record<string, unknown>)
    }

    const client = await import('../../server/db/client')
    const { startSalesState } = await import('../../server/utils/sales-startup')
    const { checkDatabase } = await import('../../server/utils/database-startup')
    const quiet = { info: () => {}, warn: () => {} }
    const dataDir = join(directory, 'pgdata')
    let current: TestDatabase
    const external = options.database

    // What the schema plugin does at startup: check the database, load the venues and
    // set availability, without applying the schema. The first time the owner applies
    // it, like `db:init`. A restart closes the instance and opens it again on the same
    // directory.
    const boot = async (overrides: string): Promise<TestDatabase> => {
      // The external one is only used as a `Database`: `PostgresHarness` exposes nothing else.
      current = external ? external as TestDatabase : await createTestDatabase({ dataDir })
      client.setDatabase(current)
      const check = await checkDatabase(current, [], 'postgres://palco_app@pglite/palco')
      if (!check.ok) throw new Error(check.message)
      // The venues are read from the database, as in the plugin.
      const started = await startSalesState(current, overrides, quiet)
      if (!started.ok) throw new Error(started.message)
      return current
    }
    const database = await boot(options.availabilityOverrides ?? '')
    if (!external) {
      await database.asOwner(async () => {
        for (const user of SEEDED_USERS) {
          await database.query('INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)', [user.username, bcrypt.hashSync(user.password, 10), user.displayName])
        }
      })
    }

    // h3 only answers `{ statusCode, stack }` to an error; Nitro's handler adds the
    // message, which the UI shows (for example, "Compra inexistente"). Its JSON shape is
    // reproduced, without the url or the stack.
    const app = h3.createApp({
      onError: async (error, event) => {
        const status = error.statusCode || 500
        h3.setResponseStatus(event, status, error.statusMessage)
        h3.setResponseHeader(event, 'Content-Type', 'application/json')
        await h3.send(event, JSON.stringify({ statusCode: status, statusMessage: error.statusMessage, message: error.message }))
      },
    })
    const { default: originMiddleware } = await import('../../server/middleware/request-origin') as { default: h3.EventHandler }
    app.use(originMiddleware)
    const router = h3.createRouter()
    for (const file of apiFiles(API)) {
      const route = routeOf(file)
      if (!route) continue
      const { default: handler } = await import(file) as { default: h3.EventHandler }
      router[route.method as 'get' | 'post' | 'put' | 'patch' | 'delete'](route.path, handler)
    }
    app.use(router)

    const listening = createServer(h3.toNodeListener(app))
    server = listening
    await new Promise<void>((done) => listening.listen(0, '127.0.0.1', done))
    const baseUrl = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`

    const makeClient = (): HarnessClient => {
      let cookie = ''
      const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const set = response.headers.get('set-cookie')
        if (set) cookie = set.split(';')[0]!
        const bytes = Buffer.from(await response.arrayBuffer())
        let json: unknown = null
        try {
          json = JSON.parse(bytes.toString('utf8'))
        }
        catch {
          json = null
        }
        return { status: response.status, headers: response.headers, json, bytes }
      }
      return {
        login: (username, password) => request('POST', '/api/auth/login', { username, password }),
        get: (path) => request('GET', path),
        post: (path, body, headers) => request('POST', path, body, headers),
        put: (path, body) => request('PUT', path, body),
        patch: (path, body) => request('PATCH', path, body),
        delete: (path) => request('DELETE', path),
      }
    }

    return {
      baseUrl,
      database: () => current,
      client: makeClient,
      restart: async (overrides = '') => {
        await client.closeDatabase()
        await boot(overrides)
      },
      resetSales: async (overrides = '') => {
        await current.asOwner(() => current.exec('DELETE FROM tickets; DELETE FROM purchases'))
        await startSalesState(current, overrides, quiet)
        const { resetWhatsappSends } = await import('../../server/data/whatsapp-sends')
        resetWhatsappSends()
      },
      configureWhatsapp: async (env) => {
        const config = await import('../../server/utils/whatsapp-config')
        if (env === null) {
          config.setWhatsappConfig(null)
          return
        }
        const { default: plugin } = await import('../../server/plugins/whatsapp') as { default: () => void }
        const saved = { ...process.env }
        try {
          Object.assign(process.env, env)
          plugin()
        }
        finally {
          for (const key of Object.keys(env)) {
            if (key in saved) process.env[key] = saved[key]
            else Reflect.deleteProperty(process.env, key)
          }
        }
      },
      configureGate: async (pin) => {
        const { default: plugin } = await import('../../server/plugins/gate') as { default: () => void }
        const saved = process.env.NUXT_GATE_PIN
        try {
          if (pin === undefined) Reflect.deleteProperty(process.env, 'NUXT_GATE_PIN')
          else process.env.NUXT_GATE_PIN = pin
          plugin()
        }
        finally {
          if (saved === undefined) Reflect.deleteProperty(process.env, 'NUXT_GATE_PIN')
          else process.env.NUXT_GATE_PIN = saved
        }
      },
      load: (path) => import(join(ROOT, path)),
      close: async () => {
        await closeAll()
      },
    }

    async function closeAll(): Promise<void> {
      if (server) await new Promise<void>((done) => server!.close(() => done()))
      server = null
      await client.closeDatabase()
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      rmSync(directory, { recursive: true, force: true })
    }
  }
  catch (error) {
    // If startup fails, nothing is left open, not even the temporary directory.
    if (server) await new Promise<void>((done) => server!.close(() => done()))
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

/** The harness with a `pg` database: the real endpoints on a real `Pool`. */
export async function createPostgresHarness(database: Database): Promise<PostgresHarness> {
  return await createHarness({ database }) as unknown as PostgresHarness
}

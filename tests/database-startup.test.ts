import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Queryable } from '../server/db/client'
import { checkDatabase, DATABASE_RETRY_ATTEMPTS, describeDatabaseFailure, waitForDatabase } from '../server/utils/database-startup'

// What the server requires from the database at startup, with its messages. Each
// case carries its identifier in its name.

const URL = 'postgres://palco_app:contrasena-que-no-debe-salir@127.0.0.1:55432/palco'
const IDS = ['louvre', 'met']

function answering(found: string | null, venues: readonly string[]): Queryable {
  return {
    query: (async (sql: string) => ({
      rows: sql.includes('to_regclass') ? [{ found }] : venues.map((id) => ({ id })),
    })) as Queryable['query'],
  }
}

function failing(code: string | undefined): Queryable {
  return {
    query: (async () => {
      throw Object.assign(new Error('fallo'), { code })
    }) as Queryable['query'],
  }
}

describe('checkDatabase', () => {
  it('DS1: con el esquema y los recintos, está lista', async () => {
    expect(await checkDatabase(answering('purchases', ['louvre', 'met', 'otro']), IDS, URL)).toEqual({ ok: true })
  })

  it('DS2: sin el esquema dice que falta, también con 3D000', async () => {
    const expected = { ok: false, retry: false, message: 'La base no tiene el esquema. Corre `bun run db:init`.' }
    expect(await checkDatabase(answering(null, []), IDS, URL)).toEqual(expected)
    expect(await checkDatabase(failing('3D000'), IDS, URL)).toEqual(expected)
    // After `DROP SCHEMA`, the role has no USAGE on the new schema: `to_regclass` gives 42501.
    expect(await checkDatabase(failing('42501'), IDS, URL)).toEqual(expected)
  })

  it('DS3: con un recinto del catálogo que no está, lo dice', async () => {
    expect(await checkDatabase(answering('purchases', ['louvre']), IDS, URL)).toEqual({
      ok: false,
      retry: false,
      message: 'La base no tiene los recintos del catálogo. Corre `bun run db:init`.',
    })
  })

  it('DS8: con el esquema y sin privilegios sobre los recintos, lo dice', async () => {
    const database: Queryable = {
      query: (async (sql: string) => {
        if (sql.includes('to_regclass')) return { rows: [{ found: 'purchases' }] }
        throw Object.assign(new Error('permiso'), { code: '42501' })
      }) as Queryable['query'],
    }
    expect(await checkDatabase(database, IDS, URL)).toEqual({
      ok: false,
      retry: false,
      message: 'El usuario palco_app no tiene privilegios sobre el esquema. Corre `bun run db:init`.',
    })
  })

  it('DS4: una contraseña errónea nombra al usuario y no reintenta', async () => {
    expect(await checkDatabase(failing('28P01'), IDS, URL)).toEqual({
      ok: false,
      retry: false,
      message: 'PostgreSQL rechazó al usuario palco_app. Revisa NUXT_DATABASE_URL en .env.',
    })
  })

  it('DS5: una base que no responde se reintenta, y ningún mensaje lleva la contraseña', async () => {
    const check = await checkDatabase(failing('ECONNREFUSED'), IDS, URL)
    // The server and the scripts suggest the same thing.
    expect(check).toEqual({ ok: false, retry: true, message: 'PostgreSQL no responde en 127.0.0.1:55432. Corre `bun run db:up`.' })
    for (const code of ['28P01', '3D000', '42501', 'XX000', 'ECONNREFUSED', undefined]) {
      expect(JSON.stringify(await checkDatabase(failing(code), IDS, URL))).not.toContain('contrasena')
    }
  })
})

describe('waitForDatabase', () => {
  it('DS6: reintenta lo que no responde hasta el límite, y lo demás no', async () => {
    let sleeps = 0
    const sleep = async () => {
      sleeps += 1
    }
    expect((await waitForDatabase(failing('ECONNREFUSED'), IDS, URL, sleep)).ok).toBe(false)
    expect(sleeps).toBe(DATABASE_RETRY_ATTEMPTS - 1)

    sleeps = 0
    expect((await waitForDatabase(failing('28P01'), IDS, URL, sleep)).ok).toBe(false)
    expect(sleeps).toBe(0)
  })

  it('DS7: si la base termina de arrancar, sigue', async () => {
    let calls = 0
    const database: Queryable = {
      query: (async (sql: string) => {
        calls += 1
        if (calls <= 2) throw Object.assign(new Error('arrancando'), { code: '57P03' })
        return { rows: sql.includes('to_regclass') ? [{ found: 'purchases' }] : IDS.map((id) => ({ id })) }
      }) as Queryable['query'],
    }
    expect(await waitForDatabase(database, IDS, URL, async () => {})).toEqual({ ok: true })
  })
})

// The same messages in the db:* scripts and in whatsapp:check --send-test as in the
// server.
describe('describeDatabaseFailure en los scripts', () => {
  const fails = (code: string | undefined) => Object.assign(new Error('fallo'), { code })

  it('DS9: una base que no responde sugiere bun run db:up', () => {
    expect(describeDatabaseFailure(fails('ECONNREFUSED'), URL)).toEqual({ ok: false, retry: true, message: 'PostgreSQL no responde en 127.0.0.1:55432. Corre `bun run db:up`.' })
    expect(describeDatabaseFailure(new Error('timeout exceeded when trying to connect'), URL).ok).toBe(false)
  })

  it('DS10: una contraseña errónea nombra al usuario', () => {
    expect(describeDatabaseFailure(fails('28P01'), URL)).toEqual({ ok: false, retry: false, message: 'PostgreSQL rechazó al usuario palco_app. Revisa NUXT_DATABASE_URL en .env.' })
  })

  it('DS11: una base inexistente dice que corras db:init', () => {
    expect(describeDatabaseFailure(fails('3D000'), URL)).toEqual({ ok: false, retry: false, message: 'La base no tiene el esquema. Corre `bun run db:init`.' })
  })

  it('DS12: sin privilegios, también db:init', () => {
    expect(describeDatabaseFailure(fails('42501'), URL)).toEqual({ ok: false, retry: false, message: 'El usuario palco_app no tiene privilegios sobre el esquema. Corre `bun run db:init`.' })
  })

  it('DS13: otro código de PostgreSQL se nombra, sin el texto del error', () => {
    expect(describeDatabaseFailure(fails('XX000'), URL)).toEqual({ ok: false, retry: false, message: 'PostgreSQL respondió con el error XX000.' })
  })

  it('DS14: db:init con la base caída sale con 1, el mensaje y sin traza ni contraseña', () => {
    const ROOT = resolve(import.meta.dirname, '..')
    const run = spawnSync('node', ['--import', join(ROOT, 'scripts/resolve-ts.ts'), join(ROOT, 'scripts/db-init.ts')], {
      cwd: ROOT,
      encoding: 'utf8',
      // A port nobody listens on.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NUXT_DATABASE_ADMIN_URL: 'postgres://palco_admin:contrasena-que-no-debe-salir@127.0.0.1:1/palco' },
    })
    expect(run.status).toBe(1)
    expect(run.stderr.trim()).toBe('PostgreSQL no responde en 127.0.0.1:1. Corre `bun run db:up`.')
    expect(run.stdout + run.stderr).not.toContain('contrasena')
    expect(run.stdout + run.stderr).not.toMatch(/\n\s+at /)
  })
})

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { loadedVenues } from '../server/data/venues'
import { parseVenueRows, type VenueProblem, type VenueRows } from '../server/db/venue-rows'
import { loadVenueRows } from '../server/db/venues.repository'
import { prepareServerDatabase, startSalesState } from '../server/utils/sales-startup'
import { createTestDatabase, type TestDatabase } from './support/database'

// The venues as read from the database. `parseVenueRows`: every rule a CHECK cannot
// express, over the rows the database gives for the catalog, altered in memory.
// Startup: what the plugin does, over the function that does it. And that no server
// file uses the catalog at runtime. All in one file, to start PGlite only once.
// Each case carries its identifier in its name.

const ROOT = resolve(import.meta.dirname, '..')
const quiet = { info: () => {}, warn: () => {} }

let database: TestDatabase
let empty: TestDatabase
let rows: VenueRows

beforeAll(async () => {
  database = await createTestDatabase()
  empty = await createTestDatabase({ syncCatalog: false })
  rows = await loadVenueRows(database)
})

afterAll(async () => {
  await database.close()
  await empty.close()
})

/** The catalog rows with one change. */
const altered = (change: Partial<VenueRows>): VenueRows => ({ ...rows, ...change })

function problemsOf(input: VenueRows): readonly VenueProblem[] {
  const parsed = parseVenueRows(input)
  return parsed.ok ? [] : parsed.problems
}

const rulesOf = (input: VenueRows) => problemsOf(input).map(({ venueId, rule }) => ({ venueId, rule }))

describe('parseVenueRows', () => {
  it('VP1: las filas del catálogo no reportan nada, y el resultado está congelado', () => {
    const parsed = parseVenueRows(rows)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.venues).toHaveLength(VENUES.length)
    expect(Object.isFrozen(parsed.venues)).toBe(true)
    expect(Object.isFrozen(parsed.venues[0]!.hours.open)).toBe(true)
  })

  it('VP2: una fila de otra categoría: secciones en un cine, formatos y películas en un teatro, un museo en un cine', () => {
    expect(rulesOf(altered({ sections: [...rows.sections, { venue_id: 'cinepolis', position: 0, name: 'Platea', price_cents: 1 }] })))
      .toEqual([{ venueId: 'cinepolis', rule: 'categoria-ajena' }])
    expect(rulesOf(altered({
      formats: [...rows.formats, { venue_id: 'teatro-scala', position: 0, format_id: 'vip', price_cents: 1, seats: 1 }],
      films: [...rows.films, { venue_id: 'teatro-scala', position: 0, title: 'X', classification: 'A', duration_minutes: 90 }],
    }))).toEqual([{ venueId: 'teatro-scala', rule: 'categoria-ajena' }, { venueId: 'teatro-scala', rule: 'categoria-ajena' }])
    expect(rulesOf(altered({ museums: [...rows.museums, { venue_id: 'amc', general_fee_cents: 1, resident_fee_cents: null, residency_question: null, entry_note: 'x' }] })))
      .toEqual([{ venueId: 'amc', rule: 'categoria-ajena' }])
  })

  it('VP3: cada recinto tiene exactamente su fila de categoría', () => {
    expect(rulesOf(altered({ theaters: rows.theaters.filter((row) => row.venue_id !== 'teatro-colon') })))
      .toEqual([{ venueId: 'teatro-colon', rule: 'fila-de-categoria' }])
    expect(rulesOf(altered({ cinemas: rows.cinemas.filter((row) => row.venue_id !== 'cinemex') })))
      .toEqual([{ venueId: 'cinemex', rule: 'fila-de-categoria' }])
    const louvre = rows.museums.find((row) => row.venue_id === 'louvre')!
    expect(rulesOf(altered({ museums: [...rows.museums, louvre] }))).toEqual([{ venueId: 'louvre', rule: 'fila-de-categoria' }])
  })

  it('VP4: un teatro sin secciones ni obras, o un cine sin formatos ni películas', () => {
    expect(rulesOf(altered({ sections: rows.sections.filter((row) => row.venue_id !== 'teatro-scala') })))
      .toEqual([{ venueId: 'teatro-scala', rule: 'minimos' }])
    expect(rulesOf(altered({ plays: rows.plays.filter((row) => row.venue_id !== 'teatro-scala') })))
      .toEqual([{ venueId: 'teatro-scala', rule: 'minimos' }])
    expect(rulesOf(altered({ formats: rows.formats.filter((row) => row.venue_id !== 'amc'), films: rows.films.filter((row) => row.venue_id !== 'amc') })))
      .toEqual([{ venueId: 'amc', rule: 'minimos' }, { venueId: 'amc', rule: 'minimos' }])
  })

  it('VP5: posiciones sin huecos, de 0 a n−1, en las hijas y en los recintos', () => {
    expect(rulesOf(altered({ sections: rows.sections.filter((row) => !(row.venue_id === 'teatro-scala' && row.position === 2)) })))
      .toEqual([{ venueId: 'teatro-scala', rule: 'posiciones' }])
    expect(rulesOf(altered({ films: rows.films.map((row) => (row.venue_id === 'cinepolis' && row.position === 0 ? { ...row, position: 9 } : row)) })))
      .toEqual([{ venueId: 'cinepolis', rule: 'posiciones' }])
    expect(rulesOf(altered({ venues: rows.venues.map((venue) => (venue.id === 'met' ? { ...venue, position: null } : venue)) })))
      .toContainEqual({ venueId: 'met', rule: 'posiciones' })
  })

  it('VP6: un formato repetido', () => {
    const vip = rows.formats.find((row) => row.venue_id === 'cinepolis' && row.format_id === 'vip')!
    const count = rows.formats.filter((row) => row.venue_id === 'cinepolis').length
    expect(rulesOf(altered({ formats: [...rows.formats, { ...vip, position: count }] })))
      .toEqual([{ venueId: 'cinepolis', rule: 'formato-repetido' }])
  })

  it('VP7: un cierre anual que no existe; el 29 de febrero sí existe', () => {
    expect(rulesOf(altered({ annualClosures: [...rows.annualClosures, { venue_id: 'louvre', month: 2, day: 30, name: 'X' }] })))
      .toEqual([{ venueId: 'louvre', rule: 'cierre-inexistente' }])
    expect(rulesOf(altered({ annualClosures: [...rows.annualClosures, { venue_id: 'louvre', month: 4, day: 31, name: 'X' }] })))
      .toEqual([{ venueId: 'louvre', rule: 'cierre-inexistente' }])
    expect(rulesOf(altered({ annualClosures: [...rows.annualClosures, { venue_id: 'louvre', month: 2, day: 29, name: 'Bisiesto' }] }))).toEqual([])
  })

  it('VP8: a lo más una de las políticas del horario alterno', () => {
    expect(rulesOf(altered({ exceptions: [...rows.exceptions, { venue_id: 'louvre', policy: 'WEEKEND_HOURS' }] })))
      .toEqual([{ venueId: 'louvre', rule: 'horario-alterno' }])
    // Another policy that does not use the alternate hours does not count.
    expect(rulesOf(altered({ exceptions: [...rows.exceptions, { venue_id: 'louvre', policy: 'OPENS_ON_HOLIDAY' }] }))).toEqual([])
  })

  it('VP9: falta el horario alterno o el de domingo y festivos', () => {
    expect(rulesOf(altered({ hours: rows.hours.filter((row) => !(row.venue_id === 'mnac' && row.kind === 'alternate')) })))
      .toEqual([{ venueId: 'mnac', rule: 'horarios-faltantes' }])
    expect(rulesOf(altered({ hours: rows.hours.filter((row) => !(row.venue_id === 'mnac' && row.kind === 'sunday_holiday')) })))
      .toEqual([{ venueId: 'mnac', rule: 'horarios-faltantes' }])
  })

  it('VP10: un recinto sin ninguna fila en las tablas de recintos, y filas de un recinto que no está', () => {
    const notMet = <R extends { readonly venue_id: string }>(list: readonly R[]): readonly R[] => list.filter((row) => row.venue_id !== 'met')
    const bare = altered({
      hours: notMet(rows.hours),
      closedWeekdays: notMet(rows.closedWeekdays),
      exceptions: notMet(rows.exceptions),
      annualClosures: notMet(rows.annualClosures),
      museums: notMet(rows.museums),
    })
    expect(rulesOf(bare)).toEqual([{ venueId: 'met', rule: 'sin-filas' }])
    expect(rulesOf(altered({ plays: [...rows.plays, { venue_id: 'teatro-fantasma', position: 0, title: 'X' }] })))
      .toEqual([{ venueId: 'teatro-fantasma', rule: 'fila-huerfana' }])
  })

  it('VP11: se reportan todos los problemas, de varios recintos, no solo el primero, cada uno con su recinto y su regla', () => {
    const problems = problemsOf(altered({
      theaters: rows.theaters.filter((row) => row.venue_id !== 'teatro-colon'),
      exceptions: [...rows.exceptions, { venue_id: 'louvre', policy: 'SEASONAL_HOURS' }],
      annualClosures: [...rows.annualClosures, { venue_id: 'mna', month: 2, day: 30, name: 'X' }],
      hours: rows.hours.filter((row) => !(row.venue_id === 'amc' && row.kind === 'alternate')),
    }))
    expect(problems.map(({ venueId, rule }) => ({ venueId, rule }))).toEqual([
      { venueId: 'teatro-colon', rule: 'fila-de-categoria' },
      { venueId: 'amc', rule: 'horarios-faltantes' },
      { venueId: 'louvre', rule: 'horario-alterno' },
      { venueId: 'mna', rule: 'cierre-inexistente' },
    ])
    for (const problem of problems) expect(problem.detail.length).toBeGreaterThan(0)
  })
})

describe('el arranque', () => {
  it('AR1: sin recintos no arranca, y dice que corras db:init', async () => {
    expect(await startSalesState(empty, '', quiet)).toEqual({ ok: false, message: 'La base no tiene recintos. Corre `bun run db:init`.' })
  })

  it('AR2: con un recinto inválido no arranca, y nombra cada recinto y su regla; con los del catálogo, los deja cargados', async () => {
    expect(await startSalesState(database, '', quiet)).toEqual({ ok: true })
    expect(loadedVenues()).toEqual(VENUES)

    const broken = await database.copy()
    try {
      await broken.asOwner(() => broken.exec(`
        DELETE FROM venue_theaters WHERE venue_id = 'teatro-colon';
        INSERT INTO venue_exceptions (venue_id, policy) VALUES ('louvre', 'WEEKEND_HOURS');`))
      const started = await startSalesState(broken, '', quiet)
      expect(started.ok).toBe(false)
      if (started.ok) return
      expect(started.message).toContain('Los recintos de la base no son válidos')
      expect(started.message).toContain('teatro-colon (fila-de-categoria)')
      expect(started.message).toContain('louvre (horario-alterno)')
    }
    finally {
      await broken.close()
    }
  })
})

/** The `.ts` files of a folder, recursively. */
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

describe('la comprobación previa de bun run start', () => {
  it('AR4: prepareServerDatabase, la del plugin y la de scripts/start-check.ts, exige el esquema y los recintos', async () => {
    const url = 'postgres://palco_app@pglite/palco'
    expect(await prepareServerDatabase(empty, url, '', quiet)).toEqual({ ok: false, message: 'La base no tiene recintos. Corre `bun run db:init`.' })
    expect(await prepareServerDatabase(database, url, '', quiet)).toEqual({ ok: true })
    const bare = await createTestDatabase({ schema: null })
    try {
      expect(await prepareServerDatabase(bare, url, '', quiet)).toEqual({ ok: false, message: 'La base no tiene el esquema. Corre `bun run db:init`.' })
    }
    finally {
      await bare.close()
    }
  })
})

describe('sin el catálogo en el servidor', () => {
  it('AR3: ningún archivo de server/ fuera de server/data/ importa VENUES', () => {
    const offenders = sources(join(ROOT, 'server'))
      .filter((path) => !relative(ROOT, path).startsWith('server/data/'))
      .filter((path) => /\bVENUES\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path))
    expect(offenders).toEqual([])
  })
})

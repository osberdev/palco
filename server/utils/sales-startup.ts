import { deriveAvailability, parseAvailabilityOverrides, setAvailabilityOverrides } from '../data/availability'
import { setLoadedVenues } from '../data/venues'
import type { Queryable } from '../db/client'
import { waitForDatabase } from './database-startup'
import { soldByVenue } from '../db/purchases.repository'
import { describeVenueProblems } from '../db/venue-rows'
import { loadVenues } from '../db/venues.repository'

/** Where warnings are written; the tests pass their own. */
export interface StartupLog {
  readonly info: (message: string) => void
  readonly warn: (message: string) => void
}

/** Whether startup can continue, or why not. */
export type SalesStartup = { readonly ok: true } | { readonly ok: false, readonly message: string }

/**
 * What startup does with the venues and the sales. First it reads the venues from
 * the database, validates them and stores them in `server/data/venues.ts`: with
 * none, or with an invalid one, it stops and says why, with each venue and its
 * rule. Then it sets each venue's base (the capacity, or the
 * `NUXT_AVAILABILITY_OVERRIDES` override) and warns about sales above it, which
 * leave the venue at 0. A typo in the override never stops the server: it warns
 * and uses the capacity. Availability is not stored here: it is computed from the
 * database on every read.
 *
 * It runs as `palco_app`, which does not write the venues: if someone synced them
 * here again, PU11 would fail with 42501.
 */
export async function startSalesState(database: Queryable, overridesText: string, log: StartupLog = console): Promise<SalesStartup> {
  const loaded = await loadVenues(database)
  if (!loaded.ok) {
    return { ok: false, message: `Los recintos de la base no son válidos. Corrígelos o corre \`bun run db:init\`:\n${describeVenueProblems(loaded.problems)}` }
  }
  if (loaded.venues.length === 0) return { ok: false, message: 'La base no tiene recintos. Corre `bun run db:init`.' }
  const venues = loaded.venues
  setLoadedVenues(venues)

  const parsed = parseAvailabilityOverrides(overridesText, venues)
  if (!parsed.ok) {
    log.warn(`[palco] NUXT_AVAILABILITY_OVERRIDES ignorada: «${parsed.entry}» (${parsed.reason}). Se usa el aforo completo como base.`)
  }
  const overrides = parsed.ok ? parsed.overrides : new Map<string, number>()
  const derived = deriveAvailability(venues, overrides, await soldByVenue(database))
  setAvailabilityOverrides(overrides)

  if (overrides.size > 0) {
    const applied = [...overrides].map(([venueId, seats]) => `${venueId}=${seats}`).join(', ')
    log.info(`[palco] Disponibilidad base sobrescrita: ${applied}`)
  }
  for (const { venueId, base, sold } of derived.oversold) {
    log.warn(`[palco] ${venueId}: vendidos ${sold} superan la base de ${base}. Se deja en 0 lugares libres.`)
  }
  return { ok: true }
}

/**
 * Everything startup requires from the database, in order: that it answers and
 * has the schema (`waitForDatabase`, with its retries), and that its venues are
 * valid (`startSalesState`). Used by the server plugin and by
 * `scripts/start-check.ts`, the pre-flight check of `bun run start`: Nitro calls
 * the plugins without awaiting them and listens before this finishes.
 */
export async function prepareServerDatabase(database: Queryable, url: string, overridesText: string, log: StartupLog = console): Promise<SalesStartup> {
  // The venues are no longer checked against the catalog: they are read from the
  // database and validated in `startSalesState`.
  const check = await waitForDatabase(database, [], url)
  if (!check.ok) return { ok: false, message: check.message }
  return startSalesState(database, overridesText, log)
}

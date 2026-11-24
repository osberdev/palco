import type { Venue } from '../../types'

/**
 * The server's venues: `startSalesState` reads them from the database at startup,
 * validated and frozen, and they do not change until a restart. It is the only
 * place the endpoints take them from; `server/data/catalog.ts` is only the seed for
 * `db:init`. Before startup it is empty: no request arrives before the plugin
 * finishes.
 */
let current: readonly Venue[] = Object.freeze([])

export function setLoadedVenues(venues: readonly Venue[]): void {
  current = venues
}

export function loadedVenues(): readonly Venue[] {
  return current
}

export function findLoadedVenue(id: string | undefined): Venue | undefined {
  return current.find((venue) => venue.id === id)
}

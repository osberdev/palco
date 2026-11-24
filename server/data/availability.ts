import type { Venue } from '../../types'

/**
 * Availability is computed from the database on every read: the venue's base minus
 * what was sold. Only the base lives here: the capacity, or whatever
 * `NUXT_AVAILABILITY_OVERRIDES` sets. It is read at startup and does not change:
 * it is configuration, not sales state (RNF-04). A purchase reads what was sold
 * inside its transaction, under the venue lock (RN-CON-03).
 */
let baseOverrides: ReadonlyMap<string, number> = new Map()

export function setAvailabilityOverrides(overrides: ReadonlyMap<string, number>): void {
  baseOverrides = overrides
}

export function availabilityOverrides(): ReadonlyMap<string, number> {
  return baseOverrides
}

/** A venue's free seats, given what was sold, already read from the database. */
export function freeSeats(venue: Venue, sold: number): number {
  return Math.max((baseOverrides.get(venue.id) ?? venue.capacity) - sold, 0)
}

/** A venue with more sold than its base: it is left at 0 and a warning is logged. */
export interface Oversold {
  readonly venueId: string
  readonly base: number
  readonly sold: number
}

export interface DerivedAvailability {
  readonly seats: ReadonlyMap<string, number>
  readonly oversold: readonly Oversold[]
}

/**
 * Each venue's availability from what was sold. It is pure: the caller passes the
 * override and the database's `soldByVenue`. Sales of a venue no longer in the
 * catalog are ignored.
 */
export function deriveAvailability(
  venues: readonly Venue[],
  overrides: ReadonlyMap<string, number>,
  sold: ReadonlyMap<string, number>,
): DerivedAvailability {
  const seats = new Map<string, number>()
  const oversold: Oversold[] = []
  for (const venue of venues) {
    const base = overrides.get(venue.id) ?? venue.capacity
    const venueSold = sold.get(venue.id) ?? 0
    if (venueSold > base) oversold.push({ venueId: venue.id, base, sold: venueSold })
    seats.set(venue.id, Math.max(base - venueSold, 0))
  }
  return { seats, oversold }
}

export type AvailabilityOverridesRejection = 'format' | 'unknown-venue' | 'out-of-range' | 'duplicate'

export type AvailabilityOverrides =
  | { readonly ok: true; readonly overrides: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly entry: string; readonly reason: AvailabilityOverridesRejection }

/**
 * `teatro-scala=5,mna=0`. It is operator configuration, not UI text: that is why
 * it does not use `Result` or `MESSAGES`.
 */
export function parseAvailabilityOverrides(text: string, venues: readonly Venue[]): AvailabilityOverrides {
  const overrides = new Map<string, number>()
  if (text.trim() === '') return { ok: true, overrides }

  for (const raw of text.split(',')) {
    const entry = raw.trim()
    const match = /^([a-z-]+)=(\d+)$/.exec(entry)
    if (!match) return { ok: false, entry, reason: 'format' }

    const venueId = match[1]!
    const digits = match[2]!
    const venue = venues.find((candidate) => candidate.id === venueId)
    if (!venue) return { ok: false, entry, reason: 'unknown-venue' }

    const seats = Number(digits)
    if (seats > venue.capacity) return { ok: false, entry, reason: 'out-of-range' }
    if (overrides.has(venueId)) return { ok: false, entry, reason: 'duplicate' }
    overrides.set(venueId, seats)
  }
  return { ok: true, overrides }
}

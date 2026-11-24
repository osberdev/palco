import { CATEGORIES } from '../data/catalog'
import { loadedVenues } from '../data/venues'
import { availabilityOverrides, deriveAvailability } from '../data/availability'
import { soldByVenue } from '../db/purchases.repository'
import type { CatalogResponse } from '../../types'

export default defineEventHandler(async (event): Promise<CatalogResponse> => {
  const session = await usePalcoSession(event)

  if (typeof session.data.userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  // No transaction and no lock: a read never waits for a purchase in progress, and it
  // sees what has already been committed.
  const venues = loadedVenues()
  const { seats } = deriveAvailability(venues, availabilityOverrides(), await soldByVenue())
  return {
    categories: CATEGORIES,
    venues: venues.map((venue) => toCatalogVenue(venue, seats.get(venue.id) ?? 0)),
  }
})

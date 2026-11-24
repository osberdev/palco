import { CATEGORIES } from '../../data/catalog'
import { findLoadedVenue } from '../../data/venues'
import { freeSeats } from '../../data/availability'
import { soldInVenue } from '../../db/purchases.repository'
import type { VenueDetail } from '../../../types'

export default defineEventHandler(async (event): Promise<VenueDetail> => {
  const session = await usePalcoSession(event)

  if (typeof session.data.userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  const venue = findLoadedVenue(getRouterParam(event, 'id'))
  if (!venue) {
    throw createError({ statusCode: 404, message: 'Recinto inexistente' })
  }

  // The limit belongs to the category and is not duplicated per venue.
  const userLimit = CATEGORIES.find((category) => category.slug === venue.category)?.maxTickets ?? 0
  return toVenueDetail(venue, freeSeats(venue, await soldInVenue(venue.id)), userLimit)
})

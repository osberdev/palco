import type { CatalogVenue, Venue, VenueDetail } from '../../types'
import { referencePrice } from '../domain/booking'

/**
 * Projects a catalog venue onto what the screen needs. It is pure and receives
 * availability as an argument so it can be tested without starting the server or
 * touching mutable state.
 *
 * Keys are listed one by one instead of spreading `venue`, so hours, exceptions
 * and closures never travel to the client by accident.
 */
export function toCatalogVenue(venue: Venue, available: number): CatalogVenue {
  return {
    id: venue.id,
    name: venue.name,
    city: venue.city,
    category: venue.category,
    currency: venue.currency,
    capacity: venue.capacity,
    available,
    referencePrice: referencePrice(venue),
    detailCount: detailCount(venue),
    hasResidentFee: venue.category === 'museo' && venue.hasDifferentiatedFee,
  }
}

function detailCount(venue: Venue): number | null {
  switch (venue.category) {
    case 'teatro':
      return venue.sections.length
    case 'cine':
      return venue.formats.length
    case 'museo':
      return null
  }
}

/**
 * Purchase detail. The deliberate counterpart of `toCatalogVenue`: it delivers the
 * complete venue, with hours, exceptions, closures and jurisdiction, because the
 * purchase screen evaluates the opening on the client with the domain.
 */
export function toVenueDetail(venue: Venue, available: number, userLimit: number): VenueDetail {
  switch (venue.category) {
    case 'teatro':
      return { category: 'teatro', venue, available, userLimit }
    case 'cine':
      return { category: 'cine', venue, available, userLimit }
    case 'museo':
      return { category: 'museo', venue, available, userLimit }
  }
}

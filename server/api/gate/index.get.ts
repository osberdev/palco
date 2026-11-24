import { gateConfig } from '../../data/gate'
import { loadedVenues } from '../../data/venues'
import { currentGateVenue } from '../../utils/gate-session'
import type { GateStatus } from '../../../types'

/**
 * The gate status for `/acceso` (RN-ACC-01). It does not require the buyer's
 * session: the gate is not an account. Without a configuration, no form and no
 * venues; without an open gate, the venue list. It writes nothing, not even an
 * empty cookie: GET requests do not change data (RN-SEG-03).
 */
export default defineEventHandler(async (event): Promise<GateStatus> => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  if (!gateConfig()) return { configured: false, venue: null, venues: [] }

  const venue = await currentGateVenue(event)
  return {
    configured: true,
    venue: venue ? { id: venue.id, name: venue.name } : null,
    venues: loadedVenues().map(({ id, name }) => ({ id, name })),
  }
})

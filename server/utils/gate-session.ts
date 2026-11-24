import { getCookie, type H3Event } from 'h3'
import { gateConfig } from '../data/gate'
import { findLoadedVenue } from '../data/venues'
import type { Venue } from '../../types'

export interface GateSessionData {
  venueId?: string
  pinTag?: string
}

const TWELVE_HOURS_IN_SECONDS = 60 * 60 * 12

export const GATE_COOKIE = 'palco_gate'

/**
 * The gate cookie, sealed like the session cookie but with another name: opening
 * or closing the gate does not touch the buyer's session, and vice versa. It lasts
 * a shift; closing the browser does not close it, "Cerrar taquilla" does. It
 * carries the venue and the PIN's tag, never the PIN.
 */
export function useGateSession(event: H3Event) {
  const { sessionPassword } = useRuntimeConfig(event)

  return useSession<GateSessionData>(event, {
    name: GATE_COOKIE,
    password: sessionPassword,
    maxAge: TWELVE_HOURS_IN_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  })
}

/**
 * The venue of the open gate, or null: no gate configured, no cookie, the tag of
 * another PIN (`NUXT_GATE_PIN` changed) or a venue that is no longer loaded.
 */
export async function currentGateVenue(event: H3Event): Promise<Venue | null> {
  const config = gateConfig()
  if (!config) return null
  // Without a cookie the session is not opened: h3's `useSession` would issue an
  // empty one, and a request from someone who never opened the gate must not leave
  // anything in the browser.
  if (!getCookie(event, GATE_COOKIE)) return null
  const { data } = await useGateSession(event)
  if (data.pinTag !== config.tag) return null
  return findLoadedVenue(data.venueId) ?? null
}

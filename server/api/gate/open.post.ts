import { gateConfig, gateFailuresFrom, storeGateFailures } from '../../data/gate'
import { findLoadedVenue } from '../../data/venues'
import { evaluateGatePinLimit } from '../../domain/gate'
import { err, type Result } from '../../domain/result'
import { gatePinMatches } from '../../utils/gate-config'
import { useGateSession } from '../../utils/gate-session'
import { readJsonBody } from '../../utils/account'
import { isPlainRecord } from '../../utils/shape'
import type { GateOpenField, GateOpenResponse } from '../../../types'

const failure = (field: GateOpenField | null, result: Result): GateOpenResponse =>
  ({ ok: false, field, code: result.code, message: result.message })

/** Exactly `{ venueId, pin }`, as text: any other shape does not come from the form. */
function parseOpenBody(body: unknown): { readonly venueId: string, readonly pin: string } | null {
  if (!isPlainRecord(body)) return null
  const keys = Object.keys(body).sort()
  if (keys.length !== 2 || keys[0] !== 'pin' || keys[1] !== 'venueId') return null
  const { venueId, pin } = body
  return typeof venueId === 'string' && typeof pin === 'string' ? { venueId, pin } : null
}

/**
 * Opens a venue's gate (RN-ACC-01 and 02). It does not require the buyer's
 * session. Fixed order, the first one that applies wins: not configured; failed
 * attempt limit, before reading the body; shape; venue; PIN; opening.
 */
export default defineEventHandler(async (event): Promise<GateOpenResponse> => {
  if (!gateConfig()) {
    setResponseStatus(event, 503)
    return failure(null, err('ERR_GATE_UNAVAILABLE'))
  }

  // The socket IP, without `xForwardedFor`, like registration.
  const ip = getRequestIP(event) ?? 'unknown'
  const limited = (): GateOpenResponse | null => {
    const decision = evaluateGatePinLimit(gateFailuresFrom(ip), Date.now())
    storeGateFailures(ip, decision.kept)
    if (decision.ok) return null
    if (decision.result.code === 'ERR_GATE_RATE_LIMITED') {
      setResponseHeader(event, 'Retry-After', Math.ceil(decision.retryAfterMs / 1000))
    }
    setResponseStatus(event, 429)
    return failure(null, decision.result)
  }
  // Before reading the body, so nothing is spent on someone who has used up their attempts.
  const early = limited()
  if (early) return early

  const input = parseOpenBody(await readJsonBody(event))
  if (input === null) {
    setResponseStatus(event, 400)
    return failure(null, err('ERR_INPUT_INVALID'))
  }
  const venue = findLoadedVenue(input.venueId)
  if (!venue) {
    setResponseStatus(event, 400)
    return failure('venueId', err('ERR_INPUT_INVALID'))
  }

  // From here until the failure is stored there is no `await`: two simultaneous
  // wrong PINs cannot both pass as the fifth attempt. The limit is evaluated again
  // because reading the body did wait.
  const config = gateConfig()
  if (!config) {
    setResponseStatus(event, 503)
    return failure(null, err('ERR_GATE_UNAVAILABLE'))
  }
  const late = limited()
  if (late) return late
  if (!gatePinMatches(input.pin, config)) {
    // Only an attempt that compares the PIN and fails counts (RN-ACC-02).
    storeGateFailures(ip, [...gateFailuresFrom(ip), Date.now()])
    setResponseStatus(event, 400)
    return failure('pin', err('ERR_GATE_PIN_INVALID'))
  }

  const session = await useGateSession(event)
  await session.update({ venueId: venue.id, pinTag: config.tag })
  return { ok: true, venue: { id: venue.id, name: venue.name } }
})

import { evaluateRateLimit, type RateLimitDecision, type RateLimitPolicy } from './rate-limit'
import { err } from './result'

/**
 * The gate (RN-ACC-01 and 02). No clock and no state: the endpoint passes the
 * instants of the failed attempts and the current instant.
 */

/** RN-ACC-02: 5 failed PIN attempts per IP in 15 minutes. */
export const GATE_PIN_LIMIT: RateLimitPolicy = { limit: 5, windowMs: 900_000 }

/**
 * The sliding window of RN-REG-07 over **failed** PIN attempts (RN-ACC-02). A
 * successful opening does not count, because the risk is guessing the PIN and
 * only a failure gets closer to that. `evaluateRateLimit` always answers with the
 * registration code, so it is translated here, as the send limit does
 * (RN-ENV-04).
 */
export function evaluateGatePinLimit(failures: readonly number[], now: number): RateLimitDecision {
  const decision = evaluateRateLimit(failures, now, GATE_PIN_LIMIT)
  if (decision.ok || decision.result.code !== 'ERR_REGISTRATION_RATE_LIMITED') return decision
  return { ...decision, result: err('ERR_GATE_RATE_LIMITED') }
}

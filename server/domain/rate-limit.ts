import { err, type Result } from './result'

/**
 * Sliding window of attempts (RN-REG-07). It knows nothing about IPs,
 * registrations or HTTP: it receives the instants of the previous attempts and the
 * current instant, in integer milliseconds, and decides whether one more is allowed.
 */
export interface RateLimitPolicy {
  /** Attempts allowed in the window, an integer ≥ 1. */
  readonly limit: number
  /** Window length in milliseconds, an integer ≥ 1. */
  readonly windowMs: number
}

export type RateLimitDecision =
  | { readonly ok: true; readonly kept: readonly number[] }
  | { readonly ok: false; readonly result: Result; readonly retryAfterMs: number; readonly kept: readonly number[] }

const isPositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 1

/**
 * Fixed order, the first one that applies wins: invalid policy or instant;
 * attempts in the window already at the limit; allowed.
 *
 * The window is open at its old end: an attempt exactly `windowMs` ago no longer
 * counts, so `now + retryAfterMs` is the first instant at which the next one is
 * allowed. An instant after `now` (the clock went backwards) counts: when in
 * doubt, count it.
 *
 * It does not add `now` to `kept`: deciding and recording are separate steps, and
 * the caller records the attempt only if it was allowed. If rejected attempts
 * were recorded, someone retrying non-stop would never leave the window.
 */
export function evaluateRateLimit(
  attempts: readonly number[],
  now: number,
  policy: RateLimitPolicy,
): RateLimitDecision {
  if (!isPositiveInteger(policy.limit) || !isPositiveInteger(policy.windowMs) || !Number.isSafeInteger(now)) {
    return { ok: false, result: err('ERR_INPUT_INVALID'), retryAfterMs: 0, kept: attempts }
  }

  const kept = attempts.filter((instant) => Number.isSafeInteger(instant) && now - instant < policy.windowMs)
  if (kept.length < policy.limit) return { ok: true, kept }

  // Another one is allowed when fewer than `limit` remain in the window: when the
  // attempt holding place `limit` among the most recent leaves. With exactly `limit`
  // attempts that is the oldest. With more (only if the policy was lowered without
  // clearing the attempts) the surplus has to leave too, and the oldest would give
  // an instant that is too early.
  const ascending = [...kept].sort((a, b) => a - b)
  const leaving = ascending[kept.length - policy.limit]!
  return {
    ok: false,
    result: err('ERR_REGISTRATION_RATE_LIMITED'),
    retryAfterMs: leaving + policy.windowMs - now,
    kept,
  }
}

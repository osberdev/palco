import type { RateLimitPolicy } from '../domain/rate-limit'

/**
 * Registration attempts per IP address (RN-REG-07). Mutable state: it lives in
 * process memory and resets at startup (RNF-18). The domain does not import it;
 * the decision is `evaluateRateLimit`, and only the instants are stored here.
 */

/** RN-REG-07: 5 attempts in 15 minutes. */
export const REGISTRATION_LIMIT_DEFAULT: RateLimitPolicy = { limit: 5, windowMs: 900_000 }

const MAX_ATTEMPTS = 1000
const MAX_WINDOW_SECONDS = 86_400

let policy: RateLimitPolicy = REGISTRATION_LIMIT_DEFAULT
const attemptsByIp = new Map<string, readonly number[]>()

/** Sets the policy and clears the attempts. */
export function resetRegistrationAttempts(next: RateLimitPolicy = REGISTRATION_LIMIT_DEFAULT): void {
  policy = next
  attemptsByIp.clear()
}

export function registrationPolicy(): RateLimitPolicy {
  return policy
}

export function registrationAttemptsFrom(ip: string): readonly number[] {
  return attemptsByIp.get(ip) ?? []
}

/**
 * With `[]` it deletes the key: that way the map does not grow with IPs that no
 * longer have attempts in the window. Those that never come back keep their entry
 * until the next startup.
 */
export function storeRegistrationAttempts(ip: string, attempts: readonly number[]): void {
  if (attempts.length === 0) attemptsByIp.delete(ip)
  else attemptsByIp.set(ip, attempts)
}

export type RegistrationLimitRejection = 'type' | 'format' | 'out-of-range'

export type RegistrationLimit =
  | { readonly ok: true; readonly policy: RateLimitPolicy }
  | { readonly ok: false; readonly value: string; readonly reason: RegistrationLimitRejection }

/**
 * `attempts/seconds`, such as `5/900`. It is operator configuration, not UI text:
 * that is why it does not use `Result` or `MESSAGES`, like
 * `parseAvailabilityOverrides`. It takes `unknown` because Nuxt passes the
 * `NUXT_*` variables through `destr`, which turns `"5"` into the number 5. Not
 * trimmed: a space is a typo worth seeing in the log.
 */
export function parseRegistrationLimit(value: unknown): RegistrationLimit {
  if (value === undefined || value === '') return { ok: true, policy: REGISTRATION_LIMIT_DEFAULT }
  if (typeof value !== 'string') return { ok: false, value: String(value), reason: 'type' }

  const match = /^(\d+)\/(\d+)$/.exec(value)
  if (!match) return { ok: false, value, reason: 'format' }

  const limit = Number(match[1])
  const seconds = Number(match[2])
  if (limit < 1 || limit > MAX_ATTEMPTS || seconds < 1 || seconds > MAX_WINDOW_SECONDS) {
    return { ok: false, value, reason: 'out-of-range' }
  }
  return { ok: true, policy: { limit, windowMs: seconds * 1000 } }
}

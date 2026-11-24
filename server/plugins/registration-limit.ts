import {
  parseRegistrationLimit,
  REGISTRATION_LIMIT_DEFAULT,
  resetRegistrationAttempts,
} from '../data/registration-attempts'

/**
 * Configurable registration limit at startup (RN-REG-07). An invalid value never
 * stops the server: it logs a warning and starts with the rule, 5 attempts in 15
 * minutes.
 */
export default defineNitroPlugin(() => {
  const parsed = parseRegistrationLimit(useRuntimeConfig().registrationRateLimit)
  if (!parsed.ok) {
    console.warn(
      `[palco] NUXT_REGISTRATION_RATE_LIMIT ignorada: «${parsed.value}» (${parsed.reason}). Se arranca con 5/900.`,
    )
    resetRegistrationAttempts()
    return
  }

  resetRegistrationAttempts(parsed.policy)
  const { limit, windowMs } = parsed.policy
  if (limit !== REGISTRATION_LIMIT_DEFAULT.limit || windowMs !== REGISTRATION_LIMIT_DEFAULT.windowMs) {
    console.info(`[palco] Límite de registros: ${limit} intentos por IP cada ${windowMs / 1000} s`)
  }
})

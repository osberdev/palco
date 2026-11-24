import { describe, expect, it } from 'vitest'
import { evaluateRateLimit, type RateLimitPolicy } from '../server/domain/rate-limit'

// The sliding window of RN-REG-07. Each case carries its identifier in its name.

const P: RateLimitPolicy = { limit: 5, windowMs: 900_000 }
const T = 1_000_000

const before = (count: number): number[] => Array.from({ length: count }, (_, k) => T - count + k)

describe('evaluateRateLimit — RT1–RT10', () => {
  it('RT1 sin intentos', () => {
    expect(evaluateRateLimit([], T, P)).toEqual({ ok: true, kept: [] })
  })

  it('RT2 el quinto se admite', () => {
    const attempts = before(4)
    expect(evaluateRateLimit(attempts, T, P)).toEqual({ ok: true, kept: attempts })
  })

  it('RT3 el sexto se rechaza', () => {
    const decision = evaluateRateLimit(before(5), T, P)
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.result.code).toBe('ERR_REGISTRATION_RATE_LIMITED')
    expect(decision.retryAfterMs).toBe(899_995)
    expect(decision.kept).toEqual(before(5))
  })

  const fromT = [T, T + 1, T + 2, T + 3, T + 4]

  it('RT4 frontera, un milisegundo antes', () => {
    const decision = evaluateRateLimit(fromT, T + 900_000 - 1, P)
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.retryAfterMs).toBe(1)
  })

  it('RT5 frontera, en el instante exacto', () => {
    expect(evaluateRateLimit(fromT, T + 900_000, P)).toEqual({ ok: true, kept: fromT.slice(1) })
  })

  it('RT6 el orden de entrada no importa', () => {
    const shuffled = [T - 2, T - 5, T - 1, T - 4, T - 3]
    const decision = evaluateRateLimit(shuffled, T, P)
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.result.code).toBe('ERR_REGISTRATION_RATE_LIMITED')
    expect(decision.retryAfterMs).toBe(899_995)
  })

  it('RT7 las entradas no enteras se descartan', () => {
    const decision = evaluateRateLimit([...before(5), Number.NaN, 1.5, Number.POSITIVE_INFINITY], T, P)
    expect(decision).toEqual(evaluateRateLimit(before(5), T, P))
  })

  it('RT8 el reloj retrocedió: los instantes futuros cuentan', () => {
    const decision = evaluateRateLimit([T + 10, T + 11, T + 12, T + 13, T + 14], T, P)
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.result.code).toBe('ERR_REGISTRATION_RATE_LIMITED')
    expect(decision.retryAfterMs).toBe(900_010)
  })

  it.each([
    ['limit 0', { limit: 0, windowMs: 900_000 }],
    ['limit 1.5', { limit: 1.5, windowMs: 900_000 }],
    ['limit NaN', { limit: Number.NaN, windowMs: 900_000 }],
    ['windowMs 0', { limit: 5, windowMs: 0 }],
  ])('RT9 política inválida, %s', (_label, policy) => {
    const attempts = before(5)
    const decision = evaluateRateLimit(attempts, T, policy)
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.result.code).toBe('ERR_INPUT_INVALID')
    expect(decision.retryAfterMs).toBe(0)
    expect(decision.kept).toEqual(attempts)
  })

  it.each([Number.NaN, 1.5])('RT10 instante inválido, %s', (now) => {
    const decision = evaluateRateLimit([], now, P)
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.result.code).toBe('ERR_INPUT_INVALID')
  })
})

/** Every combination of `size` elements of `pool`, without repeating positions. */
function combinations(pool: readonly number[], size: number): number[][] {
  if (size === 0) return [[]]
  return pool.flatMap((value, index) =>
    combinations(pool.slice(index + 1), size - 1).map((rest) => [value, ...rest]))
}

describe('INV23 — el rechazo dice cuándo volver', () => {
  const universes: readonly (readonly [RateLimitPolicy, readonly number[], readonly number[]])[] = [
    // Instants around T: outside, on the boundary, inside and in the future.
    [P, [T - 900_001, T - 900_000, T - 899_999, T - 450_000, T - 1, T, T + 10, T + 900_000], [T - 1, T, T + 1, T + 899_999]],
    [{ limit: 2, windowMs: 10 }, [88, 90, 91, 95, 99, 100, 103, 110], [99, 100, 101, 105, 109]],
  ]

  it('OK si y solo si quedan menos de `limit` en la ventana; si rechaza, se admite justo en now + retryAfterMs', () => {
    let checked = 0
    for (const [policy, pool, nows] of universes) {
      for (let size = 0; size <= 6; size++) {
        for (const attempts of combinations(pool, size)) {
          for (const now of nows) {
            const inWindow = attempts.filter((t) => now - t < policy.windowMs).length
            const decision = evaluateRateLimit(attempts, now, policy)
            const label = `${JSON.stringify(policy)} ${JSON.stringify(attempts)} @${now}`
            expect(decision.ok, label).toBe(inWindow < policy.limit)
            if (!decision.ok) {
              expect(decision.retryAfterMs, label).toBeGreaterThanOrEqual(1)
              expect(evaluateRateLimit(attempts, now + decision.retryAfterMs - 1, policy).ok, label).toBe(false)
              expect(evaluateRateLimit(attempts, now + decision.retryAfterMs, policy).ok, label).toBe(true)
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })
})

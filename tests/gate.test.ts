import { describe, expect, it } from 'vitest'
import { GATE_PIN_LIMIT, evaluateGatePinLimit } from '../server/domain/gate'
import { gateConfigFrom, gatePinMatches, gatePinWarning, parseGatePin } from '../server/utils/gate-config'

// The gate: the NUXT_GATE_PIN PIN and the failed attempt limit of RN-ACC-02. Each
// case carries its identifier in its name.

const T = 1_000_000

describe('la clave de taquilla', () => {
  it('GT1: ausente, válida en sus fronteras e inválida fuera de la regla', () => {
    expect(parseGatePin(undefined)).toEqual({ kind: 'absent' })
    expect(parseGatePin('')).toEqual({ kind: 'absent' })
    for (const pin of ['123456', 'Ab#9-x', 'x'.repeat(64), '!~'.repeat(3)]) {
      expect(parseGatePin(pin), pin).toEqual({ kind: 'ok', pin })
    }
    for (const pin of ['12345', 'x'.repeat(65), '123 456', ' 123456', '123456\n', 'piñata99', '12\t3456']) {
      expect(parseGatePin(pin), JSON.stringify(pin)).toEqual({ kind: 'invalid' })
    }
  })

  it('GT2: se compara completa; un prefijo o una mayúscula no la abren', () => {
    const config = gateConfigFrom('Taquilla-2026')
    expect(gatePinMatches('Taquilla-2026', config)).toBe(true)
    for (const other of ['Taquilla-202', 'taquilla-2026', 'Taquilla-20266', '']) {
      expect(gatePinMatches(other, config), other).toBe(false)
    }
  })

  it('GT3: la marca de la cookie es fija para una clave, cambia con otra y no contiene la clave', () => {
    const config = gateConfigFrom('Taquilla-2026')
    expect(gateConfigFrom('Taquilla-2026').tag).toBe(config.tag)
    expect(gateConfigFrom('Taquilla-2027').tag).not.toBe(config.tag)
    expect(config.tag).toMatch(/^[0-9a-f]{16}$/)
    expect(config.digest.toString('utf8')).not.toContain('Taquilla')
  })

  it('GT4: las advertencias nombran la variable y no llevan valor', () => {
    expect(gatePinWarning('absent')).toBe('[palco] Taquilla no disponible: falta NUXT_GATE_PIN.')
    expect(gatePinWarning('invalid')).toContain('NUXT_GATE_PIN debe tener de 6 a 64 caracteres')
  })
})

describe('RN-ACC-02 · intentos fallidos de clave', () => {
  it('GL1: cuatro fallos en la ventana admiten un intento más; cinco lo rechazan con su código', () => {
    const four = [T - 4, T - 3, T - 2, T - 1]
    expect(evaluateGatePinLimit(four, T)).toEqual({ ok: true, kept: four })

    const five = [T - 5, ...four]
    const decision = evaluateGatePinLimit(five, T)
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.result.code).toBe('ERR_GATE_RATE_LIMITED')
      expect(decision.result.message).toBe('Demasiados intentos de clave. Espera unos minutos e inténtalo de nuevo')
      expect(decision.retryAfterMs).toBe(GATE_PIN_LIMIT.windowMs - 5)
    }
  })

  it('GL2: la ventana es de 15 minutos, abierta en su extremo antiguo, como RN-REG-07', () => {
    const five = [T, T + 1, T + 2, T + 3, T + 4]
    expect(evaluateGatePinLimit(five, T + 900_000 - 1).ok).toBe(false)
    const after = evaluateGatePinLimit(five, T + 900_000)
    expect(after.ok).toBe(true)
    expect(after.kept).toEqual([T + 1, T + 2, T + 3, T + 4])
  })
})

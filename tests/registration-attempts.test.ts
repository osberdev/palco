import { beforeEach, describe, expect, it } from 'vitest'
import {
  parseRegistrationLimit,
  REGISTRATION_LIMIT_DEFAULT,
  registrationAttemptsFrom,
  registrationPolicy,
  resetRegistrationAttempts,
  storeRegistrationAttempts,
} from '../server/data/registration-attempts'

// The per-IP registration attempts store and its startup configuration
// (RN-REG-07). Each case carries its identifier in its name.

describe('almacén de intentos', () => {
  beforeEach(() => {
    resetRegistrationAttempts()
  })

  it('RA1: la política por omisión es 5 intentos en 15 minutos', () => {
    expect(REGISTRATION_LIMIT_DEFAULT).toEqual({ limit: 5, windowMs: 900_000 })
    expect(registrationPolicy()).toEqual(REGISTRATION_LIMIT_DEFAULT)
  })

  it('RA2: reset vacía los intentos y fija la política', () => {
    storeRegistrationAttempts('127.0.0.1', [1, 2])
    resetRegistrationAttempts({ limit: 2, windowMs: 10_000 })
    expect(registrationAttemptsFrom('127.0.0.1')).toEqual([])
    expect(registrationPolicy()).toEqual({ limit: 2, windowMs: 10_000 })
  })

  it('RA3: guardar [] borra la clave', () => {
    storeRegistrationAttempts('127.0.0.1', [1])
    storeRegistrationAttempts('127.0.0.1', [])
    expect(registrationAttemptsFrom('127.0.0.1')).toEqual([])
  })

  it('RA4: dos IP no comparten intentos', () => {
    storeRegistrationAttempts('127.0.0.1', [1, 2])
    storeRegistrationAttempts('::1', [3])
    expect(registrationAttemptsFrom('127.0.0.1')).toEqual([1, 2])
    expect(registrationAttemptsFrom('::1')).toEqual([3])
    expect(registrationAttemptsFrom('10.0.0.1')).toEqual([])
  })
})

describe('parseRegistrationLimit', () => {
  it.each([
    ['RX1', ''],
    ['RX2', undefined],
  ])('%s: %j da la omisión', (_id, value) => {
    expect(parseRegistrationLimit(value)).toEqual({ ok: true, policy: REGISTRATION_LIMIT_DEFAULT })
  })

  it.each([
    ['RX3', '5/900', { limit: 5, windowMs: 900_000 }],
    ['RX4', '2/10', { limit: 2, windowMs: 10_000 }],
    // The ends of the ranges are accepted.
    ['RX8', '1/1', { limit: 1, windowMs: 1_000 }],
    ['RX8', '1000/86400', { limit: 1000, windowMs: 86_400_000 }],
  ])('%s: %s', (_id, value, policy) => {
    expect(parseRegistrationLimit(value)).toEqual({ ok: true, policy })
  })

  it.each(['0/10', '5/0', '1001/10', '5/86401'])('RX5: %s fuera de rango', (value) => {
    expect(parseRegistrationLimit(value)).toEqual({ ok: false, value, reason: 'out-of-range' })
  })

  it.each(['abc', ' 5/900', '5/900/1', '5.5/900'])('RX6: %j no tiene el formato', (value) => {
    expect(parseRegistrationLimit(value)).toEqual({ ok: false, value, reason: 'format' })
  })

  it('RX7: el número 5, como lo deja destr, no es texto', () => {
    expect(parseRegistrationLimit(5)).toEqual({ ok: false, value: '5', reason: 'type' })
  })
})

import { describe, expect, it } from 'vitest'
import { serverErrorExpires } from '../utils/server-field-errors'

// Which change expires a server message. Each case carries its identifier in its name.

describe('serverErrorExpires — SE1–SE8', () => {
  it.each([
    // A change to the field itself: it expires, with any code.
    ['SE1', 'quantity', 'ERR_EXCEEDS_USER_LIMIT', 'quantity', true],
    ['SE2', 'quantity', 'ERR_EXCEEDS_AVAILABILITY', 'quantity', true],
    ['SE3', 'date', 'ERR_DATE_PAST', 'date', true],
    // The cumulative limit depends on the date (RN-CAN-07): it expires with it.
    ['SE4', 'quantity', 'ERR_EXCEEDS_USER_LIMIT', 'date', true],
    // Availability does not depend on the date: the general rule applies.
    ['SE5', 'quantity', 'ERR_EXCEEDS_AVAILABILITY', 'date', false],
    // Another field, or the date over another field: it does not expire.
    ['SE6', 'quantity', 'ERR_EXCEEDS_USER_LIMIT', 'time', false],
    ['SE7', 'play', 'ERR_EXCEEDS_USER_LIMIT', 'date', false],
    ['SE8', 'quantity', null, 'date', false],
  ] as const)('%s error en %s con %s, cambia %s → %s', (_id, errorField, code, changedField, expected) => {
    expect(serverErrorExpires(errorField, code, changedField)).toBe(expected)
  })
})

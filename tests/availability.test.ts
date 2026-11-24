import { describe, expect, it } from 'vitest'
import { parseAvailabilityOverrides } from '../server/data/availability'
import { VENUES } from '../server/data/catalog'

// The initial availability override. Availability is computed from the database,
// and C1 covers the concurrent case. Each case carries its identifier in its name.

describe('parseAvailabilityOverrides', () => {
  it.each([
    ['AV9', ''],
    ['AV9', '   '],
  ])('%s: %j → mapa vacío', (_, text) => {
    expect(parseAvailabilityOverrides(text, VENUES)).toEqual({ ok: true, overrides: new Map() })
  })

  it.each([
    ['AV10', 'teatro-scala=5,mna=0'],
    ['AV11', ' teatro-scala=5 , mna=0 '],
  ])('%s: %j → Scala 5 y MNA 0', (_, text) => {
    expect(parseAvailabilityOverrides(text, VENUES)).toEqual({
      ok: true,
      overrides: new Map([['teatro-scala', 5], ['mna', 0]]),
    })
  })

  it.each([
    ['AV12', 'teatro-scala=5,', '', 'format'],
    ['AV13', 'teatro-scala:5', 'teatro-scala:5', 'format'],
    ['AV14', 'teatro-scala=-1', 'teatro-scala=-1', 'format'],
    ['AV15', 'teatro-scala=2.5', 'teatro-scala=2.5', 'format'],
    ['AV16', 'opera=5', 'opera=5', 'unknown-venue'],
    ['AV17', 'teatro-scala=2031', 'teatro-scala=2031', 'out-of-range'],
    ['AV19', 'teatro-scala=5,teatro-scala=6', 'teatro-scala=6', 'duplicate'],
  ])('%s: %j → %j, %s', (_, text, entry, reason) => {
    expect(parseAvailabilityOverrides(text, VENUES)).toEqual({ ok: false, entry, reason })
  })

  it('AV18: el aforo exacto se acepta (frontera)', () => {
    expect(parseAvailabilityOverrides('teatro-scala=2030', VENUES)).toEqual({
      ok: true,
      overrides: new Map([['teatro-scala', 2030]]),
    })
  })
})

import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import type { VenueBase } from '../types'
import { closedDaysNote } from '../utils/schedule'

function venue(id: string): VenueBase {
  const found = VENUES.find((v) => v.id === id)
  if (!found) throw new Error(`Recinto inexistente: ${id}`)
  return found
}

// Base for the synthetic venues: the MNA, without a weekly closing day or exceptions.
const BLANK: VenueBase = { ...venue('mna'), closedWeekdays: [], exceptions: [] }

describe('closedDaysNote', () => {
  it.each([
    ['CN1', 'teatro-colon', 'cerrado los domingos y en festivos'],
    ['CN2', 'teatro-scala', 'cerrado los domingos y en festivos'],
    ['CN3', 'teatro-metropolitan', 'cerrado en festivos'],
    ['CN4', 'cinemark', null],
    ['CN5', 'cinepolis', null],
    ['CN6', 'cinemex', null],
    ['CN7', 'amc', null],
    ['CN8', 'louvre', 'cerrado los martes'],
    ['CN9', 'met', 'cerrado los miércoles'],
    ['CN10', 'vaticanos', 'cerrado los domingos, salvo el último del mes'],
    ['CN11', 'mna', 'cerrado los lunes'],
    ['CN12', 'mnac', 'cerrado los lunes, salvo festivos'],
  ])('%s %s → %s', (_id, id, note) => {
    expect(closedDaysNote(venue(id))).toBe(note)
  })

  it('CN13 sintético S-B: CLOSES_ON_HOLIDAY prevalece sobre OPENS_ON_HOLIDAY', () => {
    const syntheticB: VenueBase = {
      ...BLANK,
      jurisdiction: 'ES',
      closedWeekdays: [1],
      exceptions: ['OPENS_ON_HOLIDAY', 'CLOSES_ON_HOLIDAY'],
    }
    expect(closedDaysNote(syntheticB)).toBe('cerrado los lunes y en festivos')
  })

  it('CN14 sintético: dos días de cierre', () => {
    expect(closedDaysNote({ ...BLANK, closedWeekdays: [2, 1] })).toBe('cerrado los lunes y martes')
  })
})

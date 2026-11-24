import type { VenueBase, Weekday } from '../types'

/** Plural, indexed by `Weekday`: 0 = Sunday. */
const WEEKDAY_PLURALS: Readonly<Record<Weekday, string>> = {
  0: 'domingos',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábados',
}

/** "a", "a y b", "a, b y c". */
function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

/**
 * The closing note in the date hint: "cerrado los martes". It announces the closure
 * before the error (RNF-12). It reads the venue's policies rather than its category,
 * like the rules in `calendar.ts`.
 *
 * It does not mention annual closures: the list would be long, and if one of those
 * dates is chosen, the date error already explains it.
 */
export function closedDaysNote(venue: VenueBase): string | null {
  const closesOnHoliday = venue.exceptions.includes('CLOSES_ON_HOLIDAY')
  const parts: string[] = []

  if (venue.closedWeekdays.length > 0) {
    const days = [...venue.closedWeekdays].sort((a, b) => a - b).map((day) =>
      day === 0 && venue.exceptions.includes('OPENS_LAST_SUNDAY')
        ? `${WEEKDAY_PLURALS[day]}, salvo el último del mes`
        : WEEKDAY_PLURALS[day],
    )
    // `CLOSES_ON_HOLIDAY` takes precedence over `OPENS_ON_HOLIDAY`.
    const opensOnHoliday = venue.exceptions.includes('OPENS_ON_HOLIDAY') && !closesOnHoliday
    parts.push(`los ${joinSpanish(days)}${opensOnHoliday ? ', salvo festivos' : ''}`)
  }

  if (closesOnHoliday) parts.push('en festivos')

  return parts.length > 0 ? `cerrado ${parts.join(' y ')}` : null
}

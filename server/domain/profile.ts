import type { CalendarDate } from '../../types'
import { compareDates, isValidDate } from './calendar'
import { resolveYear, validateUsername } from './curp'
import { accept, err, reject, type Checked } from './result'

/**
 * The birth date of an already formed CURP (RF-PER-03). Only derived from a CURP
 * that `validateUsername` accepts: that guarantees the date exists and the century
 * is the one the homoclave sets, without repeating the century rule here.
 */
export function birthDateFromCurp(curp: string): Checked<CalendarDate> {
  const result = validateUsername(curp)
  if (!result.ok) return reject(result)

  return accept({
    year: resolveYear(Number(curp.slice(4, 6)), curp[16]!),
    month: Number(curp.slice(6, 8)),
    day: Number(curp.slice(8, 10)),
  })
}

/**
 * Completed years on `today`. The age goes up when today's (month, day) reaches,
 * in lexicographic order, the birth (month, day). Someone born on February 29
 * turns a year older on March 1 in non-leap years without a branch of its own:
 * 02/28 sorts before 02/29 and 03/01 after it.
 */
export function ageOn(birth: CalendarDate, today: CalendarDate): Checked<number> {
  if (!isValidDate(birth) || !isValidDate(today)) return reject(err('ERR_DATE_INVALID'))
  // Unreachable from a seeded CURP; registration covers it with RN-REG-04.
  if (compareDates(birth, today) > 0) return reject(err('ERR_INPUT_INVALID'))

  const birthdayReached = today.month > birth.month
    || (today.month === birth.month && today.day >= birth.day)
  return accept(today.year - birth.year - (birthdayReached ? 0 : 1))
}

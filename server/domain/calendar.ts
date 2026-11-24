import type {
  AnnualClosure,
  CalendarDate,
  ExceptionPolicy,
  Jurisdiction,
  OpeningHours,
  TimeOfDay,
  VenueBase,
  Weekday,
} from '../../types'
import { HOLIDAYS } from '../data/holidays'
import { err, ok, type Result } from './result'

// The whole module uses integer arithmetic and avoids JavaScript's native date
// object, which depends on the process time zone.

const SUNDAY: Weekday = 0
const WEDNESDAY: Weekday = 3
const FRIDAY: Weekday = 5
const SATURDAY: Weekday = 6

const SUMMER_FIRST_MONTH = 5
const SUMMER_LAST_MONTH = 9

const DAYS_PER_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Each month's offset in Sakamoto's algorithm. */
const SAKAMOTO_OFFSETS: readonly number[] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]

/** The full Gregorian rule: divisible by 400 yes, by 100 no, by 4 yes. */
export function isLeapYear(year: number): boolean {
  if (year % 400 === 0) return true
  if (year % 100 === 0) return false
  return year % 4 === 0
}

/** 0 for a month outside 1–12. */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0
  if (month === 2 && isLeapYear(year)) return 29
  return DAYS_PER_MONTH[month - 1]!
}

/** The fields must be integers because `number` admits fractions and NaN. */
export function isValidDate(date: CalendarDate): boolean {
  const { year, month, day } = date
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (year < 1) return false
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

/**
 * Sakamoto. Precondition: a valid date. With year ≥ 1 the adjusted year is never
 * negative, so Math.floor matches integer division.
 */
export function dayOfWeek(date: CalendarDate): Weekday {
  const y = date.year - (date.month < 3 ? 1 : 0)
  const index =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + SAKAMOTO_OFFSETS[date.month - 1]! + date.day) % 7
  return index as Weekday
}

export function compareDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1
  if (a.month !== b.month) return a.month < b.month ? -1 : 1
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  return 0
}

/** If one week later no longer fits in the month, there is no later Sunday. */
export function isLastSundayOfMonth(date: CalendarDate): boolean {
  if (!isValidDate(date)) return false
  if (dayOfWeek(date) !== SUNDAY) return false
  return date.day + 7 > daysInMonth(date.year, date.month)
}

function matchesDayAndMonth(dates: readonly AnnualClosure[], date: CalendarDate): boolean {
  return dates.some((entry) => entry.day === date.day && entry.month === date.month)
}

export function isHoliday(date: CalendarDate, jurisdiction: Jurisdiction): boolean {
  return matchesDayAndMonth(HOLIDAYS[jurisdiction], date)
}

/**
 * Different from `isHoliday`: the Louvre closes on January 1 but opens on July 14,
 * a national holiday. Treating them as one set would close the venue on dates it
 * actually opens.
 */
function isAnnualClosure(venue: VenueBase, date: CalendarDate): boolean {
  return matchesDayAndMonth(venue.annualClosures, date)
}

/**
 * Fixed priority, the first one that applies wins (RN-APE-12). Sunday or holiday
 * comes first because at the MNAC it overrides the season: a summer Sunday closes
 * at 15:00, not 20:00. Precondition: a valid date.
 */
export function applicableHours(venue: VenueBase, date: CalendarDate): OpeningHours {
  const weekday = dayOfWeek(date)
  const has = (policy: ExceptionPolicy): boolean => venue.exceptions.includes(policy)

  if (has('SUNDAY_HOLIDAY_HOURS') && (weekday === SUNDAY || isHoliday(date, venue.jurisdiction))) {
    return venue.sundayHours
  }
  if (has('SEASONAL_HOURS') && date.month >= SUMMER_FIRST_MONTH && date.month <= SUMMER_LAST_MONTH) {
    return venue.alternateHours
  }
  if (has('WEEKEND_HOURS') && (weekday === FRIDAY || weekday === SATURDAY)) {
    return venue.alternateHours
  }
  if (has('NIGHT_HOURS') && (weekday === WEDNESDAY || weekday === FRIDAY)) {
    return venue.alternateHours
  }
  return venue.hours
}

/**
 * Fixed order (RN-APE-11). The annual closure comes before any exception, and a
 * declared holiday before the weekly closing day: a holiday on a theater's closing
 * day is reported as a holiday, not as a non-working day.
 */
export function evaluateOpeningDay(venue: VenueBase, date: CalendarDate): Result {
  if (!isValidDate(date)) return err('ERR_DATE_INVALID')

  if (isAnnualClosure(venue, date)) return err('ERR_DAY_HOLIDAY')

  const holiday = isHoliday(date, venue.jurisdiction)
  if (holiday && venue.exceptions.includes('CLOSES_ON_HOLIDAY')) return err('ERR_DAY_HOLIDAY')

  const weekday = dayOfWeek(date)
  if (venue.closedWeekdays.includes(weekday)) {
    if (venue.exceptions.includes('OPENS_LAST_SUNDAY') && weekday === SUNDAY && isLastSundayOfMonth(date)) {
      return ok()
    }
    if (venue.exceptions.includes('OPENS_ON_HOLIDAY') && holiday) return ok()
    return err('ERR_DAY_CLOSED')
  }

  return ok()
}

function isValidTime(time: TimeOfDay): boolean {
  const { hour, minute } = time
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function toMinutes(time: TimeOfDay): number {
  return time.hour * 60 + time.minute
}

/**
 * A single integer of minutes since midnight is compared, which avoids the bugs of
 * comparing hour and minute separately. The interval is closed, so the exact
 * closing time is accepted (RN-APE-08).
 */
export function evaluateOpeningHours(venue: VenueBase, date: CalendarDate, time: TimeOfDay): Result {
  if (!isValidDate(date)) return err('ERR_DATE_INVALID')
  if (!isValidTime(time)) return err('ERR_INPUT_INVALID')

  const hours = applicableHours(venue, date)
  const minutes = toMinutes(time)
  if (minutes < toMinutes(hours.open) || minutes > toMinutes(hours.close)) return err('ERR_OUTSIDE_HOURS')

  return ok()
}

/**
 * Date and time arrive separately because they are independent rejection axes:
 * non-working day and outside hours. Merging them would make it impossible to
 * vary one while holding the other. Only dates are compared against `today`: the
 * same day at a time that has already passed is accepted, because RN-APE-09 is
 * about dates.
 */
export function evaluateOpening(
  venue: VenueBase,
  eventDate: CalendarDate,
  time: TimeOfDay,
  today: CalendarDate,
): Result {
  if (!isValidDate(eventDate)) return err('ERR_DATE_INVALID')
  if (!isValidDate(today)) return err('ERR_DATE_INVALID')
  if (compareDates(eventDate, today) < 0) return err('ERR_DATE_PAST')

  const day = evaluateOpeningDay(venue, eventDate)
  if (!day.ok) return day

  return evaluateOpeningHours(venue, eventDate, time)
}

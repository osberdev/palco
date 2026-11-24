import type { CalendarDate } from '../types'

/**
 * The only conversion from `Date`, and only the page calls it: the domain uses
 * integer arithmetic and knows nothing about time zones. Local year, month and day,
 * because "today" is the buyer's calendar day.
 */
export function toCalendarDate(value: Date): CalendarDate {
  return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }
}

/**
 * `2026-10-13`: the ISO date the `date` columns expect. The repository requires
 * this form, because PostgreSQL interprets others according to `DateStyle`.
 */
export function formatIsoDate(date: CalendarDate): string {
  const pad = (value: number, width: number): string => String(value).padStart(width, '0')
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`
}

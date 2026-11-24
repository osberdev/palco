import { dayOfWeek } from '../server/domain/calendar'
import type { CalendarDate, Cents, Currency, TimeOfDay, Weekday } from '../types'

// Mexican Spanish: comma as thousands separator.
const countFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

/**
 * Minor unit digits of each currency. All four have two, and `formatMoney`
 * assumes it: a currency without decimals, such as the yen, would require changing
 * it (MN2).
 */
export const CURRENCY_MINOR_DIGITS: Readonly<Record<Currency, 2>> = {
  ARS: 2,
  EUR: 2,
  MXN: 2,
  USD: 2,
}

/**
 * ISO code before the figure and no conversion (RF-CAT-03, RF-CAT-04). It is the
 * only place where an amount goes back to units, in integer arithmetic: units and
 * cents come from the quotient and remainder by 100, with a decimal point, without
 * floating-point division.
 */
export function formatMoney(amount: Cents, currency: Currency): string {
  const minor = amount % 100
  const units = (amount - minor) / 100
  return `${currency} ${countFormatter.format(units)}.${String(minor).padStart(2, '0')}`
}

export function formatCount(value: number): string {
  return countFormatter.format(value)
}

/** Abbreviated months in lowercase. */
const MONTH_ABBREVIATIONS: readonly string[] = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** HH:MM with leading zeros. */
export function formatClock(time: TimeOfDay): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
}

/** '4 ene 2027, 15:00'. */
export function formatEventDate(date: CalendarDate, time: TimeOfDay): string {
  return `${date.day} ${MONTH_ABBREVIATIONS[date.month - 1]} ${date.year}, ${formatClock(time)}`
}

/** '3 oct 2026', as in "Compra realizada el". */
export function formatCalendarDate(date: CalendarDate): string {
  return `${date.day} ${MONTH_ABBREVIATIONS[date.month - 1]} ${date.year}`
}

const WEEKDAY_NAMES: Readonly<Record<Weekday, string>> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}

/**
 * 'Sábado', under the event date. The domain computes the day in integer
 * arithmetic: `Date` would depend on the time zone.
 */
export function formatWeekday(date: CalendarDate): string {
  return WEEKDAY_NAMES[dayOfWeek(date)]
}

const MONTH_NAMES: readonly string[] = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** '15 de marzo de 2003', the profile's birth date. */
export function formatLongDate(date: CalendarDate): string {
  return `${date.day} de ${MONTH_NAMES[date.month - 1]} de ${date.year}`
}

/** '1 año' or 'N años', the profile's age. */
export function formatAge(years: number): string {
  return years === 1 ? '1 año' : `${years} años`
}

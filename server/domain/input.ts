import type { CalendarDate, TimeOfDay } from '../../types'
import { isValidDate } from './calendar'
import { accept, err, reject, type Checked } from './result'

// Date and time parsing is strict: no trailing residue (`25/12/2026abc`) and no
// years of arbitrary length. The year requires four digits because the message
// announces AAAA; the minute requires two, because `HH:MM` announces them and
// `19:5` is ambiguous at a glance.
const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/
// The sign is part of the integer, so rejecting `-3` is the quantity rule's job,
// not the parser's.
const INTEGER_PATTERN = /^[+-]?\d+$/

const LAST_HOUR = 23
const LAST_MINUTE = 59

export function parseDate(text: string): Checked<CalendarDate> {
  const match = DATE_PATTERN.exec(text.trim())
  if (!match) return reject(err('ERR_DATE_FORMAT'))

  const date: CalendarDate = { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) }
  if (!isValidDate(date)) return reject(err('ERR_DATE_INVALID'))
  return accept(date)
}

export function parseTime(text: string): Checked<TimeOfDay> {
  const match = TIME_PATTERN.exec(text.trim())
  if (!match) return reject(err('ERR_TIME_FORMAT'))

  const time: TimeOfDay = { hour: Number(match[1]), minute: Number(match[2]) }
  if (time.hour > LAST_HOUR || time.minute > LAST_MINUTE) return reject(err('ERR_TIME_OUT_OF_RANGE'))
  return accept(time)
}

/** The safe integer guard: beyond 2^53 a `Number` no longer represents the typed value. */
export function parseInteger(text: string): Checked<number> {
  const trimmed = text.trim()
  if (!INTEGER_PATTERN.test(trimmed)) return reject(err('ERR_INTEGER_EXPECTED'))

  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return reject(err('ERR_INTEGER_EXPECTED'))
  return accept(value)
}

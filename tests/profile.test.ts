import { describe, expect, it } from 'vitest'
import { daysInMonth, isLeapYear } from '../server/domain/calendar'
import { ageOn, birthDateFromCurp } from '../server/domain/profile'
import type { CalendarDate } from '../types'

const date = (year: number, month: number, day: number): CalendarDate => ({ year, month, day })

function nextDay(d: CalendarDate): CalendarDate {
  if (d.day < daysInMonth(d.year, d.month)) return date(d.year, d.month, d.day + 1)
  if (d.month < 12) return date(d.year, d.month + 1, 1)
  return date(d.year + 1, 1, 1)
}

function daysBetween(from: CalendarDate, to: CalendarDate, step: number): CalendarDate[] {
  const days: CalendarDate[] = []
  let current = from
  let index = 0
  while (current.year < to.year || (current.year === to.year && (current.month < to.month || (current.month === to.month && current.day <= to.day)))) {
    if (index % step === 0) days.push(current)
    current = nextDay(current)
    index++
  }
  return days
}

describe('birthDateFromCurp', () => {
  it.each([
    ['BD1', 'RIVA030315MJCSLNA2JC', date(2003, 3, 15)],
    ['BD2', 'TENB010908HCMLVRA6CM', date(2001, 9, 8)],
    ['BD3', 'IASC951122MQTBLR02QT', date(1995, 11, 22)],
    ['BD4', 'MEXD980704HNLNXG10NL', date(1998, 7, 4)],
    ['BD5', 'ABCD000229HDFXXXA8DF', date(2000, 2, 29)],
    ['BD6', 'PEMR080229MJCRRSA5JC', date(2008, 2, 29)],
  ])('%s: %s → %j', (_id, curp, expected) => {
    expect(birthDateFromCurp(curp)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['BD7', 'RIVB030315MJCSLNA2JC', 'ERR_CURP_CHECKSUM'],
    ['BD8', '', 'ERR_USERNAME_EMPTY'],
  ])('%s: %j → %s', (_id, curp, code) => {
    const result = birthDateFromCurp(curp)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.result.code).toBe(code)
  })
})

describe('ageOn', () => {
  it.each([
    ['AG1', date(2003, 3, 15), date(2026, 10, 13), 23],
    ['AG2', date(2003, 3, 15), date(2026, 3, 15), 23],
    ['AG3', date(2003, 3, 15), date(2026, 3, 14), 22],
    ['AG4', date(2008, 2, 29), date(2026, 2, 28), 17],
    ['AG5', date(2008, 2, 29), date(2026, 3, 1), 18],
    ['AG6', date(2008, 2, 29), date(2028, 2, 28), 19],
    ['AG7', date(2008, 2, 29), date(2028, 2, 29), 20],
    ['AG8', date(1999, 12, 31), date(2026, 12, 31), 27],
    ['AG9', date(1999, 12, 31), date(2026, 12, 30), 26],
    ['AG10', date(2026, 10, 13), date(2026, 10, 13), 0],
    ['AG14', date(1900, 3, 1), date(2026, 10, 13), 126],
  ])('%s: %j en %j → %d', (_id, birth, today, expected) => {
    expect(ageOn(birth, today)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['AG11', date(2026, 10, 14), date(2026, 10, 13), 'ERR_INPUT_INVALID'],
    ['AG12', date(2026, 2, 30), date(2026, 10, 13), 'ERR_DATE_INVALID'],
    ['AG13', date(2003, 3, 15), date(2026, 13, 1), 'ERR_DATE_INVALID'],
  ])('%s: %j en %j → %s', (_id, birth, today, code) => {
    const result = ageOn(birth, today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.result.code).toBe(code)
  })

  it('INV16: la edad nunca baja y sube una vez por año, en el cumpleaños o el 01/03', () => {
    // A 7-day step: it goes through every month and weekday; the February 29ths in the
    // interval are added separately because the step could skip them.
    const births = daysBetween(date(1990, 1, 1), date(2012, 12, 31), 7)
    for (const year of [1992, 1996, 2000, 2004, 2008, 2012]) births.push(date(year, 2, 29))
    const days = daysBetween(date(2026, 1, 1), date(2028, 12, 31), 1)

    let violations = 0
    for (const birth of births) {
      const increments = new Map<number, number>()
      let previous: number | null = null
      for (const today of days) {
        const result = ageOn(birth, today)
        if (!result.ok) {
          violations++
          continue
        }
        if (previous !== null) {
          const delta = result.value - previous
          const isBirthday = today.month === birth.month && today.day === birth.day
          const isLeapdayStandIn = birth.month === 2 && birth.day === 29
            && !isLeapYear(today.year) && today.month === 3 && today.day === 1
          if (delta < 0 || delta > 1) violations++
          if (delta === 1) {
            if (!isBirthday && !isLeapdayStandIn) violations++
            increments.set(today.year, (increments.get(today.year) ?? 0) + 1)
          }
        }
        previous = result.value
      }
      // 2026 starts on January 1: a birthday on that day does not show up as an increase.
      const expectedYears = birth.month === 1 && birth.day === 1 ? [2027, 2028] : [2026, 2027, 2028]
      for (const year of expectedYears) if (increments.get(year) !== 1) violations++
    }
    expect(violations).toBe(0)
  })
})

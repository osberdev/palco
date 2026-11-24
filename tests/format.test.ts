import { describe, expect, it } from 'vitest'
import { formatIsoDate } from '../utils/date'
import { cents } from '../server/domain/money'
import { formatAge, formatCalendarDate, formatClock, formatCount, formatEventDate, formatLongDate, formatMoney, formatWeekday } from '../utils/format'

describe('formatMoney', () => {
  it.each([
    [800000, 'ARS', 'ARS 8,000.00'],
    [3500, 'EUR', 'EUR 35.00'],
    [50, 'USD', 'USD 0.50'],
    [123456789, 'MXN', 'MXN 1,234,567.89'],
  ] as const)('%d %s → %s', (amount, currency, expected) => {
    expect(formatMoney(cents(amount), currency)).toBe(expected)
  })
})

describe('formatCount', () => {
  it.each([
    [2030, '2,030'],
    [30000, '30,000'],
    [999, '999'],
  ])('%d → %s', (value, expected) => {
    expect(formatCount(value)).toBe(expected)
  })
})

describe('formatClock', () => {
  it.each([
    [{ hour: 9, minute: 5 }, '09:05'],
    [{ hour: 0, minute: 0 }, '00:00'],
    [{ hour: 23, minute: 59 }, '23:59'],
  ])('%j → %s', (time, expected) => {
    expect(formatClock(time)).toBe(expected)
  })
})

describe('formatEventDate', () => {
  it.each([
    [{ year: 2027, month: 1, day: 4 }, { hour: 15, minute: 0 }, '4 ene 2027, 15:00'],
    [{ year: 2026, month: 12, day: 25 }, { hour: 9, minute: 5 }, '25 dic 2026, 09:05'],
    [{ year: 2027, month: 5, day: 25 }, { hour: 20, minute: 0 }, '25 may 2027, 20:00'],
  ])('%j %j → %s', (date, time, expected) => {
    expect(formatEventDate(date, time)).toBe(expected)
  })
})

describe('formatCalendarDate', () => {
  it('FM1: 3 oct 2026', () => {
    expect(formatCalendarDate({ year: 2026, month: 10, day: 3 })).toBe('3 oct 2026')
  })
})

describe('formatWeekday', () => {
  it.each([
    [17, 'Sábado'],
    [15, 'Jueves'],
    [16, 'Viernes'],
  ])('FM2: %d oct 2026 → %s', (day, expected) => {
    expect(formatWeekday({ year: 2026, month: 10, day })).toBe(expected)
  })
})

describe('formatLongDate', () => {
  it.each([
    [{ year: 2003, month: 3, day: 15 }, '15 de marzo de 2003'],
    [{ year: 2001, month: 9, day: 8 }, '8 de septiembre de 2001'],
    [{ year: 2000, month: 2, day: 29 }, '29 de febrero de 2000'],
  ])('FM3: %j → %s', (date, expected) => {
    expect(formatLongDate(date)).toBe(expected)
  })
})

describe('formatAge', () => {
  it.each([
    [0, '0 años'],
    [1, '1 año'],
    [23, '23 años'],
  ])('FM4: %d → %s', (years, expected) => {
    expect(formatAge(years)).toBe(expected)
  })
})

describe('formatIsoDate', () => {
  it('FM5: mes y día de un dígito llevan cero', () => {
    expect(formatIsoDate({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07')
    expect(formatIsoDate({ year: 2026, month: 10, day: 13 })).toBe('2026-10-13')
  })

  it('FM6: el año siempre con cuatro dígitos', () => {
    expect(formatIsoDate({ year: 999, month: 12, day: 31 })).toBe('0999-12-31')
  })
})

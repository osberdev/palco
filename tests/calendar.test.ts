import { describe, expect, it } from 'vitest'
import { HOLIDAYS } from '../server/data/holidays'
import { VENUES } from '../server/data/catalog'
import {
  applicableHours,
  compareDates,
  dayOfWeek,
  daysInMonth,
  evaluateOpening,
  evaluateOpeningHours,
  isHoliday,
  isLastSundayOfMonth,
  isLeapYear,
  isValidDate,
} from '../server/domain/calendar'
import type { ResultCode } from '../server/domain/result'
import type { CalendarDate, Jurisdiction, OpeningHours, TimeOfDay, Venue, VenueBase } from '../types'

// The oracles come from running the legacy console implementation, and this is its
// full table. If a test fails, the defect is in the port, not in the table. Each case carries its identifier in its name.

function date(iso: string): CalendarDate {
  const [year, month, day] = iso.split('-').map(Number)
  return { year: year!, month: month!, day: day! }
}

function time(hhmm: string): TimeOfDay {
  const [hour, minute] = hhmm.split(':').map(Number)
  return { hour: hour!, minute: minute! }
}

function span(range: string): OpeningHours {
  const [open, close] = range.split('–')
  return { open: time(open!), close: time(close!) }
}

function venue(id: string): Venue {
  const found = VENUES.find((v) => v.id === id)
  if (!found) throw new Error(`Recinto inexistente en el catálogo: ${id}`)
  return found
}

const TODAY = date('2026-10-03')

interface OpeningCase {
  readonly id: string
  readonly label: string
  readonly venue: string
  readonly event: string
  readonly at: string
  readonly hours: string | null
  readonly code: ResultCode
  readonly today?: string
}

const OPENING_CASES: readonly OpeningCase[] = [
  { id: 'A1', label: 'Ayer', venue: 'cinepolis', event: '2026-10-02', at: '12:00', hours: '11:00–23:30', code: 'ERR_DATE_PAST' },
  { id: 'A2', label: 'Hoy', venue: 'cinepolis', event: '2026-10-03', at: '12:00', hours: '11:00–23:30', code: 'OK' },
  { id: 'A3', label: '31 de noviembre', venue: 'cinepolis', event: '2026-11-31', at: '12:00', hours: null, code: 'ERR_DATE_INVALID' },
  { id: 'A4', label: '29/2 en siglo no bisiesto', venue: 'cinepolis', event: '2100-02-29', at: '12:00', hours: null, code: 'ERR_DATE_INVALID' },
  { id: 'A5', label: '29/2 en año bisiesto', venue: 'cinepolis', event: '2028-02-29', at: '12:00', hours: '11:00–23:30', code: 'OK' },
  { id: 'A6', label: 'Último domingo del mes', venue: 'vaticanos', event: '2026-10-25', at: '10:00', hours: '09:00–14:00', code: 'OK' },
  { id: 'A7', label: 'Domingo que no es el último', venue: 'vaticanos', event: '2026-10-18', at: '10:00', hours: '09:00–14:00', code: 'ERR_DAY_CLOSED' },
  { id: 'A8', label: 'Último domingo, fuera del horario dominical', venue: 'vaticanos', event: '2026-10-25', at: '15:00', hours: '09:00–14:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A9', label: 'Último domingo que es cierre anual', venue: 'vaticanos', event: '2027-12-26', at: '10:00', hours: '09:00–14:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A10', label: 'Lunes ordinario', venue: 'mnac', event: '2026-10-05', at: '12:00', hours: '10:00–18:00', code: 'ERR_DAY_CLOSED' },
  { id: 'A11', label: 'Lunes festivo (Diada)', venue: 'mnac', event: '2028-09-11', at: '12:00', hours: '10:00–15:00', code: 'OK' },
  { id: 'A12', label: 'Lunes festivo, después del cierre de dom/festivo', venue: 'mnac', event: '2028-09-11', at: '16:00', hours: '10:00–15:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A13', label: 'Lunes festivo que es cierre anual', venue: 'mnac', event: '2029-01-01', at: '12:00', hours: '10:00–15:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A14', label: 'Sábado de verano', venue: 'mnac', event: '2027-05-15', at: '19:00', hours: '10:00–20:00', code: 'OK' },
  { id: 'A15', label: 'Sábado de invierno', venue: 'mnac', event: '2026-10-17', at: '19:00', hours: '10:00–18:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A16', label: 'Domingo de verano', venue: 'mnac', event: '2027-05-16', at: '16:00', hours: '10:00–15:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A17', label: 'Festivo francés en miércoles', venue: 'louvre', event: '2027-07-14', at: '12:00', hours: '09:00–21:45', code: 'OK' },
  { id: 'A18', label: '14 de julio en martes', venue: 'louvre', event: '2026-07-14', at: '12:00', hours: '09:00–18:00', code: 'ERR_DAY_CLOSED', today: '2026-01-01' },
  { id: 'A19', label: 'Cierre anual', venue: 'louvre', event: '2027-05-01', at: '12:00', hours: '09:00–18:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A20', label: 'Nocturno del miércoles, en el límite', venue: 'louvre', event: '2026-10-07', at: '21:45', hours: '09:00–21:45', code: 'OK' },
  { id: 'A21', label: 'Jueves a la misma hora', venue: 'louvre', event: '2026-10-08', at: '21:45', hours: '09:00–18:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A22', label: 'Viernes extendido', venue: 'met', event: '2026-10-09', at: '20:00', hours: '10:00–21:00', code: 'OK' },
  { id: 'A23', label: 'Miércoles', venue: 'met', event: '2026-10-07', at: '12:00', hours: '10:00–17:00', code: 'ERR_DAY_CLOSED' },
  { id: 'A24', label: 'Cierre anual', venue: 'met', event: '2026-12-25', at: '12:00', hours: '10:00–21:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A25', label: 'Lunes', venue: 'mna', event: '2026-10-05', at: '12:00', hours: '09:00–18:00', code: 'ERR_DAY_CLOSED' },
  { id: 'A26', label: 'Festivo mexicano en museo', venue: 'mna', event: '2027-09-16', at: '12:00', hours: '09:00–18:00', code: 'OK' },
  { id: 'A27', label: 'Festivo mexicano en teatro', venue: 'teatro-metropolitan', event: '2027-09-16', at: '12:00', hours: '10:00–18:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A28', label: 'Domingo sin cierre semanal', venue: 'teatro-metropolitan', event: '2026-10-04', at: '12:00', hours: '10:00–18:00', code: 'OK' },
  { id: 'A29', label: 'Domingo', venue: 'teatro-colon', event: '2026-10-04', at: '12:00', hours: '10:00–20:00', code: 'ERR_DAY_CLOSED' },
  { id: 'A30', label: 'Festivo en domingo (gana el festivo)', venue: 'teatro-colon', event: '2031-05-25', at: '12:00', hours: '10:00–20:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A31', label: 'Cierre exacto (se incluye)', venue: 'teatro-colon', event: '2026-10-05', at: '20:00', hours: '10:00–20:00', code: 'OK' },
  { id: 'A32', label: 'Un minuto después del cierre', venue: 'teatro-colon', event: '2026-10-05', at: '20:01', hours: '10:00–20:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A33', label: 'Un minuto antes de abrir', venue: 'teatro-colon', event: '2026-10-05', at: '09:59', hours: '10:00–20:00', code: 'ERR_OUTSIDE_HOURS' },
  { id: 'A34', label: 'Domingo', venue: 'teatro-scala', event: '2026-10-04', at: '14:00', hours: '13:00–18:00', code: 'ERR_DAY_CLOSED' },
  { id: 'A35', label: 'Ferragosto en martes', venue: 'teatro-scala', event: '2028-08-15', at: '14:00', hours: '13:00–18:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A36', label: 'Ferragosto en domingo (gana el festivo)', venue: 'teatro-scala', event: '2027-08-15', at: '14:00', hours: '13:00–18:00', code: 'ERR_DAY_HOLIDAY' },
  { id: 'A37', label: 'Navidad en cine', venue: 'cinepolis', event: '2026-12-25', at: '12:00', hours: '11:00–23:30', code: 'OK' },
  { id: 'A38', label: 'Cierre a las 23:59', venue: 'cinemark', event: '2026-10-05', at: '23:59', hours: '10:30–23:59', code: 'OK' },
]

describe('evaluateOpening — casos A1–A38', () => {
  it.each(OPENING_CASES)('$id $venue: $label', (c) => {
    const today = c.today ? date(c.today) : TODAY
    const result = evaluateOpening(venue(c.venue), date(c.event), time(c.at), today)
    expect(result.code).toBe(c.code)
    if (c.hours !== null) {
      expect(applicableHours(venue(c.venue), date(c.event))).toEqual(span(c.hours))
    }
  })
})

describe('entrada inválida — E1–E3', () => {
  const colon = venue('teatro-colon')

  it('E1 teatro-colon: 24:00 no es una hora', () => {
    expect(evaluateOpeningHours(colon, date('2026-10-05'), time('24:00')).code).toBe('ERR_INPUT_INVALID')
  })

  it('E2 teatro-colon: minuto 60', () => {
    expect(evaluateOpeningHours(colon, date('2026-10-05'), time('12:60')).code).toBe('ERR_INPUT_INVALID')
  })

  it('E3 cinepolis: today inexistente', () => {
    const result = evaluateOpening(venue('cinepolis'), date('2026-10-05'), time('12:00'), date('2026-02-30'))
    expect(result.code).toBe('ERR_DATE_INVALID')
  })
})

describe('recintos sintéticos — S1–S5', () => {
  // They combine exceptions no real venue has. They prove that the rules consult
  // policies and not categories, and that the exceptions do not interfere.
  const base = {
    name: 'Sintético',
    city: 'Prueba',
    category: 'museo',
    capacity: 1,
    jurisdiction: 'ES',
    currency: 'EUR',
    annualClosures: [],
    restrictions: '',
  } as const

  const syntheticA: VenueBase = {
    ...base,
    id: 'sintetico-a',
    hours: span('10:00–18:00'),
    alternateHours: span('10:00–20:00'),
    sundayHours: span('09:00–14:00'),
    closedWeekdays: [0],
    exceptions: ['OPENS_LAST_SUNDAY', 'SEASONAL_HOURS'],
  }

  const syntheticB: VenueBase = {
    ...base,
    id: 'sintetico-b',
    hours: span('10:00–18:00'),
    alternateHours: span('10:00–18:00'),
    sundayHours: span('10:00–18:00'),
    closedWeekdays: [1],
    exceptions: ['CLOSES_ON_HOLIDAY', 'OPENS_ON_HOLIDAY'],
  }

  const cases = [
    { id: 'S1', label: 'Último domingo de verano: aplica temporada', target: syntheticA, event: '2027-05-30', at: '19:00', hours: '10:00–20:00', code: 'OK' },
    { id: 'S2', label: 'Último domingo de invierno', target: syntheticA, event: '2026-10-25', at: '19:00', hours: '10:00–18:00', code: 'ERR_OUTSIDE_HOURS' },
    { id: 'S3', label: 'Domingo que no es el último', target: syntheticA, event: '2027-05-23', at: '12:00', hours: '10:00–20:00', code: 'ERR_DAY_CLOSED' },
    { id: 'S4', label: 'Lunes festivo con CIERRA y ABRE a la vez: gana el cierre', target: syntheticB, event: '2028-09-11', at: '12:00', hours: '10:00–18:00', code: 'ERR_DAY_HOLIDAY' },
    { id: 'S5', label: 'Lunes ordinario', target: syntheticB, event: '2026-10-05', at: '12:00', hours: '10:00–18:00', code: 'ERR_DAY_CLOSED' },
  ] as const

  it.each(cases)('$id $target.id: $label', (c) => {
    expect(evaluateOpening(c.target, date(c.event), time(c.at), TODAY).code).toBe(c.code)
    expect(applicableHours(c.target, date(c.event))).toEqual(span(c.hours))
  })
})

describe('funciones auxiliares', () => {
  it.each([
    ['2026-10-03', 6],
    ['2000-01-01', 6],
    ['2028-02-29', 2],
    ['1900-02-28', 3],
    ['2100-03-01', 1],
    ['2026-01-01', 4],
    ['0001-01-01', 1],
  ] as const)('dayOfWeek %s → %i', (iso, expected) => {
    expect(dayOfWeek(date(iso))).toBe(expected)
  })

  it.each([
    ['2026-10-25', true],
    ['2026-10-18', false],
    ['2026-10-24', false],
    ['2026-05-31', true],
    ['2026-05-24', false],
    ['2027-02-28', true],
    // A 28-day February: 22 + 7 > 28.
    ['2026-02-22', true],
  ] as const)('isLastSundayOfMonth %s → %s', (iso, expected) => {
    expect(isLastSundayOfMonth(date(iso))).toBe(expected)
  })

  it.each([
    [1900, false],
    [2000, true],
    [2024, true],
    [2026, false],
    [2100, false],
    [2400, true],
  ] as const)('isLeapYear %i → %s', (year, expected) => {
    expect(isLeapYear(year)).toBe(expected)
  })

  it.each([
    [2024, 2, 29],
    [1900, 2, 28],
    [2026, 4, 30],
    [2026, 13, 0],
    [2026, 0, 0],
  ] as const)('daysInMonth(%i, %i) → %i', (year, month, expected) => {
    expect(daysInMonth(year, month)).toBe(expected)
  })

  it.each(['0000-01-01', '2026-01-00', '2026-04-31'])('isValidDate %s → false', (iso) => {
    expect(isValidDate(date(iso))).toBe(false)
  })

  it.each([
    ['2026-10-03', '2026-10-04', -1],
    ['2026-10-04', '2026-10-03', 1],
    ['2026-10-03', '2026-10-03', 0],
    ['2025-11-03', '2026-10-03', -1],
  ] as const)('compareDates(%s, %s) → %i', (a, b, expected) => {
    expect(compareDates(date(a), date(b))).toBe(expected)
  })

  it.each([
    ['2026-09-16', 'MX', true],
    ['2026-09-16', 'US', false],
    ['2026-07-14', 'FR', true],
    ['2026-08-15', 'VA', true],
    ['2026-08-15', 'IT', true],
    ['2026-09-11', 'ES', true],
  ] as const)('isHoliday %s %s → %s', (iso, jurisdiction, expected) => {
    expect(isHoliday(date(iso), jurisdiction)).toBe(expected)
  })
})

describe('adaptación de TypeScript — T1–T2', () => {
  it('T1 isValidDate rechaza un día no entero', () => {
    expect(isValidDate({ year: 2026, month: 10, day: 3.5 })).toBe(false)
  })

  it('T2 teatro-colon: minuto no entero', () => {
    const result = evaluateOpeningHours(venue('teatro-colon'), date('2026-10-05'), { hour: 12, minute: 30.5 })
    expect(result.code).toBe('ERR_INPUT_INVALID')
  })
})

describe('invariantes de datos', () => {
  const EXPECTED_IDS = [
    'teatro-colon', 'teatro-scala', 'teatro-metropolitan',
    'cinemark', 'cinepolis', 'cinemex', 'amc',
    'louvre', 'met', 'vaticanos', 'mna', 'mnac',
  ]

  it('doce recintos, con todos los ids del catálogo', () => {
    expect(VENUES).toHaveLength(12)
    expect(VENUES.map((v) => v.id)).toEqual(EXPECTED_IDS)
  })

  it('cada jurisdicción usada tiene calendario de festivos', () => {
    const used = new Set<Jurisdiction>(VENUES.map((v) => v.jurisdiction))
    for (const jurisdiction of used) {
      expect(HOLIDAYS[jurisdiction], jurisdiction).toBeDefined()
    }
  })

  it('ningún recinto combina dos políticas que comparten alternateHours', () => {
    const exclusive = ['SEASONAL_HOURS', 'WEEKEND_HOURS', 'NIGHT_HOURS'] as const
    for (const v of VENUES) {
      const count = exclusive.filter((policy) => v.exceptions.includes(policy)).length
      expect(count, v.id).toBeLessThanOrEqual(1)
    }
  })

  it('solo los tres teatros cierran por festivo', () => {
    const closing = VENUES.filter((v) => v.exceptions.includes('CLOSES_ON_HOLIDAY')).map((v) => v.id)
    expect(closing).toEqual(['teatro-colon', 'teatro-scala', 'teatro-metropolitan'])
  })

  it('ningún cine tiene cierre semanal ni cierres anuales', () => {
    for (const v of VENUES.filter((v) => v.category === 'cine')) {
      expect(v.closedWeekdays, v.id).toEqual([])
      expect(v.annualClosures, v.id).toEqual([])
    }
  })

  it('en cada horario la apertura no es posterior al cierre', () => {
    const minutes = (t: TimeOfDay): number => t.hour * 60 + t.minute
    for (const v of VENUES) {
      for (const hours of [v.hours, v.alternateHours, v.sundayHours]) {
        expect(minutes(hours.open), v.id).toBeLessThanOrEqual(minutes(hours.close))
      }
    }
  })
})

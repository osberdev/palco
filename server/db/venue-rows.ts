import { daysInMonth } from '../domain/calendar.ts'
import { cents } from '../domain/money.ts'
import type {
  AnnualClosure,
  CinemaFormatId,
  ExceptionPolicy,
  FilmClassification,
  Jurisdiction,
  OpeningHours,
  TimeOfDay,
  Venue,
  Weekday,
} from '../../types/index.ts'

/**
 * The venues as they come out of the database, and their conversion to `Venue`. It
 * is pure: it does not read the database, only the rows `loadVenues` passes in, and
 * it does not throw. It validates what a CHECK cannot express (each venue has what
 * its category requires and nothing from another one, positions without gaps,
 * dates that exist) and reports every problem at once, each with the venue and the
 * rule, so startup can list them together.
 *
 * Each object's keys are built in catalog order: the API serializes the venue as
 * is, and PU9 compares the JSON.
 */

export interface VenueBaseRow {
  readonly id: string
  readonly position: number | null
  readonly category: string
  readonly name: string
  readonly city: string
  readonly jurisdiction: string
  readonly currency: string
  readonly capacity: number
  readonly opens: string
  readonly closes: string
  readonly restrictions: string
}

export interface VenueHoursRow { readonly venue_id: string, readonly kind: string, readonly opens: string, readonly closes: string }
export interface ClosedWeekdayRow { readonly venue_id: string, readonly weekday: number }
export interface ExceptionRow { readonly venue_id: string, readonly policy: string }
export interface AnnualClosureRow { readonly venue_id: string, readonly month: number, readonly day: number, readonly name: string }
export interface TheaterRow { readonly venue_id: string, readonly attire: string }
export interface SectionRow { readonly venue_id: string, readonly position: number, readonly name: string, readonly price_cents: number }
export interface PlayRow { readonly venue_id: string, readonly position: number, readonly title: string }
export interface CinemaRow { readonly venue_id: string, readonly service_fee_cents: number }
export interface FormatRow { readonly venue_id: string, readonly position: number, readonly format_id: string, readonly price_cents: number, readonly seats: number }
export interface FilmRow { readonly venue_id: string, readonly position: number, readonly title: string, readonly classification: string, readonly duration_minutes: number }
export interface MuseumRow {
  readonly venue_id: string
  readonly general_fee_cents: number
  readonly resident_fee_cents: number | null
  readonly residency_question: string | null
  readonly entry_note: string
}

/** The rows of the twelve venue tables, each list already in order. */
export interface VenueRows {
  readonly venues: readonly VenueBaseRow[]
  readonly hours: readonly VenueHoursRow[]
  readonly closedWeekdays: readonly ClosedWeekdayRow[]
  readonly exceptions: readonly ExceptionRow[]
  readonly annualClosures: readonly AnnualClosureRow[]
  readonly theaters: readonly TheaterRow[]
  readonly sections: readonly SectionRow[]
  readonly plays: readonly PlayRow[]
  readonly cinemas: readonly CinemaRow[]
  readonly formats: readonly FormatRow[]
  readonly films: readonly FilmRow[]
  readonly museums: readonly MuseumRow[]
}

export type VenueRule =
  | 'categoria-ajena'
  | 'fila-de-categoria'
  | 'minimos'
  | 'posiciones'
  | 'formato-repetido'
  | 'cierre-inexistente'
  | 'horario-alterno'
  | 'horarios-faltantes'
  | 'sin-filas'
  | 'fila-huerfana'

export interface VenueProblem {
  readonly venueId: string
  readonly rule: VenueRule
  readonly detail: string
}

export type ParsedVenues =
  | { readonly ok: true, readonly venues: readonly Venue[] }
  | { readonly ok: false, readonly problems: readonly VenueProblem[] }

/** The policies that use `alternateHours`: at most one per venue. */
const ALTERNATE_POLICIES: readonly string[] = ['SEASONAL_HOURS', 'WEEKEND_HOURS', 'NIGHT_HOURS']

/** Which category tables a venue may have, and which one is its own row. */
const CATEGORY_TABLES = {
  teatro: ['theaters', 'sections', 'plays'],
  cine: ['cinemas', 'formats', 'films'],
  museo: ['museums'],
} as const

type CategoryTable = 'theaters' | 'sections' | 'plays' | 'cinemas' | 'formats' | 'films' | 'museums'
const OWN_ROW: Readonly<Record<'teatro' | 'cine' | 'museo', 'theaters' | 'cinemas' | 'museums'>> = {
  teatro: 'theaters',
  cine: 'cinemas',
  museo: 'museums',
}
const CATEGORY_TABLE_NAMES: Readonly<Record<CategoryTable, string>> = {
  theaters: 'venue_theaters',
  sections: 'venue_sections',
  plays: 'venue_plays',
  cinemas: 'venue_cinemas',
  formats: 'venue_formats',
  films: 'venue_films',
  museums: 'venue_museums',
}

/** The rows of a category table, as rows of any venue. */
function rowsOf(rows: VenueRows, table: CategoryTable): readonly { readonly venue_id: string }[] {
  return rows[table]
}

function time(text: string): TimeOfDay {
  return { hour: Number(text.slice(0, 2)), minute: Number(text.slice(3, 5)) }
}

function span(opens: string, closes: string): OpeningHours {
  return { open: time(opens), close: time(closes) }
}

/** Deep freeze: the loaded venue does not change after startup (RNF-04). */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** `true` if the positions are exactly 0, 1, …, n−1, in that order. */
function contiguous(positions: readonly (number | null)[]): boolean {
  return positions.every((position, index) => position === index)
}

export function parseVenueRows(rows: VenueRows): ParsedVenues {
  const problems: VenueProblem[] = []
  const report = (venueId: string, rule: VenueRule, detail: string) => problems.push({ venueId, rule, detail })
  const known = new Set(rows.venues.map((venue) => venue.id))
  const of = <R extends { readonly venue_id: string }>(list: readonly R[], id: string) => list.filter((row) => row.venue_id === id)

  if (!contiguous(rows.venues.map((venue) => venue.position))) {
    for (const [index, venue] of rows.venues.entries()) {
      if (venue.position !== index) report(venue.id, 'posiciones', `venues.position es ${venue.position ?? 'NULL'}; se espera ${index}`)
    }
  }

  // Rows of a venue that does not exist: the foreign key prevents it in the
  // database, but this function receives rows and does not assume it.
  const childLists: readonly (readonly [string, readonly { readonly venue_id: string }[]])[] = [
    ['venue_hours', rows.hours], ['venue_closed_weekdays', rows.closedWeekdays], ['venue_exceptions', rows.exceptions],
    ['venue_annual_closures', rows.annualClosures], ...(Object.keys(CATEGORY_TABLE_NAMES) as CategoryTable[]).map((key) => [CATEGORY_TABLE_NAMES[key], rowsOf(rows, key)] as const),
  ]
  for (const [table, list] of childLists) {
    for (const id of new Set(list.map((row) => row.venue_id))) {
      if (!known.has(id)) report(id, 'fila-huerfana', `${table} tiene filas de un recinto que no está en venues`)
    }
  }

  const venues: Venue[] = []
  for (const base of rows.venues) {
    const id = base.id
    const before = problems.length
    const category = base.category
    if (category !== 'teatro' && category !== 'cine' && category !== 'museo') {
      report(id, 'categoria-ajena', `categoría desconocida «${category}»`)
      continue
    }
    if (childLists.every(([, list]) => of(list, id).length === 0)) {
      report(id, 'sin-filas', 'no tiene ninguna fila en las tablas de recintos')
      continue
    }

    // Rows from another category.
    const allowed: readonly string[] = CATEGORY_TABLES[category]
    for (const key of Object.keys(CATEGORY_TABLE_NAMES) as CategoryTable[]) {
      if (!allowed.includes(key) && rowsOf(rows, key).some((row) => row.venue_id === id)) report(id, 'categoria-ajena', `un ${category} no lleva filas en ${CATEGORY_TABLE_NAMES[key]}`)
    }
    const own = rowsOf(rows, OWN_ROW[category]).filter((row) => row.venue_id === id)
    if (own.length !== 1) report(id, 'fila-de-categoria', `${CATEGORY_TABLE_NAMES[OWN_ROW[category]]} tiene ${own.length} filas; se espera 1`)

    const hours = of(rows.hours, id)
    const alternate = hours.filter((row) => row.kind === 'alternate')
    const sunday = hours.filter((row) => row.kind === 'sunday_holiday')
    if (alternate.length !== 1 || sunday.length !== 1) {
      report(id, 'horarios-faltantes', `venue_hours tiene ${alternate.length} filas alternate y ${sunday.length} sunday_holiday; se espera una de cada una`)
    }

    const exceptions = of(rows.exceptions, id).map((row) => row.policy)
    const alternatePolicies = exceptions.filter((policy) => ALTERNATE_POLICIES.includes(policy))
    if (alternatePolicies.length > 1) report(id, 'horario-alterno', `${alternatePolicies.join(' y ')} comparten el horario alterno: a lo más una`)

    const closures = of(rows.annualClosures, id)
    for (const closure of closures) {
      // With a leap year: February 29 exists, February 30 does not.
      if (closure.day > daysInMonth(2000, closure.month)) report(id, 'cierre-inexistente', `${closure.day}/${closure.month} (${closure.name}) no existe`)
    }

    const ordered = <R extends { readonly position: number }>(table: CategoryTable, list: readonly R[]): readonly R[] => {
      if (!contiguous(list.map((row) => row.position))) report(id, 'posiciones', `${CATEGORY_TABLE_NAMES[table]}: las posiciones deben ser 0 a ${list.length - 1} sin huecos`)
      return list
    }

    let venue: Venue | null = null
    const common = {
      id,
      name: base.name,
      city: base.city,
    }
    const tail = {
      capacity: base.capacity,
      jurisdiction: base.jurisdiction as Jurisdiction,
      currency: base.currency as Venue['currency'],
      hours: span(base.opens, base.closes),
      alternateHours: alternate[0] ? span(alternate[0].opens, alternate[0].closes) : span(base.opens, base.closes),
      sundayHours: sunday[0] ? span(sunday[0].opens, sunday[0].closes) : span(base.opens, base.closes),
      closedWeekdays: of(rows.closedWeekdays, id).map((row) => row.weekday as Weekday),
      exceptions: exceptions as ExceptionPolicy[],
      annualClosures: closures.map((row): AnnualClosure => ({ day: row.day, month: row.month, name: row.name })),
      restrictions: base.restrictions,
    }

    if (category === 'teatro') {
      const sections = ordered('sections', of(rows.sections, id))
      const plays = ordered('plays', of(rows.plays, id))
      if (sections.length === 0) report(id, 'minimos', 'un teatro necesita al menos una sección')
      if (plays.length === 0) report(id, 'minimos', 'un teatro necesita al menos una obra')
      venue = {
        ...common,
        category,
        ...tail,
        sections: sections.map((row) => ({ name: row.name, price: cents(row.price_cents) })),
        plays: plays.map((row) => row.title),
        dressCode: of(rows.theaters, id)[0]?.attire ?? '',
      }
    }
    else if (category === 'cine') {
      const formats = ordered('formats', of(rows.formats, id))
      const films = ordered('films', of(rows.films, id))
      if (formats.length === 0) report(id, 'minimos', 'un cine necesita al menos un formato')
      if (films.length === 0) report(id, 'minimos', 'un cine necesita al menos una película')
      const seen = new Set<string>()
      for (const format of formats) {
        if (seen.has(format.format_id)) report(id, 'formato-repetido', `el formato ${format.format_id} aparece más de una vez`)
        seen.add(format.format_id)
      }
      venue = {
        ...common,
        category,
        ...tail,
        serviceFee: cents(of(rows.cinemas, id)[0]?.service_fee_cents ?? 0),
        formats: formats.map((row) => ({ id: row.format_id as CinemaFormatId, price: cents(row.price_cents), seats: row.seats })),
        films: films.map((row) => ({ title: row.title, classification: row.classification as FilmClassification, durationMinutes: row.duration_minutes })),
      }
    }
    else {
      const museum = of(rows.museums, id)[0]
      const general = museum?.general_fee_cents ?? 0
      // Without a differentiated fee the resident fee is NULL in the database, and the
      // venue repeats the general fee.
      const resident = museum?.resident_fee_cents ?? null
      venue = {
        ...common,
        category,
        ...tail,
        generalFee: cents(general),
        residentFee: cents(resident ?? general),
        hasDifferentiatedFee: resident !== null,
        residencyQuestion: museum?.residency_question ?? null,
        entryNote: museum?.entry_note ?? '',
      }
    }
    if (problems.length === before) venues.push(reorder(venue))
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, venues: deepFreeze(venues) }
}

/**
 * Keys in catalog order: `id`, `name`, `city`, `category` and then the shared
 * fields. The spread above already leaves `category` after `city`, like the
 * catalog; this function only makes it explicit, independent of how the literal
 * was written.
 */
function reorder(venue: Venue): Venue {
  const { id, name, city, category, capacity, jurisdiction, currency, hours, alternateHours, sundayHours, closedWeekdays, exceptions, annualClosures, restrictions, ...own } = venue
  return { id, name, city, category, capacity, jurisdiction, currency, hours, alternateHours, sundayHours, closedWeekdays, exceptions, annualClosures, restrictions, ...own } as Venue
}

/** One line per problem, for the startup message. */
export function describeVenueProblems(problems: readonly VenueProblem[]): string {
  return problems.map((problem) => `  - ${problem.venueId} (${problem.rule}): ${problem.detail}`).join('\n')
}

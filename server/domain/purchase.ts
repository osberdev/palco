import type {
  CalendarDate,
  Cents,
  CinemaFilm,
  CinemaFormat,
  CinemaVenue,
  FilmClassification,
  MuseumVenue,
  TheaterSection,
  TheaterVenue,
  TimeOfDay,
  VenueBase,
} from '../../types'
import { calculateAmount, evaluateQuantity, museumFee } from './booking'
import { compareDates, evaluateOpening, evaluateOpeningDay, evaluateOpeningHours, isValidDate } from './calendar'
import { AGE_MAX, AGE_MIN, evaluateAge, evaluateFilm, evaluateFormat, evaluateSeat, findFormat } from './cinema'
import { parseDate, parseInteger, parseTime } from './input'
import { ZERO_CENTS } from './money'
import { accept, err, reject, type Checked, type Result } from './result'
import { evaluatePlay, evaluateSection } from './theater'

// ── Per-field validation ──────────────────────────────────────────────────
// These feed each UI field's feedback, which shows every error at once. They are
// generic over `VenueBase` so the cinema and museum purchases can reuse them.

/** Format and existence, `today`, past date and opening day. */
export function evaluateEventDate(venue: VenueBase, text: string, today: CalendarDate): Checked<CalendarDate> {
  const parsed = parseDate(text)
  if (!parsed.ok) return parsed
  if (!isValidDate(today)) return reject(err('ERR_DATE_INVALID'))
  if (compareDates(parsed.value, today) < 0) return reject(err('ERR_DATE_PAST'))

  const day = evaluateOpeningDay(venue, parsed.value)
  if (!day.ok) return reject(day)
  return accept(parsed.value)
}

/**
 * Without a date only the format is checked: the applicable hours depend on the
 * day (RN-APE-12), and without a day there is nothing to compare against.
 */
export function evaluateEventTime(venue: VenueBase, date: CalendarDate | null, text: string): Checked<TimeOfDay> {
  const parsed = parseTime(text)
  if (!parsed.ok || date === null) return parsed

  const hours = evaluateOpeningHours(venue, date, parsed.value)
  if (!hours.ok) return reject(hours)
  return parsed
}

export function evaluateTicketQuantity(text: string, userLimit: number, available: number): Checked<number> {
  const parsed = parseInteger(text)
  if (!parsed.ok) return parsed

  const quantity = evaluateQuantity(parsed.value, userLimit, available)
  if (!quantity.ok) return reject(quantity)
  return parsed
}

/**
 * The attendee's age: the accepted range and then the rule. Without a valid film
 * there is no classification to compare against, and only the input is checked.
 */
export function evaluateAttendeeAge(classification: FilmClassification | null, text: string): Checked<number> {
  const parsed = parseInteger(text)
  if (!parsed.ok) return parsed
  if (parsed.value < AGE_MIN || parsed.value > AGE_MAX) return reject(err('ERR_AGE_OUT_OF_RANGE'))
  if (classification === null) return parsed

  const age = evaluateAge(classification, parsed.value)
  if (!age.ok) return reject(age)
  return parsed
}

/**
 * One result per seat, in order. Repetition is compared by value and only
 * against earlier accepted seats: a rejected seat is never recorded, so it
 * cannot collide with another.
 */
export function evaluateSeatNumbers(texts: readonly string[], roomSeats: number): readonly Checked<number>[] {
  const accepted: number[] = []
  return texts.map((text) => {
    const parsed = parseInteger(text)
    if (!parsed.ok) return parsed

    const seat = evaluateSeat(parsed.value, roomSeats)
    if (!seat.ok) return reject(seat)
    if (accepted.includes(parsed.value)) return reject(err('ERR_SEAT_REPEATED'))

    accepted.push(parsed.value)
    return parsed
  })
}

// ── Steps shared by the composites ────────────────────────────────────────

type ScheduleField = 'date' | 'time' | 'quantity'

interface ScheduleInput {
  readonly date: string
  readonly time: string
  readonly quantity: string
}

type ScheduleOutcome =
  | { readonly ok: true; readonly date: CalendarDate; readonly time: TimeOfDay; readonly quantity: number }
  | { readonly ok: false; readonly field: ScheduleField; readonly result: Result }

/**
 * Date, time, opening and quantity, in the order the three categories share, as in the legacy console
 * implementation. A
 * past date stops before the time is read (fail fast); the time format, on the
 * other hand, is checked before the venue's closure, because the time is read
 * before the opening is evaluated.
 */
function evaluateSchedule(
  venue: VenueBase,
  input: ScheduleInput,
  userLimit: number,
  available: number,
  today: CalendarDate,
): ScheduleOutcome {
  const date = parseDate(input.date)
  if (!date.ok) return { ok: false, field: 'date', result: date.result }
  if (!isValidDate(today)) return { ok: false, field: 'date', result: err('ERR_DATE_INVALID') }
  if (compareDates(date.value, today) < 0) return { ok: false, field: 'date', result: err('ERR_DATE_PAST') }

  const time = parseTime(input.time)
  if (!time.ok) return { ok: false, field: 'time', result: time.result }

  const opening = evaluateOpening(venue, date.value, time.value, today)
  if (!opening.ok) return { ok: false, field: opening.code === 'ERR_OUTSIDE_HOURS' ? 'time' : 'date', result: opening }

  const parsedQuantity = parseInteger(input.quantity)
  if (!parsedQuantity.ok) return { ok: false, field: 'quantity', result: parsedQuantity.result }

  const quantity = evaluateQuantity(parsedQuantity.value, userLimit, available)
  if (!quantity.ok) return { ok: false, field: 'quantity', result: quantity }

  return { ok: true, date: date.value, time: time.value, quantity: parsedQuantity.value }
}

// ── Theater composite ─────────────────────────────────────────────────────

export type TheaterField = 'play' | 'section' | 'date' | 'time' | 'quantity'

export interface TheaterSelectionInput {
  readonly playIndex: number
  readonly sectionIndex: number
  readonly date: string
  readonly time: string
  readonly quantity: string
}

export interface TheaterQuote {
  readonly play: string
  readonly section: TheaterSection
  readonly date: CalendarDate
  readonly time: TimeOfDay
  readonly quantity: number
  /** In cents, like every other quote amount. */
  readonly amount: Cents
}

export type TheaterSelection =
  | { readonly ok: true; readonly quote: TheaterQuote }
  | { readonly ok: false; readonly field: TheaterField; readonly result: Result }

function rejectField(field: TheaterField, result: Result): TheaterSelection {
  return { ok: false, field, result }
}

/**
 * A single reason, in the theater flow order (RN-COM-05). The purchase endpoint
 * runs this same contract again on the server.
 */
export function evaluateTheaterSelection(
  theater: TheaterVenue,
  input: TheaterSelectionInput,
  userLimit: number,
  available: number,
  today: CalendarDate,
): TheaterSelection {
  const play = evaluatePlay(theater, input.playIndex)
  if (!play.ok) return rejectField('play', play)

  const section = evaluateSection(theater, input.sectionIndex)
  if (!section.ok) return rejectField('section', section)

  const schedule = evaluateSchedule(theater, input, userLimit, available, today)
  if (!schedule.ok) return rejectField(schedule.field, schedule.result)

  const chosenSection = theater.sections[input.sectionIndex]!
  return {
    ok: true,
    quote: {
      play: theater.plays[input.playIndex]!,
      section: chosenSection,
      date: schedule.date,
      time: schedule.time,
      quantity: schedule.quantity,
      // No service fee: RN-TAR-05 restricts it to cinemas (RN-COM-06).
      amount: calculateAmount(chosenSection.price, schedule.quantity, ZERO_CENTS),
    },
  }
}

// ── Cinema composite ──────────────────────────────────────────────────────

export type CinemaField = 'film' | 'age' | 'format' | 'date' | 'time' | 'quantity' | 'seats'

export interface CinemaSelectionInput {
  readonly filmIndex: number
  readonly age: string
  readonly formatId: string
  readonly date: string
  readonly time: string
  readonly quantity: string
  readonly seats: readonly string[]
}

export interface CinemaQuote {
  readonly film: CinemaFilm
  readonly age: number
  readonly format: CinemaFormat
  readonly date: CalendarDate
  readonly time: TimeOfDay
  readonly quantity: number
  readonly seats: readonly number[]
  /** Format price times quantity, without the fee. */
  readonly subtotal: Cents
  /** Service fee per ticket. */
  readonly serviceFee: Cents
  readonly feeTotal: Cents
  readonly amount: Cents
}

export type CinemaSelection =
  | { readonly ok: true; readonly quote: CinemaQuote }
  | {
      readonly ok: false
      readonly field: CinemaField
      /** Non-null only with `seats` and a specific seat. */
      readonly seatIndex: number | null
      readonly result: Result
    }

function rejectCinema(field: CinemaField, result: Result, seatIndex: number | null = null): CinemaSelection {
  return { ok: false, field, seatIndex, result }
}

/**
 * A single reason, in the cinema flow order (RN-COM-11): film, age, format, the
 * steps shared with the theater and the seats in order.
 */
export function evaluateCinemaSelection(
  cinema: CinemaVenue,
  input: CinemaSelectionInput,
  userLimit: number,
  available: number,
  today: CalendarDate,
): CinemaSelection {
  const film = evaluateFilm(cinema, input.filmIndex)
  if (!film.ok) return rejectCinema('film', film)
  const chosenFilm = cinema.films[input.filmIndex]!

  const age = evaluateAttendeeAge(chosenFilm.classification, input.age)
  if (!age.ok) return rejectCinema('age', age.result)

  const format = evaluateFormat(cinema, input.formatId)
  if (!format.ok) return rejectCinema('format', format)
  const chosenFormat = findFormat(cinema, input.formatId)!

  const schedule = evaluateSchedule(cinema, input, userLimit, available, today)
  if (!schedule.ok) return rejectCinema(schedule.field, schedule.result)

  // The UI always sends one seat per ticket: only a tampered request body gets
  // here, and there is no specific seat to blame.
  if (input.seats.length !== schedule.quantity) return rejectCinema('seats', err('ERR_INPUT_INVALID'))

  const seats = evaluateSeatNumbers(input.seats, chosenFormat.seats)
  const accepted: number[] = []
  for (const [index, seat] of seats.entries()) {
    if (!seat.ok) return rejectCinema('seats', seat.result, index)
    accepted.push(seat.value)
  }

  return {
    ok: true,
    quote: {
      film: chosenFilm,
      age: age.value,
      format: chosenFormat,
      date: schedule.date,
      time: schedule.time,
      quantity: schedule.quantity,
      seats: accepted,
      subtotal: calculateAmount(chosenFormat.price, schedule.quantity, ZERO_CENTS),
      serviceFee: cinema.serviceFee,
      feeTotal: calculateAmount(ZERO_CENTS, schedule.quantity, cinema.serviceFee),
      amount: calculateAmount(chosenFormat.price, schedule.quantity, cinema.serviceFee),
    },
  }
}

// ── Museum composite ──────────────────────────────────────────────────────

export type MuseumField = 'residency' | 'date' | 'time' | 'quantity'

export interface MuseumSelectionInput {
  readonly isResident: boolean
  readonly date: string
  readonly time: string
  readonly quantity: string
}

export type MuseumFeeKind = 'general' | 'resident'

export interface MuseumQuote {
  readonly isResident: boolean
  /** 'resident' only with a differentiated fee and `isResident`. */
  readonly feeKind: MuseumFeeKind
  readonly fee: Cents
  readonly date: CalendarDate
  readonly time: TimeOfDay
  readonly quantity: number
  readonly amount: Cents
}

export type MuseumSelection =
  | { readonly ok: true; readonly quote: MuseumQuote }
  | { readonly ok: false; readonly field: MuseumField; readonly result: Result }

/**
 * A single reason, in the museum flow order (RN-COM-14): residency and the steps
 * shared with theater and cinema.
 *
 * Without a differentiated fee, `isResident: true` is not an error: `museumFee`
 * returns the general fee, and the question is not even asked.
 */
export function evaluateMuseumSelection(
  museum: MuseumVenue,
  input: MuseumSelectionInput,
  userLimit: number,
  available: number,
  today: CalendarDate,
): MuseumSelection {
  // The UI chooses between two radio buttons: only a tampered request body gets here.
  if (typeof input.isResident !== 'boolean') {
    return { ok: false, field: 'residency', result: err('ERR_INPUT_INVALID') }
  }

  const schedule = evaluateSchedule(museum, input, userLimit, available, today)
  if (!schedule.ok) return { ok: false, field: schedule.field, result: schedule.result }

  const fee = museumFee(museum, input.isResident)
  return {
    ok: true,
    quote: {
      isResident: input.isResident,
      feeKind: museum.hasDifferentiatedFee && input.isResident ? 'resident' : 'general',
      fee,
      date: schedule.date,
      time: schedule.time,
      quantity: schedule.quantity,
      // No service fee: RN-TAR-05 restricts it to cinemas (RN-COM-15).
      amount: calculateAmount(fee, schedule.quantity, ZERO_CENTS),
    },
  }
}

import type { CinemaFormat, CinemaFormatId, CinemaVenue, FilmClassification } from '../../types'
import { evaluateIndex } from './choice'
import { err, ok, type Result } from './result'

/**
 * The cinema formats, in order. This is domain vocabulary: the display names live
 * in `utils/cinema.ts`.
 */
export const CINEMA_FORMAT_IDS: readonly CinemaFormatId[] = Object.freeze([
  'tradicional',
  'pluus',
  'vip',
  'macro-xe',
  'junior',
  '4dx',
  'x4d',
  'platino',
  'premium',
  'cinemextremo',
  'cinema',
  'imax',
  'xd',
  'd-box',
  'screenx',
  'dolby',
  'prime',
  'vr',
] as const)

/** The accepted age range. */
export const AGE_MIN = 0
export const AGE_MAX = 130

/**
 * Minimum age per classification, as in the legacy console implementation; 0 for the
 * advisory classifications. The R and
 * NC-17 labels match this rule; the B and B15 labels do not match it yet.
 */
export const MINIMUM_AGE: Readonly<Record<FilmClassification, number>> = Object.freeze({
  'AA': 0,
  'A': 0,
  'B': 0,
  'B15': 0,
  'C': 18,
  'D': 18,
  'G': 0,
  'PG': 0,
  'PG-13': 13,
  'R': 17,
  'NC-17': 17,
})

function isFormatId(id: string): id is CinemaFormatId {
  return (CINEMA_FORMAT_IDS as readonly string[]).includes(id)
}

/** Like `evaluatePlay`: the film index gets its own error code. */
export function evaluateFilm(cinema: CinemaVenue, index: number): Result {
  return evaluateIndex(index, cinema.films.length, 'ERR_FILM_INVALID')
}

export function findFormat(cinema: CinemaVenue, id: string): CinemaFormat | null {
  return cinema.formats.find((candidate) => candidate.id === id) ?? null
}

/** An id outside the format list only arrives in a tampered request body. */
export function evaluateFormat(cinema: CinemaVenue, id: string): Result {
  if (!isFormatId(id)) return err('ERR_INPUT_INVALID')
  if (findFormat(cinema, id) === null) return err('ERR_FORMAT_UNAVAILABLE')
  return ok()
}

export function evaluateAge(classification: FilmClassification, age: number): Result {
  if (!Number.isInteger(age) || age < 0) return err('ERR_INPUT_INVALID')
  // `hasOwn` rather than `in`: an inherited key such as 'toString' is not a classification.
  if (!Object.hasOwn(MINIMUM_AGE, classification)) return err('ERR_INPUT_INVALID')
  if (age < MINIMUM_AGE[classification]) return err('ERR_AGE_INSUFFICIENT')
  return ok()
}

export function evaluateSeat(seat: number, roomSeats: number): Result {
  if (!Number.isInteger(roomSeats) || roomSeats <= 0) return err('ERR_INPUT_INVALID')
  if (!Number.isInteger(seat)) return err('ERR_INPUT_INVALID')
  if (seat < 1 || seat > roomSeats) return err('ERR_SEAT_INVALID')
  return ok()
}

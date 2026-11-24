import type { TheaterVenue } from '../../types'
import { evaluateIndex } from './choice'
import type { Result } from './result'

/** The play index gets its own error code rather than a generic range error. */
export function evaluatePlay(theater: TheaterVenue, index: number): Result {
  return evaluateIndex(index, theater.plays.length, 'ERR_PLAY_INVALID')
}

export function evaluateSection(theater: TheaterVenue, index: number): Result {
  return evaluateIndex(index, theater.sections.length, 'ERR_SECTION_INVALID')
}

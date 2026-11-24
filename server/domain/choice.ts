import { err, ok, type Result, type ResultCode } from './result'

/**
 * Choice by index in a venue list: play, section, film. Non-integer indexes are
 * rejected before the range check, like every other numeric input in the domain:
 * `1.5` is not a list position.
 */
export function evaluateIndex(index: number, length: number, outOfRange: ResultCode): Result {
  if (!Number.isInteger(index)) return err('ERR_INPUT_INVALID')
  if (index < 0 || index >= length) return err(outOfRange)
  return ok()
}

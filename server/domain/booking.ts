import type { Cents, MuseumVenue, Venue } from '../../types'
import { addCents, minCents, multiplyCents, ZERO_CENTS } from './money'
import { accept, err, ok, reject, type Checked, type Result } from './result'

/**
 * Fixed order (RN-CAN-06): integers, positivity, user limit, availability. The
 * effective limit is min(userLimit, available) (RN-CAN-05), and the order decides
 * which reason is reported when two are violated at once.
 *
 * The integer guard comes first because NaN would make every later comparison
 * false and fall through to OK.
 */
export function evaluateQuantity(requested: number, userLimit: number, available: number): Result {
  if (!Number.isInteger(requested) || !Number.isInteger(userLimit) || !Number.isInteger(available)) {
    return err('ERR_INPUT_INVALID')
  }
  if (requested <= 0) return err('ERR_QUANTITY_NOT_POSITIVE')
  if (requested > userLimit) return err('ERR_EXCEEDS_USER_LIMIT')
  if (requested > available) return err('ERR_EXCEEDS_AVAILABILITY')
  return ok()
}

/**
 * What the user has left of their category limit for a venue and an event date,
 * given the tickets already bought there (RN-CAN-07). It is the `userLimit` that
 * `evaluateQuantity` receives, unchanged: the cumulative limit is reported with
 * the same `ERR_EXCEEDS_USER_LIMIT` and in the same order.
 *
 * With more purchased than the limit (unreachable through the UI, possible if a
 * category limit were lowered) the result is 0, never negative.
 */
export function remainingUserLimit(categoryLimit: number, alreadyPurchased: number): Checked<number> {
  if (!Number.isSafeInteger(categoryLimit) || categoryLimit < 0 || !Number.isSafeInteger(alreadyPurchased) || alreadyPurchased < 0) {
    return reject(err('ERR_INPUT_INVALID'))
  }
  return accept(Math.max(0, categoryLimit - alreadyPurchased))
}

/**
 * Takes the already resolved price rather than the venue: the arithmetic is the
 * same for all three categories and must not know where the price came from. The
 * per-ticket fee is only non-zero for cinemas (RN-TAR-05). Everything in integer
 * cents, without rounding.
 */
export function calculateAmount(unitPrice: Cents, quantity: number, feePerTicket: Cents): Cents {
  if (quantity <= 0) return ZERO_CENTS
  if (unitPrice < 0) return ZERO_CENTS
  const fee = feePerTicket < 0 ? ZERO_CENTS : feePerTicket
  return multiplyCents(addCents(unitPrice, fee), quantity)
}

/**
 * One rule with two parameterizations (RN-TAR-02 and 03): Louvre, EU or non-EU;
 * MNA, Mexican or resident versus foreigner.
 */
export function museumFee(museum: MuseumVenue, isResident: boolean): Cents {
  if (!museum.hasDifferentiatedFee) return museum.generalFee
  return isResident ? museum.residentFee : museum.generalFee
}

/**
 * The catalog's reference price (RF-CAT-02): the venue's lowest, which the card
 * labels "Desde". For cinemas it excludes the service fee, which belongs to the
 * purchase and not to the ticket (RN-TAR-05).
 *
 * It switches on `category` because each venue shape stores its prices in a
 * different field. It is not an opening rule: the ban on inspecting the category
 * applies to `calendar.ts`.
 */
export function referencePrice(venue: Venue): Cents {
  switch (venue.category) {
    case 'teatro':
      return minCents(venue.sections.map((section) => section.price))
    case 'cine':
      return minCents(venue.formats.map((format) => format.price))
    case 'museo':
      return minCents([venue.generalFee, venue.residentFee])
  }
}

/**
 * Whether a field change expires the server message stored on another field. Each
 * message lasts until its own field changes. The exception is the cumulative limit
 * per user, venue and date (RN-CAN-07): it arrives on `quantity` but also depends
 * on the date, so it expires when the date changes. Availability is per venue and
 * does not depend on the date: it does not expire with it.
 */
export function serverErrorExpires(errorField: string, code: string | null, changedField: string): boolean {
  if (errorField === changedField) return true
  return errorField === 'quantity' && code === 'ERR_EXCEEDS_USER_LIMIT' && changedField === 'date'
}

import type { CalendarDate, OpeningHours, TimeOfDay, VenueBase } from '../../types'
import { applicableHours, compareDates, evaluateOpeningHours } from './calendar'
import { accept, err, ok, reject, type Checked, type Result } from './result'
import { decodeBase32, parseQrPayload, QR_VERSION, TICKET_ID_BYTES } from './ticket'

/**
 * Admitting a ticket at the gate (RN-ACC-03). No clock, no database and no key:
 * the already verified signature, the ticket the database found, the gate's venue,
 * the day and the time arrive as parameters. The last step of RN-ACC-03, "not
 * used", is not here: the database decides it with the primary key of
 * `admissions`, because reading and then writing would let two simultaneous
 * scans through.
 */

/** What was read: the signed QR, or the short code typed by hand. */
export type AdmissionCode =
  | { readonly kind: 'qr', readonly id: Uint8Array, readonly signature: Uint8Array }
  | { readonly kind: 'short', readonly id: Uint8Array }

/**
 * Step 1 of RN-ACC-03, the shape. Leading and trailing whitespace is trimmed, as
 * for anything typed by hand. Anything starting with `P1.` is a QR, parsed with the
 * strict inverse of `formatQrPayload`; everything else is a short code, with
 * Crockford substitutions and with or without hyphens. Anything else is
 * `ERR_TICKET_CODE_FORMAT`.
 */
export function parseAdmissionCode(text: string): Checked<AdmissionCode> {
  const trimmed = text.trim()
  if (trimmed.startsWith(`${QR_VERSION}.`)) {
    const qr = parseQrPayload(trimmed)
    return qr.ok ? accept({ kind: 'qr', id: qr.value.id, signature: qr.value.signature }) : reject(err('ERR_TICKET_CODE_FORMAT'))
  }
  const id = decodeBase32(trimmed, TICKET_ID_BYTES)
  return id.ok ? accept({ kind: 'short', id: id.value }) : reject(err('ERR_TICKET_CODE_FORMAT'))
}

/** What admission needs from the ticket: its venue and its date, from the purchase. */
export interface AdmissionTicket {
  readonly venueId: string
  /** The one on the purchase: what was sold. */
  readonly venueName: string
  readonly city: string
  readonly eventDate: CalendarDate
}

export interface AdmissionInput {
  /** `absent` with the short code, which carries no signature. */
  readonly signature: 'valid' | 'invalid' | 'absent'
  /** The ticket the database found by its id, or null. */
  readonly ticket: AdmissionTicket | null
  /** The venue of the open gate. */
  readonly gateVenue: VenueBase
  /** The day and time from the server clock. */
  readonly today: CalendarDate
  readonly now: TimeOfDay
}

/** What accompanies a rejection in "Última lectura": the fact that explains it. */
export type AdmissionDetail =
  | { readonly kind: 'venue', readonly venueName: string, readonly city: string }
  | { readonly kind: 'date', readonly eventDate: CalendarDate }
  | { readonly kind: 'hours', readonly hours: OpeningHours }

export type AdmissionDecision =
  | { readonly ok: true, readonly result: Result }
  | { readonly ok: false, readonly result: Result, readonly detail: AdmissionDetail | null }

const refuse = (result: Result, detail: AdmissionDetail | null = null): AdmissionDecision => ({ ok: false, result, detail })

/**
 * Steps 2 to 6 of RN-ACC-03, in order; the first one wins:
 * 2. an invalid signature → `ERR_TICKET_NOT_AUTHENTIC`, before looking anything
 *    up: the response does not say whether that id exists;
 * 3. no ticket → `ERR_TICKET_NOT_FOUND`, also for a validly signed QR after
 *    `db:reset`: PALCO did sign it, so it is not "not authentic";
 * 4. another venue → `ERR_TICKET_OTHER_VENUE`, with the venue and the city;
 * 5. another date → `ERR_TICKET_WRONG_DATE`, with the event's date;
 * 6. outside the venue's hours for today (`applicableHours`, RN-APE-12) →
 *    `ERR_GATE_OUTSIDE_HOURS`, with the hours. The current time is compared, not
 *    the event's: RN-ACC-03 says "today's applicable hours".
 */
export function evaluateAdmission(input: AdmissionInput): AdmissionDecision {
  if (input.signature === 'invalid') return refuse(err('ERR_TICKET_NOT_AUTHENTIC'))

  const ticket = input.ticket
  if (ticket === null) return refuse(err('ERR_TICKET_NOT_FOUND'))

  if (ticket.venueId !== input.gateVenue.id) {
    return refuse(err('ERR_TICKET_OTHER_VENUE'), { kind: 'venue', venueName: ticket.venueName, city: ticket.city })
  }

  if (compareDates(ticket.eventDate, input.today) !== 0) {
    return refuse(err('ERR_TICKET_WRONG_DATE'), { kind: 'date', eventDate: ticket.eventDate })
  }

  if (!evaluateOpeningHours(input.gateVenue, input.today, input.now).ok) {
    return refuse(err('ERR_GATE_OUTSIDE_HOURS'), { kind: 'hours', hours: applicableHours(input.gateVenue, input.today) })
  }

  return { ok: true, result: ok() }
}

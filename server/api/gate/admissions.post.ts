import { admitTicket } from '../../db/admissions.repository'
import { findPurchaseByTicket } from '../../db/purchases.repository'
import { gateConfig } from '../../data/gate'
import { evaluateAdmission, parseAdmissionCode } from '../../domain/admission'
import { err, type Result } from '../../domain/result'
import { encodeBase32, formatShortCode } from '../../domain/ticket'
import { readJsonBody } from '../../utils/account'
import { admissionDetailText, admittedTicketView } from '../../utils/admission-view'
import { currentGateVenue } from '../../utils/gate-session'
import { isPlainRecord } from '../../utils/shape'
import { ticketSigner } from '../../utils/ticket-signing'
import { toCalendarDate } from '../../../utils/date'
import type { AdmissionResponse } from '../../../types'

/** The longest thing read is a QR, 123 characters; anything longer is not a ticket. */
const MAX_CODE_LENGTH = 200

const refusal = (result: Result, extra: { detail?: string | null, shortCode?: string | null, admittedAt?: Date | null } = {}): AdmissionResponse => ({
  ok: false,
  code: result.code,
  message: result.message,
  detail: extra.detail ?? null,
  shortCode: extra.shortCode ?? null,
  admittedAt: extra.admittedAt ? extra.admittedAt.toISOString() : null,
})

/**
 * Admits a ticket at the open gate (RN-ACC-03 and 04). It does not require the
 * buyer's session. Fixed order, the first one that applies wins:
 *
 * 1. Not configured → 503.
 * 2. No open gate → 401 `ERR_GATE_CLOSED`.
 * 3. Body shape: exactly `{ code }`, text of 1 to 200 characters → 400.
 * 4. Code shape (RN-ACC-03, 1) → 400 `ERR_TICKET_CODE_FORMAT`.
 * 5. The signature, QR only (2): an invalid one answers without looking up the ticket.
 * 6. The ticket, the venue, the date and the hours (3 to 6), with the server clock.
 *    A missing ticket is 404; the other rejections, 400.
 * 7. The admission (7): the database decides. 201 admitted, or 409 with the first time.
 */
export default defineEventHandler(async (event): Promise<AdmissionResponse> => {
  if (!gateConfig()) {
    setResponseStatus(event, 503)
    return refusal(err('ERR_GATE_UNAVAILABLE'))
  }
  const gateVenue = await currentGateVenue(event)
  if (!gateVenue) {
    setResponseStatus(event, 401)
    return refusal(err('ERR_GATE_CLOSED'))
  }

  const body = await readJsonBody(event)
  const keys = isPlainRecord(body) ? Object.keys(body) : []
  const text = isPlainRecord(body) ? body.code : undefined
  if (keys.length !== 1 || typeof text !== 'string' || text.length < 1 || text.length > MAX_CODE_LENGTH) {
    setResponseStatus(event, 400)
    return refusal(err('ERR_INPUT_INVALID'))
  }

  const code = parseAdmissionCode(text)
  if (!code.ok) {
    setResponseStatus(event, 400)
    return refusal(code.result)
  }

  // The server clock, read once: it decides the day, the hours and the admission time.
  const now = new Date()
  const clock = { today: toCalendarDate(now), now: { hour: now.getHours(), minute: now.getMinutes() } }

  const signature = code.value.kind === 'qr'
    ? (ticketSigner().verify(code.value.id, code.value.signature) ? 'valid' : 'invalid')
    : 'absent'
  // With an invalid signature nothing is looked up: the response neither says nor
  // shows whether the id exists.
  const found = signature === 'invalid' ? null : await findPurchaseByTicket(encodeBase32(code.value.id))
  const shortCode = signature === 'invalid' ? null : formatShortCode(code.value.id)
  const shown = shortCode?.ok ? shortCode.value : null

  const decision = evaluateAdmission({
    signature,
    ticket: found ? { venueId: found.purchase.venueId, venueName: found.purchase.venueName, city: found.purchase.city, eventDate: found.purchase.date } : null,
    gateVenue,
    ...clock,
  })
  if (!decision.ok) {
    setResponseStatus(event, decision.result.code === 'ERR_TICKET_NOT_FOUND' ? 404 : 400)
    return refusal(decision.result, {
      detail: decision.detail ? admissionDetailText(decision.detail, found?.purchase ?? null) : null,
      shortCode: shown,
    })
  }
  // When the ticket was found, the domain only admits with `found` present.
  if (!found || shown === null) {
    setResponseStatus(event, 404)
    return refusal(err('ERR_TICKET_NOT_FOUND'), { shortCode: shown })
  }

  const admission = await admitTicket(encodeBase32(code.value.id), now)
  if (admission === null) {
    setResponseStatus(event, 404)
    return refusal(err('ERR_TICKET_NOT_FOUND'), { shortCode: shown })
  }
  if (!admission.admitted) {
    setResponseStatus(event, 409)
    return refusal(err('ERR_TICKET_ALREADY_USED'), { shortCode: shown, admittedAt: admission.at })
  }

  setResponseStatus(event, 201)
  return { ok: true, ticket: admittedTicketView(found.purchase, found.number, shown), admittedAt: admission.at.toISOString() }
})

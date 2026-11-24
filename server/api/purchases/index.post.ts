import { findLoadedVenue } from '../../data/venues'
import { err } from '../../domain/result'
import {
  isRequestId,
  parsePaymentInput,
  parseTicketsInput,
  purchaseFingerprint,
} from '../../utils/purchase-request'
import { settlePurchase } from '../../utils/purchase-record'
import { startTicketsSend, ticketsSendDeps } from '../../utils/whatsapp-start'
import { toCalendarDate } from '../../../utils/date'
import type { PurchaseFailure, PurchaseResponse, PurchaseStep } from '../../../types'

interface PurchaseBody {
  requestId?: unknown
  venueId?: unknown
  tickets?: unknown
  payment?: unknown
}

function isBody(value: unknown): value is PurchaseBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(
  step: PurchaseStep | null,
  field: string | null,
  seatIndex: number | null,
  result: { readonly code: PurchaseFailure['code']; readonly message: string },
): PurchaseFailure {
  return { ok: false, step, field, seatIndex, code: result.code, message: result.message }
}

/**
 * Confirms a purchase: validates the tickets and the payment again on the server,
 * with its own clock, and only then deducts and records (RN-CON-01 to 03). The user
 * comes from the session, never from the body (RN-SEG-01). Any validation
 * rejection, of shape or of domain, is a 400, as in the login.
 *
 * It is idempotent per `requestId` (RN-CON-07): retrying an already recorded
 * purchase answers 200 with its folio, without validating or deducting again.
 */
export default defineEventHandler(async (event): Promise<PurchaseResponse> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  // `readBody` throws its own 400 "Invalid JSON body", with another shape: it is
  // caught so that every 400 is a `PurchaseFailure`.
  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    setResponseStatus(event, 400)
    return failure(null, null, null, err('ERR_INPUT_INVALID'))
  }
  if (!isBody(body) || typeof body.venueId !== 'string') {
    setResponseStatus(event, 400)
    return failure(null, null, null, err('ERR_INPUT_INVALID'))
  }

  const requestId = body.requestId
  if (!isRequestId(requestId)) {
    setResponseStatus(event, 400)
    return failure(null, 'requestId', null, err('ERR_INPUT_INVALID'))
  }

  const venue = findLoadedVenue(body.venueId)
  if (!venue) {
    throw createError({ statusCode: 404, message: 'Recinto inexistente' })
  }

  const tickets = parseTicketsInput(venue.category, body.tickets)
  if (!tickets.ok) {
    setResponseStatus(event, 400)
    return failure('tickets', tickets.field, tickets.seatIndex, tickets.result)
  }

  const payment = parsePaymentInput(body.payment)
  if (!payment.ok) {
    setResponseStatus(event, 400)
    return failure('payment', payment.field, payment.seatIndex, payment.result)
  }

  // The retry, the limit, availability, the folio and the record are decided in one
  // transaction, under the venue and folio locks. The date comes from the server
  // clock, the authoritative one: a page opened before midnight and confirmed after
  // it gives ERR_DATE_PAST.
  const fingerprint = purchaseFingerprint(venue.id, tickets.value, payment.value)
  const outcome = await settlePurchase({
    userId,
    venue,
    requestId,
    fingerprint,
    tickets: tickets.value,
    payment: payment.value,
    today: toCalendarDate(new Date()),
  })

  if (outcome.kind === 'replay') {
    setResponseStatus(event, 200)
    return { ok: true, folio: outcome.folio }
  }
  if (outcome.kind === 'conflict') {
    setResponseStatus(event, 400)
    return failure(null, 'requestId', null, err('ERR_INPUT_INVALID'))
  }
  if (outcome.kind === 'rejected') {
    setResponseStatus(event, 400)
    return failure(outcome.step, outcome.field, outcome.seatIndex, outcome.result)
  }
  if (outcome.kind === 'ticketsNotIssued') {
    throw createError({ statusCode: 500, message: 'No se pudieron emitir los boletos' })
  }
  // Nothing is left behind: neither the folio is consumed nor the key stored, so a
  // retry with the same `requestId` is a new purchase (PU10).
  if (outcome.kind === 'notRecorded') {
    console.error(JSON.stringify({
      event: 'purchase',
      recorded: false,
      error: outcome.error instanceof Error ? outcome.error.message : 'desconocido',
    }))
    setResponseStatus(event, 500)
    return failure(null, null, null, err('ERR_PURCHASE_NOT_RECORDED'))
  }

  // The automatic send (RF-ENV-04) starts at the end, with the purchase already
  // recorded, and does not condition it (RN-ENV-02): no result or exception changes
  // the response. It counts towards RN-ENV-04 like any other started send. The
  // idempotent retry answered above and never gets here. It runs after COMMIT: the
  // send is not part of the transaction and does not extend its locks.
  const { purchase } = outcome
  const { folio } = purchase
  try {
    const sent = await startTicketsSend(userId, purchase, Date.now(), ticketsSendDeps())
    console.info(JSON.stringify({ event: 'whatsapp', folio, automatic: sent.kind }))
  }
  catch (error) {
    console.error(JSON.stringify({ event: 'whatsapp', folio, automatic: 'error', error: error instanceof Error ? error.message : 'desconocido' }))
  }

  setResponseStatus(event, 201)
  return { ok: true, folio }
})

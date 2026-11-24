import { findPurchaseByFolio } from '../../../db/purchases.repository'
import { isFolio } from '../../../domain/confirmation'
import { err, type ResultCode } from '../../../domain/result'
import type { WhatsappSendRejection, WhatsappSendStatus } from '../../../../types'

function rejection(code: ResultCode): WhatsappSendRejection {
  const result = err(code)
  return { ok: false, code: result.code, message: result.message }
}

/**
 * "Enviar a WhatsApp" (RF-ENV-03): starts the send and answers 202; the status is
 * polled with the GET. The decision is `startTicketsSend`'s, the same as for the
 * automatic send.
 */
export default defineEventHandler(async (event): Promise<WhatsappSendStatus | WhatsappSendRejection> => {
  const userId = await requireAccountUserId(event)
  const folio = getRouterParam(event, 'folio') ?? ''
  const purchase = isFolio(folio) ? await findPurchaseByFolio(userId, folio) : null
  if (!purchase) throw createError({ statusCode: 404, message: 'Compra inexistente' })

  const now = Date.now()
  const started = await startTicketsSend(userId, purchase, now, ticketsSendDeps())
  if (started.kind === 'unavailable') {
    setResponseStatus(event, 503)
    return rejection('ERR_WHATSAPP_UNAVAILABLE')
  }
  if (started.kind === 'notRegistered') {
    setResponseStatus(event, 409)
    return rejection('ERR_WHATSAPP_NOT_REGISTERED')
  }
  if (started.kind === 'limited') {
    setResponseStatus(event, 429)
    setResponseHeader(event, 'Retry-After', started.retryAfterSeconds)
    return { ok: false, code: started.result.code, message: started.result.message }
  }

  setResponseStatus(event, 202)
  return await whatsappSendStatus(userId, folio, now)
})

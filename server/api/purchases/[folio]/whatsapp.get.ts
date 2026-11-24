import { findPurchaseByFolio } from '../../../db/purchases.repository'
import { isFolio } from '../../../domain/confirmation'
import type { WhatsappSendStatus } from '../../../../types'

/**
 * The WhatsApp send status of one of the user's purchases. A malformed, missing or
 * foreign folio gives the same 404 (RN-ENV-05).
 */
export default defineEventHandler(async (event): Promise<WhatsappSendStatus> => {
  const userId = await requireAccountUserId(event)
  const folio = getRouterParam(event, 'folio') ?? ''
  if (!isFolio(folio) || !(await findPurchaseByFolio(userId, folio))) {
    throw createError({ statusCode: 404, message: 'Compra inexistente' })
  }
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return await whatsappSendStatus(userId, folio, Date.now())
})

import { findPurchaseByFolio, findTicketsByFolio } from '../../db/purchases.repository'
import { isFolio } from '../../domain/confirmation'
import { ticketSigner } from '../../utils/ticket-signing'
import { toTicketViews } from '../../utils/ticket-views'
import type { PurchaseDetail } from '../../../types'

/**
 * One of the user's purchases with its tickets (RF-ENV-07). A malformed, missing
 * or foreign folio gives the same 404: telling them apart would reveal which folios
 * were issued (RN-CON-06). Each QR is a bearer credential: the response is never
 * cached.
 */
export default defineEventHandler(async (event): Promise<PurchaseDetail> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  const folio = getRouterParam(event, 'folio') ?? ''
  const purchase = isFolio(folio) ? await findPurchaseByFolio(userId, folio) : null
  const ids = purchase ? await findTicketsByFolio(userId, folio) : null
  if (!purchase || !ids) {
    throw createError({ statusCode: 404, message: 'Compra inexistente' })
  }

  // `sign` only receives ids from the store, which `issueTickets` issued.
  const tickets = toTicketViews(purchase, ids, ticketSigner().sign)
  if (!tickets) {
    throw createError({ statusCode: 500, message: 'Boleto mal formado en el almacén' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { ...purchase, tickets }
})

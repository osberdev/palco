import { listPurchases } from '../../db/purchases.repository'
import type { PurchasesResponse } from '../../../types'

/** The session user's purchases, most recent first. */
export default defineEventHandler(async (event): Promise<PurchasesResponse> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  return { purchases: await listPurchases(userId) }
})

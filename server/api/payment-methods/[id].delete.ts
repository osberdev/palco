import { getDatabase } from '../../db/client'
import { lockUser } from '../../db/locks'
import { deletePaymentMethod, findPaymentMethod } from '../../db/payment-methods.repository'

/** Deletes one of the user's methods (RF-MET-06). Same 404 as editing for someone else's id. */
export default defineEventHandler(async (event): Promise<{ readonly ok: true }> => {
  const userId = await requireAccountUserId(event)
  const id = getRouterParam(event, 'id')

  // Under the same lock as editing: either the edit goes first, or this answers 404.
  const deleted = isUuid(id) && await getDatabase().withTransaction(async (tx) => {
    await lockUser(tx, userId)
    const current = await findPaymentMethod(userId, id, tx)
    if (current === null) return false
    await deletePaymentMethod(userId, current.id, tx)
    return true
  })
  if (!deleted) {
    throw createError({ statusCode: 404, message: 'Método de pago inexistente' })
  }

  return { ok: true }
})

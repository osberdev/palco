import { getDatabase } from '../../db/client'
import { lockUser } from '../../db/locks'
import { findPaymentMethod, listPaymentMethods, updatePaymentMethod } from '../../db/payment-methods.repository'
import { err, type Result } from '../../domain/result'
import { evaluateSavedMethodEdit } from '../../domain/saved-payment'
import { parseSavedMethodChanges } from '../../utils/payment-method-request'
import { toCalendarDate } from '../../../utils/date'
import type { SavedMethodField, SavedMethodResponse } from '../../../types'

const failure = (field: SavedMethodField | null, result: Result): SavedMethodResponse =>
  ({ ok: false, field, code: result.code, message: result.message })

/**
 * Edits a card's holder and expiry, or the PayPal email. A malformed, missing or
 * foreign id gives the same 404: telling them apart would reveal which methods
 * exist (RN-CON-06, RN-SEG-01).
 */
export default defineEventHandler(async (event): Promise<SavedMethodResponse> => {
  const userId = await requireAccountUserId(event)
  const id = getRouterParam(event, 'id')
  const body = await readJsonBody(event)

  // Read, decide and write in one transaction, under the user lock: two edits cannot
  // create a duplicate together, and an already deleted row is not edited.
  const response = isUuid(id)
    ? await getDatabase().withTransaction(async (tx): Promise<SavedMethodResponse | null> => {
        await lockUser(tx, userId)
        const current = await findPaymentMethod(userId, id, tx)
        if (current === null) return null

        const changes = parseSavedMethodChanges(current, body)
        if (changes === null) return failure(null, err('ERR_INPUT_INVALID'))

        const others = (await listPaymentMethods(userId, tx)).filter((method) => method.id !== current.id)
        const decided = evaluateSavedMethodEdit(current, changes, others, toCalendarDate(new Date()))
        if (!decided.ok) return failure(decided.field, decided.result)

        return { ok: true, method: await updatePaymentMethod(userId, current.id, decided.method, tx) }
      })
    : null
  if (response === null) {
    throw createError({ statusCode: 404, message: 'Método de pago inexistente' })
  }

  if (!response.ok) setResponseStatus(event, 400)
  return response
})

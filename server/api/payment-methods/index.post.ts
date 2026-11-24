import { getDatabase } from '../../db/client'
import { lockUser } from '../../db/locks'
import { countAdditionsOn, insertPaymentMethod, listPaymentMethods } from '../../db/payment-methods.repository'
import { err, type Result } from '../../domain/result'
import { evaluateNewSavedMethod, type NewSavedMethodInput } from '../../domain/saved-payment'
import { formatIsoDate, toCalendarDate } from '../../../utils/date'
import type { PaymentMethod, SavedMethodField, SavedMethodResponse } from '../../../types'

const TEXT_FIELDS = ['cardNumber', 'holder', 'expiry', 'email'] as const

const failure = (field: SavedMethodField | null, result: Result): SavedMethodResponse =>
  ({ ok: false, field, code: result.code, message: result.message })

/**
 * Saves a method (RF-MET-03). A missing field is `''`, as in the payment; one that
 * is not text is an invalid shape. A `securityCode` in the body is ignored: it is
 * neither read nor stored (RN-MET-04).
 */
export default defineEventHandler(async (event): Promise<SavedMethodResponse> => {
  const userId = await requireAccountUserId(event)

  const body = await readJsonBody(event)
  if (!isPlainRecord(body) || typeof body.method !== 'string') {
    setResponseStatus(event, 400)
    return failure(null, err('ERR_INPUT_INVALID'))
  }
  const texts = { cardNumber: '', holder: '', expiry: '', email: '' }
  for (const key of TEXT_FIELDS) {
    const value = body[key]
    if (value === undefined) continue
    if (typeof value !== 'string') {
      setResponseStatus(event, 400)
      return failure(key, err('ERR_INPUT_INVALID'))
    }
    texts[key] = value
  }
  // The domain rejects a method outside the three with its own field.
  const input: NewSavedMethodInput = { method: body.method as PaymentMethod, ...texts }

  // Read, decide and write in one transaction, under the user lock: the limits and
  // the duplicate check cannot be bypassed with two simultaneous additions. The day
  // for RN-MET-10 is the server's local clock, the same `today` that decides expiry.
  // A rejected addition does not count: only the insert records the day.
  const today = toCalendarDate(new Date())
  const addedOn = formatIsoDate(today)
  const response = await getDatabase().withTransaction(async (tx): Promise<SavedMethodResponse> => {
    await lockUser(tx, userId)
    const decided = evaluateNewSavedMethod(input, await listPaymentMethods(userId, tx), await countAdditionsOn(userId, addedOn, tx), today)
    if (!decided.ok) return failure(decided.field, decided.result)
    return { ok: true, method: await insertPaymentMethod(userId, decided.method, addedOn, tx) }
  })

  setResponseStatus(event, response.ok ? 201 : 400)
  return response
})

import { listPaymentMethods } from '../../db/payment-methods.repository'
import type { PaymentMethodsResponse } from '../../../types'

/** The session user's methods, most recent first (RN-MET-03). */
export default defineEventHandler(async (event): Promise<PaymentMethodsResponse> => {
  const userId = await requireAccountUserId(event)
  return { methods: await listPaymentMethods(userId) }
})

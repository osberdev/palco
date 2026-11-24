import type { SavedMethodChanges } from '../domain/saved-payment'
import type { SavedPaymentMethodData } from '../../types'
import { isPlainRecord } from './shape'

/**
 * The changes `PATCH /api/payment-methods/:id` accepts (RN-MET-05), or null if the
 * body does not have exactly that shape: `holder` and `expiry` for a card, `email`
 * for PayPal, all text. An extra key is an attempt to change something that is not
 * editable (the number, the type), and answering 200 without applying it would
 * tell the client it happened. Creating a method, by contrast, discards
 * `securityCode`.
 */
export function parseSavedMethodChanges(
  current: SavedPaymentMethodData,
  body: unknown,
): SavedMethodChanges | null {
  if (!isPlainRecord(body)) return null
  const keys = Object.keys(body)
  if (current.method === 'paypal') {
    const { email } = body
    return keys.length === 1 && typeof email === 'string' ? { email } : null
  }
  const { holder, expiry } = body
  return keys.length === 2 && typeof holder === 'string' && typeof expiry === 'string'
    ? { holder, expiry }
    : null
}

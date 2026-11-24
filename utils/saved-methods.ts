import { SAVED_METHODS_LIMIT } from '../server/domain/saved-payment'
import type { SavedPaymentMethodData } from '../types'
import { CARD_BRAND_LABELS, PAYMENT_METHOD_LABELS } from './payment'
import type { TextSegment } from './purchase-view'

/** Line 1: "Tarjeta de crédito Visa" or "PayPal". */
export function savedMethodTitle(method: SavedPaymentMethodData): string {
  return method.method === 'paypal'
    ? PAYMENT_METHOD_LABELS.paypal
    : `${PAYMENT_METHOD_LABELS[method.method]} ${CARD_BRAND_LABELS[method.brand]}`
}

/**
 * "N de 3 métodos guardados", with figures in mono, and with 3 the limit clause.
 * With 0 it is not shown: the empty state says it.
 */
export function savedMethodsCount(count: number): readonly TextSegment[] {
  const segments: TextSegment[] = [
    { text: String(count), mono: true },
    { text: 'de' },
    { text: String(SAVED_METHODS_LIMIT), mono: true },
    { text: 'métodos guardados' },
  ]
  if (count >= SAVED_METHODS_LIMIT) segments.push({ text: '· elimina uno para agregar otro' })
  return segments
}

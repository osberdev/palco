import { TICKET_ID_BYTES, decodeBase32, formatQrPayload, formatShortCode } from '../domain/ticket'
import type { IssuedTicketView, Purchase } from '../../types'

/**
 * A purchase's tickets as their owner sees them: short code and signed QR, in store
 * order, with seat N for cinemas (RF-ENV-07). The signature arrives as a function so
 * it can be tested without the per-run key. An id that is not from the store gives
 * null: it is a server defect, not an input.
 */
export function toTicketViews(
  purchase: Purchase,
  ids: readonly string[],
  sign: (id: Uint8Array) => Uint8Array,
): readonly IssuedTicketView[] | null {
  const views: IssuedTicketView[] = []
  for (const [index, stored] of ids.entries()) {
    const id = decodeBase32(stored, TICKET_ID_BYTES)
    if (!id.ok) return null
    const shortCode = formatShortCode(id.value)
    const qrPayload = formatQrPayload(id.value, sign(id.value))
    if (!shortCode.ok || !qrPayload.ok) return null
    const number = index + 1
    views.push({
      number,
      shortCode: shortCode.value,
      qrPayload: qrPayload.value,
      seat: purchase.category === 'cine' ? (purchase.seats[number - 1] ?? null) : null,
    })
  }
  return views
}

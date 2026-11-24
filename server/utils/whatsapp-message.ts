import type { Purchase } from '../../types'
import { formatCalendarDate, formatClock, formatMoney, formatWeekday } from '../../utils/format'
import { ticketCountLabel } from '../../utils/purchase-view'
import { paymentLabel } from '../../utils/ticket-pages'
import { isTicketTemplateName, type TicketTemplateName } from './whatsapp-templates'

/**
 * A template parameter as Meta accepts it: Meta rejects parameters with line
 * breaks, tabs or more than four consecutive spaces. Every run of whitespace
 * becomes a single space, and the ends are trimmed. With today's data nothing
 * changes; it protects the buyer name in the v2 template, which the user types.
 */
export function templateText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/**
 * The four original texts, kept so that `palco_boletos` can still be used. v2 adds
 * the buyer at the start and the total with the method at the end.
 */
function originalParameters(purchase: Purchase): readonly string[] {
  const weekday = formatWeekday(purchase.date).toLocaleLowerCase('es-MX')
  return [
    purchase.folio,
    ticketCountLabel(purchase.quantity),
    purchase.venueName,
    `${weekday} ${formatCalendarDate(purchase.date)} a las ${formatClock(purchase.time)}`,
  ]
}

/** The template parameters, or the reason they cannot be built. */
export type TemplateParameters =
  | { readonly ok: true; readonly body: readonly string[] }
  | { readonly ok: false; readonly reason: 'unknown-template' | 'missing-buyer' }

/** `null` if the template is missing a value; the buyer arrives already cleaned. */
const PARAMETER_BUILDERS: Readonly<Record<TicketTemplateName, (purchase: Purchase, buyerName: string) => readonly string[] | null>> = {
  palco_boletos: (purchase) => originalParameters(purchase),
  palco_boletos_v2: (purchase, buyerName) => buyerName
    ? [buyerName, ...originalParameters(purchase), `${formatMoney(purchase.amount, purchase.currency)} con ${paymentLabel(purchase.payment)}`]
    : null,
}

/**
 * Selects by name, in the order approved by Meta, and cleans every text. It does
 * not throw: the send decides what to do with an impossible message. The original
 * template ignores the buyer.
 */
export function whatsappTemplateParameters(purchase: Purchase, template: string, buyerName: string): TemplateParameters {
  if (!isTicketTemplateName(template)) return { ok: false, reason: 'unknown-template' }
  const parameters = PARAMETER_BUILDERS[template](purchase, templateText(buyerName))
  if (parameters === null) return { ok: false, reason: 'missing-buyer' }
  return { ok: true, body: parameters.map(templateText) }
}

/** The document name in the chat: it identifies the document, without a thumbnail. */
export function whatsappDocumentName(purchase: Purchase): string {
  return `PALCO-${purchase.folio}.pdf`
}

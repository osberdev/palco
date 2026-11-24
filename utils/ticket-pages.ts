import type { PaymentSummary } from '../server/domain/payment'
import type { Purchase } from '../types'
import { CINEMA_FORMAT_NAMES } from './cinema'
import { formatEventDate, formatMoney, formatWeekday } from './format'
import { CARD_BRAND_LABELS, PAYMENT_METHOD_LABELS } from './payment'
import { beforeAttending, museumFeeLabel, ticketCountLabel, type AttendanceNote } from './purchase-view'

/**
 * The content of each printed ticket page (RN-BOL-04): one per ticket. It is
 * presentation of a recorded purchase, like `purchase-view.ts`, and
 * `server/utils/ticket-pdf.ts` only draws it. It carries the payment method, the
 * purchase total and the purchase's ticket count, and nothing else about the
 * payment: neither the masked number, nor the holder, nor the email (RNF-15). The
 * PDF gets forwarded, and each page goes to a different person.
 */

export interface TicketPageInput {
  readonly number: number
  readonly shortCode: string
  readonly qrPayload: string
}

export interface TicketPageCell {
  readonly label: string
  readonly value: string
}

export interface TicketPage {
  readonly categoryLabel: string
  readonly title: string
  /** 'Sábado 21 nov 2026, 19:45'. */
  readonly eventDate: string
  /**
   * '{venue} · {city}', or just the city when the venue is already the title.
   * Without the currency.
   */
  readonly venueLine: string
  readonly qrPayload: string
  readonly shortCode: string
  readonly ticketLabel: string
  readonly cells: readonly TicketPageCell[]
  readonly folio: string
  readonly buyer: string
  /** 'Tarjeta de crédito Visa' or 'PayPal'. */
  readonly paymentLabel: string
  /** The total of the whole purchase, not of this ticket: 'USD 90.00'. */
  readonly totalLabel: string
  /**
   * The tickets of the whole purchase: '3 boletos', '1 boleto'. "Boleto N de M"
   * already implies it, but RN-BOL-04 requires stating it.
   */
  readonly quantityLabel: string
  readonly notes: readonly AttendanceNote[]
  readonly footer: string
}

export const TICKET_FOOTER = 'PALCO · Presenta este boleto impreso o en tu teléfono. Cada boleto admite un solo ingreso.'

function ticketTitle(purchase: Purchase): string {
  switch (purchase.category) {
    case 'teatro':
      return purchase.play
    case 'cine':
      return purchase.film.title
    case 'museo':
      return purchase.venueName
  }
}

/** What is specific to each ticket. For cinemas, ticket N's seat is the purchase's Nth seat. */
export function ticketCells(purchase: Purchase, number: number): readonly TicketPageCell[] {
  switch (purchase.category) {
    case 'teatro':
      return [{ label: 'SECCIÓN', value: purchase.section.name }]
    case 'cine':
      return [
        { label: 'FORMATO', value: CINEMA_FORMAT_NAMES[purchase.formatId] },
        { label: 'ASIENTO', value: String(purchase.seats[number - 1]) },
      ]
    case 'museo':
      return [{ label: 'TARIFA', value: museumFeeLabel(purchase) }]
  }
}

/**
 * The method and, for a card, the brand. The summary also carries the masked number
 * and the holder, or the email, and they never leave this module (RNF-15).
 */
export function paymentLabel(payment: PaymentSummary): string {
  if (payment.method === 'paypal') return PAYMENT_METHOD_LABELS.paypal
  return `${PAYMENT_METHOD_LABELS[payment.method]} ${CARD_BRAND_LABELS[payment.brand]}`
}

/**
 * The venue is not repeated if it is already the title, as with museums: "Museo del
 * Louvre" on top and "París, Francia" below. It compares texts rather than the
 * category, so it works for any venue whose name is the title.
 */
function venueLine(purchase: Purchase, title: string): string {
  return purchase.venueName === title ? purchase.city : `${purchase.venueName} · ${purchase.city}`
}

export function ticketPages(purchase: Purchase, tickets: readonly TicketPageInput[], buyerName: string): readonly TicketPage[] {
  const title = ticketTitle(purchase)
  const shared = {
    categoryLabel: purchase.category.toLocaleUpperCase('es-MX'),
    title,
    eventDate: `${formatWeekday(purchase.date)} ${formatEventDate(purchase.date, purchase.time)}`,
    venueLine: venueLine(purchase, title),
    folio: purchase.folio,
    buyer: `A nombre de ${buyerName}`,
    paymentLabel: paymentLabel(purchase.payment),
    totalLabel: formatMoney(purchase.amount, purchase.currency),
    quantityLabel: ticketCountLabel(purchase.quantity),
    notes: beforeAttending(purchase),
    footer: TICKET_FOOTER,
  }
  return tickets.map((ticket) => ({
    ...shared,
    qrPayload: ticket.qrPayload,
    shortCode: ticket.shortCode,
    ticketLabel: `Boleto ${ticket.number} de ${purchase.quantity}`,
    cells: ticketCells(purchase, ticket.number),
  }))
}

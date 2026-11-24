import type { PaymentSummary } from '../server/domain/payment'
import type { Cents, CinemaPurchase, MuseumPurchase, Purchase } from '../types'
import { CINEMA_FORMAT_NAMES } from './cinema'
import { formatCalendarDate, formatEventDate, formatMoney, formatWeekday } from './format'
import { CARD_BRAND_LABELS, PAYMENT_METHOD_LABELS } from './payment'

/**
 * Presentation of a recorded purchase: the confirmation and the "Mis boletos" rows.
 * Pure functions over `Purchase`; the components only draw them.
 */

/**
 * A text segment. Figures are set in mono even when they share a line with text,
 * so anything that mixes the two is delivered in segments. `muted` is the holder,
 * in --ink-500 next to the masked number.
 */
export interface TextSegment {
  readonly text: string
  readonly mono?: boolean
  readonly muted?: boolean
}

/** The segments as they are read, separated by a space. */
export function segmentsText(segments: readonly TextSegment[]): string {
  return segments.map((segment) => segment.text).join(' ')
}

/** '1 boleto', '3 boletos'. */
export function ticketCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'boleto' : 'boletos'}`
}

/** '1 compra'; with more, the order of the list. */
export function purchasesCountLabel(count: number): string {
  return count === 1 ? '1 compra' : `${count} compras · la más reciente primero`
}

/** 'Tarifa general' or 'Tarifa residente', on the confirmation and the printed ticket. */
export function museumFeeLabel(purchase: MuseumPurchase): string {
  return purchase.feeKind === 'resident' ? 'Tarifa residente' : 'Tarifa general'
}

function formatName(purchase: CinemaPurchase): string {
  return CINEMA_FORMAT_NAMES[purchase.formatId]
}

/**
 * The confirmation title. For museums, without an article: there is no data about
 * the gender or number of the venue's name.
 */
export function purchaseHeading(purchase: Purchase): string {
  const tickets = ticketCountLabel(purchase.quantity)
  switch (purchase.category) {
    case 'teatro':
      return `${tickets} para ${purchase.play}`
    case 'cine':
      return `${tickets} para ${purchase.film.title}`
    case 'museo':
      return `${tickets} · ${purchase.venueName}`
  }
}

/** 'Teatro alla Scala · Milán, Italia · EUR'. */
export function purchaseVenueLine(purchase: Purchase): string {
  return `${purchase.venueName} · ${purchase.city} · ${purchase.currency}`
}

export interface PurchaseDetailCell {
  readonly label: string
  readonly value: string
  readonly note: readonly TextSegment[] | null
  /** The value is a figure or a date. */
  readonly mono: boolean
  /** Spans two columns, like the event date. */
  readonly wide: boolean
}

function cell(label: string, value: string, mono: boolean, note: readonly TextSegment[] | null = null): PurchaseDetailCell {
  return { label, value, note, mono, wide: false }
}

function perTicket(amount: Cents, purchase: Purchase): readonly TextSegment[] {
  return [{ text: formatMoney(amount, purchase.currency), mono: true }, { text: 'por boleto' }]
}

/**
 * The cells of the ticket card: the date for every category and then what is
 * specific to each one. Without a quantity cell, which the header and the ticket
 * navigator already state. "Asiento" is singular with one ticket.
 */
export function purchaseDetailCells(purchase: Purchase): readonly PurchaseDetailCell[] {
  const single = purchase.quantity === 1
  const shared: PurchaseDetailCell[] = [
    {
      label: 'Fecha del evento',
      value: formatEventDate(purchase.date, purchase.time),
      note: [{ text: formatWeekday(purchase.date) }],
      mono: true,
      wide: true,
    },
  ]

  switch (purchase.category) {
    case 'teatro':
      return [...shared, cell('Sección', purchase.section.name, false, perTicket(purchase.section.price, purchase))]
    case 'cine':
      return [
        ...shared,
        cell('Película', purchase.film.title, false, [
          { text: `${purchase.film.classification} ·` },
          { text: String(purchase.film.durationMinutes), mono: true },
          { text: 'min' },
        ]),
        cell('Formato', formatName(purchase), false, perTicket(purchase.formatPrice, purchase)),
        cell(single ? 'Asiento' : 'Asientos', purchase.seats.join(', '), true),
      ]
    case 'museo':
      return [...shared, cell('Tarifa', museumFeeLabel(purchase), false, perTicket(purchase.fee, purchase))]
  }
}

export interface BreakdownLine {
  readonly label: readonly TextSegment[]
  readonly amount: string
}

export interface PurchaseBreakdown {
  readonly lines: readonly BreakdownLine[]
  readonly total: string
}

/** The breakdown next to the folio: "N × {unit}", the cinema fee and the total paid. */
export function purchaseBreakdown(purchase: Purchase): PurchaseBreakdown {
  const money = (amount: Cents): string => formatMoney(amount, purchase.currency)
  const units = (name: string, amount: Cents): BreakdownLine => ({
    label: [{ text: `${purchase.quantity} ×`, mono: true }, { text: name }],
    amount: money(amount),
  })

  const lines: BreakdownLine[] = []
  switch (purchase.category) {
    case 'teatro':
      lines.push(units(purchase.section.name, purchase.amount))
      break
    case 'cine':
      lines.push(units(formatName(purchase), purchase.subtotal), {
        label: [{ text: 'Cargo por servicio ·' }, { text: `${purchase.quantity} × ${money(purchase.serviceFee)}`, mono: true }],
        amount: money(purchase.feeTotal),
      })
      break
    case 'museo':
      lines.push(units(museumFeeLabel(purchase), purchase.amount))
      break
  }
  return { lines, total: money(purchase.amount) }
}

/**
 * The two payment lines. With a card, the number is always masked (RNF-15):
 * `PaymentSummary` stores no other.
 */
export function paymentLines(payment: PaymentSummary): readonly [string, readonly TextSegment[]] {
  if (payment.method === 'paypal') return [PAYMENT_METHOD_LABELS.paypal, [{ text: payment.email }]]
  return [
    `${PAYMENT_METHOD_LABELS[payment.method]} ${CARD_BRAND_LABELS[payment.brand]}`,
    [
      { text: payment.maskedNumber, mono: true },
      { text: `· ${payment.holder}`, muted: true },
    ],
  ]
}

/** 'Compra realizada el 3 oct 2026'. */
export function purchasedOnLabel(purchase: Purchase): readonly TextSegment[] {
  return [{ text: 'Compra realizada el' }, { text: formatCalendarDate(purchase.purchasedOn), mono: true }]
}

export interface AttendanceNote {
  readonly label: string
  readonly text: string
}

/** "Antes de asistir": dress code for theaters and entry hours for museums (RF-CON-04 to 06). */
export function beforeAttending(purchase: Purchase): readonly AttendanceNote[] {
  const restrictions: AttendanceNote = { label: 'Restricciones', text: purchase.restrictions }
  switch (purchase.category) {
    case 'teatro':
      return [{ label: 'Vestimenta', text: purchase.dressCode }, restrictions]
    case 'cine':
      return [restrictions]
    case 'museo':
      return [{ label: 'Horario de entrada', text: purchase.entryNote }, restrictions]
  }
}

export interface PurchaseRow {
  readonly folio: string
  readonly category: Purchase['category']
  readonly title: string
  readonly subtitle: string
  readonly amount: string
  /** The event's date and time, not the purchase's. */
  readonly event: string
  readonly tickets: readonly TextSegment[]
}

/** A "Mis boletos" row. */
export function purchaseRow(purchase: Purchase): PurchaseRow {
  const place = `${purchase.venueName} · ${purchase.city}`
  const [title, subtitle] = ((): readonly [string, string] => {
    switch (purchase.category) {
      case 'teatro':
        return [`${purchase.play} · ${purchase.section.name}`, place]
      case 'cine':
        return [`${purchase.film.title} · ${formatName(purchase)}`, place]
      case 'museo':
        return [purchase.venueName, purchase.city]
    }
  })()

  return {
    folio: purchase.folio,
    category: purchase.category,
    title,
    subtitle,
    amount: formatMoney(purchase.amount, purchase.currency),
    event: formatEventDate(purchase.date, purchase.time),
    tickets: [
      { text: String(purchase.quantity), mono: true },
      { text: `${purchase.quantity === 1 ? 'boleto' : 'boletos'} ·` },
      { text: purchase.folio, mono: true },
    ],
  }
}

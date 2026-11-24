import type { AdmissionDetail } from '../domain/admission'
import type { AdmittedTicket, Purchase } from '../../types'
import { formatCalendarDate, formatClock, formatWeekday } from '../../utils/format'
import { ticketCells } from '../../utils/ticket-pages'

/**
 * What the gate shows about an admission. Pure: it receives the already read
 * purchase. Nothing personal and nothing about the payment: neither the buyer, nor
 * the method, nor the QR, which is a bearer credential.
 */
export function admittedTicketView(purchase: Purchase, number: number, shortCode: string): AdmittedTicket {
  return { shortCode, number, quantity: purchase.quantity, folio: purchase.folio, cells: ticketCells(purchase, number) }
}

/**
 * The line under the rejection, such as "Cinépolis · México". The city is the
 * purchase's. The date includes the event time.
 */
export function admissionDetailText(detail: AdmissionDetail, purchase: Purchase | null): string {
  switch (detail.kind) {
    case 'venue':
      return `${detail.venueName} · ${detail.city}`
    case 'date': {
      const day = `${formatWeekday(detail.eventDate)} ${formatCalendarDate(detail.eventDate)}`
      return purchase ? `${day}, ${formatClock(purchase.time)}` : day
    }
    case 'hours':
      return `Abre de ${formatClock(detail.hours.open)} a ${formatClock(detail.hours.close)}`
  }
}

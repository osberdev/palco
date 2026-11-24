import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { confirmPurchase, type TicketsInput } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import type { CinemaSelectionInput, MuseumSelectionInput, TheaterSelectionInput } from '../server/domain/purchase'
import type { CalendarDate, Cents, Purchase } from '../types'
import { formatMoney } from '../utils/format'
import { formatCardSummary } from '../utils/payment'
import { paymentLabel, ticketPages, type TicketPage, type TicketPageInput } from '../utils/ticket-pages'

// The content of each printed ticket page (RN-BOL-04). The purchases are built with
// `confirmPurchase`, as in tests/purchase-view.test.ts, so the shape is the real
// one. Each case carries its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
const BUYER = 'Bruno Téllez Nava'

const SCALA_TICKETS: TheaterSelectionInput = { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '2' }
const CINEPOLIS_TICKETS: CinemaSelectionInput = {
  filmIndex: 3,
  age: '21',
  formatId: 'vip',
  date: '13/11/2026',
  time: '19:00',
  quantity: '2',
  seats: ['12', '13'],
}
// The Met, Saturday November 21 at 19:45, three tickets.
const MET_TICKETS: MuseumSelectionInput = { isResident: false, date: '21/11/2026', time: '19:45', quantity: '3' }

// The holder is not the buyer: that way TP5b tells the holder's name, which must
// not appear, from the buyer's, which must.
const CARD: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const DEBIT: PaymentInput = { ...CARD, method: 'debit', cardNumber: '5555555555554444' }
const PAYPAL: PaymentInput = { ...CARD, method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email: 'ana.rios@ejemplo.mx' }
const PAYMENTS = [CARD, DEBIT, PAYPAL] as const

const USER_LIMITS = { teatro: 10, cine: 10, museo: 5 } as const

function purchase(venueId: string, tickets: TicketsInput, payment: PaymentInput): Purchase {
  const venue = VENUES.find((candidate) => candidate.id === venueId)!
  const confirmation = confirmPurchase(venue, tickets, payment, {
    userLimit: USER_LIMITS[venue.category],
    available: venue.capacity,
    today: TODAY,
    sequence: 1,
  })
  if (!confirmation.ok) throw new Error(`${venueId}: ${confirmation.result.code}`)
  return confirmation.purchase
}

/** Test tickets: the short code and the QR only need to be distinct. */
function tickets(count: number): readonly TicketPageInput[] {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    shortCode: `000${index}-AAAA-BBBB-CCCC`,
    qrPayload: `P1.QR${index}`,
  }))
}

/**
 * The texts the ticket can never carry (RN-BOL-04, RNF-15): sensitive payment data
 * and unit prices. A unit price equal to the total, with a single ticket, does not
 * count: that text does go, as the total.
 */
function forbiddenTexts(bought: Purchase): readonly string[] {
  const amounts: Cents[] = []
  switch (bought.category) {
    case 'teatro':
      amounts.push(bought.section.price)
      break
    case 'cine':
      amounts.push(bought.formatPrice, bought.subtotal, bought.serviceFee, bought.feeTotal)
      break
    case 'museo':
      amounts.push(bought.fee)
      break
  }
  const total = formatMoney(bought.amount, bought.currency)
  const money = amounts.map((amount) => formatMoney(amount, bought.currency)).filter((text) => text !== total)
  const payment = bought.payment.method === 'paypal'
    ? [bought.payment.email]
    : [
        bought.payment.maskedNumber,
        bought.payment.maskedNumber.slice(-4),
        bought.payment.holder,
        formatCardSummary(bought.payment.maskedNumber, bought.payment.brand),
      ]
  return [...money, ...payment, '4111111111111111', '5555555555554444', '987']
}

/** No sensitive data, and the method and the total on every page. */
function expectSafePaymentData(pages: readonly TicketPage[], bought: Purchase): void {
  const serialized = JSON.stringify(pages)
  for (const text of forbiddenTexts(bought)) expect(serialized).not.toContain(text)
  const total = formatMoney(bought.amount, bought.currency)
  // The ticket's only amount is the total.
  for (const amount of serialized.match(/(ARS|EUR|MXN|USD) [\d,]+\.\d{2}/g) ?? []) expect(amount).toBe(total)
  for (const page of pages) {
    expect(page.paymentLabel).toBe(paymentLabel(bought.payment))
    expect(page.totalLabel).toBe(total)
  }
}

const MET = purchase('met', { category: 'museo', input: MET_TICKETS }, CARD)
const CINEPOLIS = purchase('cinepolis', { category: 'cine', input: CINEPOLIS_TICKETS }, CARD)
const SCALA = purchase('teatro-scala', { category: 'teatro', input: SCALA_TICKETS }, CARD)

describe('páginas del boleto', () => {
  // The page carries the method and the total, and with them the currency. The venue
  // line does not repeat the Met's name, which is the title. The page states the
  // purchase quantity (RN-BOL-04).
  it('TP1b: museo con tres boletos, los textos del boleto impreso con el pago y el total', () => {
    const pages = ticketPages(MET, tickets(3), BUYER)
    expect(pages).toHaveLength(3)
    expect(pages[0]).toEqual({
      categoryLabel: 'MUSEO',
      title: 'The Metropolitan Museum of Art',
      eventDate: 'Sábado 21 nov 2026, 19:45',
      venueLine: 'Nueva York, EE.UU.',
      qrPayload: 'P1.QR0',
      shortCode: '0000-AAAA-BBBB-CCCC',
      ticketLabel: 'Boleto 1 de 3',
      cells: [{ label: 'TARIFA', value: 'Tarifa general' }],
      folio: 'PLC-0001-2026',
      buyer: `A nombre de ${BUYER}`,
      paymentLabel: 'Tarjeta de crédito Visa',
      totalLabel: 'USD 90.00',
      quantityLabel: '3 boletos',
      notes: [
        { label: 'Horario de entrada', text: 'Acceso libre dentro del horario de operación' },
        {
          label: 'Restricciones',
          text: 'Prohibidas mochilas de gran tamaño, trípodes y alimentos. El boleto incluye acceso a The Cloisters el mismo día.',
        },
      ],
      footer: 'PALCO · Presenta este boleto impreso o en tu teléfono. Cada boleto admite un solo ingreso.',
    })
    // The currency only goes with the total: the venue line still lacks it.
    expect(pages[0]!.venueLine).not.toContain('USD')
    expect(JSON.stringify(pages).match(/USD/g)).toHaveLength(3)
  })

  it('TP2: cine con dos boletos, la página 2 lleva el segundo asiento', () => {
    const pages = ticketPages(CINEPOLIS, tickets(2), BUYER)
    expect(pages).toHaveLength(2)
    expect(pages[0]!.cells).toEqual([{ label: 'FORMATO', value: 'VIP' }, { label: 'ASIENTO', value: '12' }])
    expect(pages[1]!.cells).toEqual([{ label: 'FORMATO', value: 'VIP' }, { label: 'ASIENTO', value: '13' }])
    expect(pages[1]!.ticketLabel).toBe('Boleto 2 de 2')
    expect(pages[1]!.categoryLabel).toBe('CINE')
    expect(pages[1]!.title).toBe('Insidious')
    expect(pages[1]!.eventDate).toBe('Viernes 13 nov 2026, 19:00')
  })

  it('TP3: teatro, sección y vestimenta antes que restricciones', () => {
    const pages = ticketPages(SCALA, tickets(2), BUYER)
    expect(pages[0]!.categoryLabel).toBe('TEATRO')
    expect(pages[0]!.title).toBe(SCALA.category === 'teatro' ? SCALA.play : '')
    expect(pages[0]!.cells).toEqual([{ label: 'SECCIÓN', value: 'Platea' }])
    expect(pages[0]!.notes.map((note) => note.label)).toEqual(['Vestimenta', 'Restricciones'])
  })

  it('TP4: la página N lleva el código corto y el QR del boleto N', () => {
    const input = tickets(3)
    const pages = ticketPages(MET, input, BUYER)
    pages.forEach((page, index) => {
      expect(page.shortCode).toBe(input[index]!.shortCode)
      expect(page.qrPayload).toBe(input[index]!.qrPayload)
      expect(page.ticketLabel).toBe(`Boleto ${index + 1} de 3`)
    })
  })

  // The method and the total are present; the sensitive data is not.
  it('TP5b: el método y el total, sin datos sensibles del pago (RNF-15)', () => {
    const bases: readonly [string, TicketsInput][] = [
      ['teatro-scala', { category: 'teatro', input: SCALA_TICKETS }],
      ['cinepolis', { category: 'cine', input: CINEPOLIS_TICKETS }],
      ['met', { category: 'museo', input: MET_TICKETS }],
    ]
    for (const [venueId, input] of bases) {
      for (const payment of PAYMENTS) {
        const bought = purchase(venueId, input, payment)
        expectSafePaymentData(ticketPages(bought, tickets(bought.quantity), BUYER), bought)
      }
    }
    const paypal = purchase('met', { category: 'museo', input: MET_TICKETS }, PAYPAL)
    expect(JSON.stringify(ticketPages(paypal, tickets(3), BUYER))).not.toContain('ana.rios@ejemplo.mx')
    expect(ticketPages(paypal, tickets(3), BUYER)[0]!.paymentLabel).toBe('PayPal')
  })

  it('TP9: el total es el de la compra completa y el mismo en todas las páginas', () => {
    // Two VIP tickets at MXN 280.00 with a MXN 6.00 fee each.
    const pages = ticketPages(CINEPOLIS, tickets(2), BUYER)
    expect(pages.map((page) => page.totalLabel)).toEqual(['MXN 572.00', 'MXN 572.00'])
    expect(pages[0]!.totalLabel).toBe(formatMoney(CINEPOLIS.amount, CINEPOLIS.currency))
    expect(pages[0]!.totalLabel).not.toBe(formatMoney(CINEPOLIS.category === 'cine' ? CINEPOLIS.formatPrice : CINEPOLIS.amount, 'MXN'))
  })

  it.each([
    ['TP10a', { method: 'credit', brand: 'visa', maskedNumber: '************1111', holder: 'Ana' }, 'Tarjeta de crédito Visa'],
    ['TP10b', { method: 'credit', brand: 'mastercard', maskedNumber: '************4444', holder: 'Ana' }, 'Tarjeta de crédito Mastercard'],
    ['TP10c', { method: 'debit', brand: 'visa', maskedNumber: '************1111', holder: 'Ana' }, 'Tarjeta de débito Visa'],
    ['TP10d', { method: 'debit', brand: 'mastercard', maskedNumber: '************4444', holder: 'Ana' }, 'Tarjeta de débito Mastercard'],
    ['TP10e', { method: 'paypal', email: 'ana@example.com' }, 'PayPal'],
  ] as const)('%s: el texto de PAGO', (_, payment, expected) => {
    expect(paymentLabel(payment)).toBe(expected)
  })

  it('TP12: la línea del recinto solo repite el nombre cuando no es el título', () => {
    const louvre = purchase('louvre', { category: 'museo', input: { isResident: true, date: '15/10/2026', time: '10:00', quantity: '1' } }, CARD)
    expect(ticketPages(louvre, tickets(1), BUYER)[0]!.title).toBe('Museo del Louvre')
    expect(ticketPages(louvre, tickets(1), BUYER)[0]!.venueLine).toBe('París, Francia')
    expect(ticketPages(MET, tickets(1), BUYER)[0]!.venueLine).toBe('Nueva York, EE.UU.')
    expect(ticketPages(CINEPOLIS, tickets(1), BUYER)[0]!.venueLine).toBe('Cinépolis · México')
    expect(ticketPages(SCALA, tickets(1), BUYER)[0]!.venueLine).toBe('Teatro alla Scala · Milán, Italia')
    // The rule compares texts, not the category: a play named like its theater would
    // not repeat it either.
    if (SCALA.category !== 'teatro') throw new Error('La Scala es un teatro')
    const namesake: Purchase = { ...SCALA, play: 'Teatro alla Scala' }
    expect(ticketPages(namesake, tickets(1), BUYER)[0]!.venueLine).toBe('Milán, Italia')
    // Without the currency, as always.
    for (const bought of [louvre, MET, CINEPOLIS, SCALA]) {
      expect(ticketPages(bought, tickets(1), BUYER)[0]!.venueLine).not.toMatch(/ARS|EUR|MXN|USD/)
    }
  })

  it('TP13: cada página dice la cantidad de la compra, en singular o plural', () => {
    expect(ticketPages(MET, tickets(3), BUYER).map((page) => page.quantityLabel)).toEqual(['3 boletos', '3 boletos', '3 boletos'])
    expect(ticketPages(CINEPOLIS, tickets(2), BUYER).map((page) => page.quantityLabel)).toEqual(['2 boletos', '2 boletos'])
    const one = purchase('louvre', { category: 'museo', input: { isResident: true, date: '15/10/2026', time: '10:00', quantity: '1' } }, CARD)
    expect(ticketPages(one, tickets(1), BUYER).map((page) => page.quantityLabel)).toEqual(['1 boleto'])
    // It is the whole purchase's quantity, not the page's.
    expect(ticketPages(SCALA, tickets(2), BUYER)[1]!.quantityLabel).toBe(`${SCALA.quantity} boletos`)
  })

  it('TP6: la misma compra y los mismos boletos dan las mismas páginas', () => {
    expect(ticketPages(CINEPOLIS, tickets(2), BUYER)).toStrictEqual(ticketPages(CINEPOLIS, tickets(2), BUYER))
  })

  // Debit too, and every page with the method and the total.
  it('INV29: una página por boleto, numeradas de 1 a M, con el método y el total y sin datos sensibles', () => {
    const bases: readonly { readonly venueId: string; readonly tickets: (quantity: number) => TicketsInput; readonly limit: number }[] = [
      { venueId: 'teatro-scala', limit: 10, tickets: (quantity) => ({ category: 'teatro', input: { ...SCALA_TICKETS, quantity: String(quantity) } }) },
      {
        venueId: 'cinepolis',
        limit: 10,
        tickets: (quantity) => ({
          category: 'cine',
          input: { ...CINEPOLIS_TICKETS, quantity: String(quantity), seats: Array.from({ length: quantity }, (_, index) => String(index + 1)) },
        }),
      },
      { venueId: 'met', limit: 5, tickets: (quantity) => ({ category: 'museo', input: { ...MET_TICKETS, quantity: String(quantity) } }) },
    ]
    for (const base of bases) {
      for (let quantity = 1; quantity <= base.limit; quantity++) {
        for (const payment of PAYMENTS) {
          const bought = purchase(base.venueId, base.tickets(quantity), payment)
          const pages = ticketPages(bought, tickets(quantity), BUYER)
          expect(pages).toHaveLength(quantity)
          expect(pages.map((page) => page.ticketLabel)).toEqual(
            Array.from({ length: quantity }, (_, index) => `Boleto ${index + 1} de ${quantity}`),
          )
          expectSafePaymentData(pages, bought)
        }
      }
    }
  })
})

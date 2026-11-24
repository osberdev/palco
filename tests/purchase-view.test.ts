import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { confirmPurchase, type TicketsInput } from '../server/domain/confirmation'
import { cents } from '../server/domain/money'
import type { PaymentInput } from '../server/domain/payment'
import type { CinemaSelectionInput, MuseumSelectionInput, TheaterSelectionInput } from '../server/domain/purchase'
import type { CalendarDate, Purchase } from '../types'
import {
  beforeAttending,
  paymentLines,
  purchaseBreakdown,
  purchaseDetailCells,
  purchaseHeading,
  purchaseRow,
  purchasesCountLabel,
  purchaseVenueLine,
  segmentsText,
  ticketCountLabel,
  type TextSegment,
} from '../utils/purchase-view'

// Presentation of the recorded purchase. The purchases are built with
// `confirmPurchase` and the bases from tests/confirmation.test.ts, so the shape is
// the real one. Each case carries its identifier in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }

// The shared bases.
const B: TheaterSelectionInput = { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '10' }
const K: CinemaSelectionInput = {
  filmIndex: 3,
  age: '21',
  formatId: 'vip',
  date: '10/10/2026',
  time: '19:00',
  quantity: '2',
  seats: ['12', '13'],
}
const M: MuseumSelectionInput = { isResident: true, date: '15/10/2026', time: '10:00', quantity: '3' }
const Y: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}

// Additional bases: Cinemark, one ticket, Mastercard; and the Met with PayPal.
const CINEMARK_ONE: CinemaSelectionInput = {
  filmIndex: 0,
  age: '21',
  formatId: 'xd',
  date: '16/10/2026',
  time: '21:30',
  quantity: '1',
  seats: ['45'],
}
const MET: MuseumSelectionInput = { isResident: false, date: '24/10/2026', time: '18:30', quantity: '2' }
const MASTERCARD_DEBIT: PaymentInput = { ...Y, method: 'debit', cardNumber: '5555555555554444' }
const PAYPAL: PaymentInput = { ...Y, method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email: 'ana.rios@ejemplo.mx' }

const USER_LIMITS = { teatro: 10, cine: 10, museo: 5 } as const

function purchase(venueId: string, tickets: TicketsInput, payment: PaymentInput, sequence = 1): Purchase {
  const venue = VENUES.find((candidate) => candidate.id === venueId)!
  const confirmation = confirmPurchase(venue, tickets, payment, {
    userLimit: USER_LIMITS[venue.category],
    available: venue.capacity,
    today: TODAY,
    sequence,
  })
  if (!confirmation.ok) throw new Error(`${venueId}: ${confirmation.result.code}`)
  return confirmation.purchase
}

const THEATER = purchase('teatro-scala', { category: 'teatro', input: B }, Y, 1)
const CINEMA = purchase('cinepolis', { category: 'cine', input: K }, PAYPAL, 2)
const LOUVRE = purchase('louvre', { category: 'museo', input: M }, { ...Y, method: 'debit' }, 3)
const CINEMARK = purchase('cinemark', { category: 'cine', input: CINEMARK_ONE }, { ...MASTERCARD_DEBIT, method: 'credit' }, 4)
const MET_PURCHASE = purchase('met', { category: 'museo', input: MET }, PAYPAL, 5)

const ALL: readonly Purchase[] = [THEATER, CINEMA, LOUVRE, CINEMARK, MET_PURCHASE]

function cellsByLabel(target: Purchase): Readonly<Record<string, { value: string; note: string | null }>> {
  return Object.fromEntries(
    purchaseDetailCells(target).map((cell) => [cell.label, { value: cell.value, note: cell.note ? segmentsText(cell.note) : null }]),
  )
}

/** All the text `purchase-view` produces for a purchase. */
function everyText(target: Purchase): string {
  const segments = (list: readonly TextSegment[]): string => segmentsText(list)
  const breakdown = purchaseBreakdown(target)
  const [method, detail] = paymentLines(target.payment)
  const row = purchaseRow(target)
  return [
    purchaseHeading(target),
    purchaseVenueLine(target),
    ...purchaseDetailCells(target).flatMap((cell) => [cell.label, cell.value, cell.note ? segments(cell.note) : '']),
    ...breakdown.lines.flatMap((line) => [segments(line.label), line.amount]),
    breakdown.total,
    method,
    segments(detail),
    ...beforeAttending(target).flatMap((note) => [note.label, note.text]),
    row.title,
    row.subtitle,
    row.amount,
    row.event,
    segments(row.tickets),
  ].join('\n')
}

describe('confirmación', () => {
  it('PV1: teatro, 10 boletos', () => {
    expect(purchaseHeading(THEATER)).toBe('10 boletos para Nabucco (Verdi)')
    expect(purchaseVenueLine(THEATER)).toBe('Teatro alla Scala · Milán, Italia · EUR')
    expect(cellsByLabel(THEATER)).toEqual({
      'Fecha del evento': { value: '5 oct 2026, 15:00', note: 'Lunes' },
      'Sección': { value: 'Platea', note: 'EUR 250.00 por boleto' },
    })
  })

  it('PV2: cine, 1 boleto, Cinemark', () => {
    expect(purchaseHeading(CINEMARK)).toBe('1 boleto para Spider-Man: Brand New Day')
    expect(purchaseVenueLine(CINEMARK)).toBe('Cinemark · Estados Unidos · USD')
    const labels = purchaseDetailCells(CINEMARK).map((cell) => cell.label)
    expect(labels).toEqual(['Fecha del evento', 'Película', 'Formato', 'Asiento'])
    expect(cellsByLabel(CINEMARK)['Película']).toEqual({ value: 'Spider-Man: Brand New Day', note: 'PG-13 · 148 min' })
    expect(cellsByLabel(CINEMARK)['Asiento']).toEqual({ value: '45', note: null })
  })

  it('PV3: Louvre', () => {
    expect(purchaseHeading(LOUVRE)).toBe('3 boletos · Museo del Louvre')
    expect(cellsByLabel(LOUVRE)['Tarifa']).toEqual({ value: 'Tarifa residente', note: 'EUR 22.00 por boleto' })
    expect(cellsByLabel(LOUVRE)['Fecha del evento']).toEqual({ value: '15 oct 2026, 10:00', note: 'Jueves' })
  })

  it('PV4: Met', () => {
    expect(purchaseHeading(MET_PURCHASE)).toBe('2 boletos · The Metropolitan Museum of Art')
    expect(cellsByLabel(MET_PURCHASE)['Tarifa']).toEqual({ value: 'Tarifa general', note: 'USD 30.00 por boleto' })
  })

  it('PV5: cine K', () => {
    expect(cellsByLabel(CINEMA)['Formato']).toEqual({ value: 'VIP', note: 'MXN 280.00 por boleto' })
    expect(cellsByLabel(CINEMA)['Asientos']).toEqual({ value: '12, 13', note: null })
    const breakdown = purchaseBreakdown(CINEMA)
    expect(breakdown.lines.map((line) => [segmentsText(line.label), line.amount])).toEqual([
      ['2 × VIP', 'MXN 560.00'],
      ['Cargo por servicio · 2 × MXN 6.00', 'MXN 12.00'],
    ])
    expect(breakdown.total).toBe('MXN 572.00')
  })

  it('PV5: teatro y museo tienen una sola línea, sin cargo (RN-TAR-05)', () => {
    expect(purchaseBreakdown(THEATER).lines.map((line) => [segmentsText(line.label), line.amount])).toEqual([['10 × Platea', 'EUR 2,500.00']])
    expect(purchaseBreakdown(LOUVRE).lines.map((line) => [segmentsText(line.label), line.amount])).toEqual([['3 × Tarifa residente', 'EUR 66.00']])
  })

  it('PV6: pago con crédito Visa, débito Mastercard y PayPal', () => {
    const lines = (target: Purchase): readonly [string, string] => {
      const [method, detail] = paymentLines(target.payment)
      return [method, segmentsText(detail)]
    }
    expect(lines(THEATER)).toEqual(['Tarjeta de crédito Visa', '************1111 · Ana Sofía Ríos Vela'])
    const debit = purchase('teatro-scala', { category: 'teatro', input: B }, MASTERCARD_DEBIT)
    expect(lines(debit)).toEqual(['Tarjeta de débito Mastercard', '************4444 · Ana Sofía Ríos Vela'])
    expect(lines(CINEMA)).toEqual(['PayPal', 'ana.rios@ejemplo.mx'])
  })

  it('PV7: antes de asistir, por categoría', () => {
    expect(beforeAttending(THEATER)).toEqual([
      { label: 'Vestimenta', text: 'Formal. Etiqueta rigurosa en la temporada de abono.' },
      { label: 'Restricciones', text: 'Prohibido el uso de teléfonos móviles en sala. No se permite el acceso una vez iniciada la función.' },
    ])
    expect(beforeAttending(CINEMA)).toEqual([
      { label: 'Restricciones', text: 'Prohibidas mascotas (salvo animal de servicio), armas y alimentos ajenos a la dulcería.' },
    ])
    expect(beforeAttending(LOUVRE)).toEqual([
      { label: 'Horario de entrada', text: 'Acceso por franja horaria reservada' },
      { label: 'Restricciones', text: 'Prohibidos trípodes, monopiés y palos de selfie. Fotografía sin flash permitida. Reserva de franja horaria obligatoria.' },
    ])
  })
})

describe('precio por boleto del formato', () => {
  it('PV11: se lee de la compra, no se divide el subtotal', () => {
    const three = purchase('cinepolis', { category: 'cine', input: { ...K, quantity: '3', seats: ['12', '13', '14'] } }, Y, 6)
    if (three.category !== 'cine') throw new Error('cine')
    expect(three.formatPrice).toBe(28000)
    expect(three.quantity).toBe(3)
    expect(cellsByLabel(three).Formato?.note).toBe('MXN 280.00 por boleto')
    // With a subtotal that is not a multiple of the quantity, dividing would give another price.
    expect(cellsByLabel({ ...three, subtotal: cents(100000) }).Formato?.note).toBe('MXN 280.00 por boleto')
  })
})

describe('«Mis boletos»', () => {
  it('PV8: fila por categoría', () => {
    const rows = [THEATER, CINEMA, LOUVRE].map((target) => {
      const row = purchaseRow(target)
      return [row.title, row.subtitle, row.amount, row.event, segmentsText(row.tickets)]
    })
    expect(rows).toEqual([
      ['Nabucco (Verdi) · Platea', 'Teatro alla Scala · Milán, Italia', 'EUR 2,500.00', '5 oct 2026, 15:00', '10 boletos · PLC-0001-2026'],
      ['Insidious · VIP', 'Cinépolis · México', 'MXN 572.00', '10 oct 2026, 19:00', '2 boletos · PLC-0002-2026'],
      ['Museo del Louvre', 'París, Francia', 'EUR 66.00', '15 oct 2026, 10:00', '3 boletos · PLC-0003-2026'],
    ])
    expect(segmentsText(purchaseRow(CINEMARK).tickets)).toBe('1 boleto · PLC-0004-2026')
  })

  it('PV9: encabezado con una y con varias compras', () => {
    expect(purchasesCountLabel(1)).toBe('1 compra')
    expect(purchasesCountLabel(3)).toBe('3 compras · la más reciente primero')
  })

  it('PV9: boletos en singular y plural', () => {
    expect(ticketCountLabel(1)).toBe('1 boleto')
    expect(ticketCountLabel(10)).toBe('10 boletos')
  })
})

describe('RNF-15', () => {
  it('PV10: ninguna salida contiene el número completo', () => {
    for (const target of ALL) {
      const text = everyText(target)
      expect(text).not.toContain('4111111111111111')
      expect(text).not.toContain('5555555555554444')
      expect(text).not.toContain('987')
    }
  })
})

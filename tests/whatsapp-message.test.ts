import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { confirmPurchase, type TicketsInput } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import { templateText, whatsappDocumentName, whatsappTemplateParameters } from '../server/utils/whatsapp-message'
import type { CalendarDate, Purchase } from '../types'

// The parameters of the `palco_boletos` template. Each case carries its identifier
// in its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }
const CARD: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const LIMITS = { teatro: 10, cine: 10, museo: 5 } as const

function purchase(venueId: string, tickets: TicketsInput, sequence = 1): Purchase {
  const venue = VENUES.find((candidate) => candidate.id === venueId)!
  const confirmation = confirmPurchase(venue, tickets, CARD, { userLimit: LIMITS[venue.category], available: venue.capacity, today: TODAY, sequence })
  if (!confirmation.ok) throw new Error(`${venueId}: ${confirmation.result.code}`)
  return confirmation.purchase
}

/** The parameters of a template that can be built. */
function bodyOf(bought: Purchase, template: string, buyerName: string): readonly string[] {
  const parameters = whatsappTemplateParameters(bought, template, buyerName)
  if (!parameters.ok) throw new Error(`No se armó ${template}: ${parameters.reason}`)
  return parameters.body
}

const MET = (quantity: string) => purchase('met', { category: 'museo', input: { isResident: false, date: '21/11/2026', time: '19:45', quantity } })

describe('parámetros de la plantilla', () => {
  it('WE9: tres boletos y un boleto', () => {
    expect(bodyOf(MET('3'), 'palco_boletos', '')).toEqual([
      'PLC-0001-2026',
      '3 boletos',
      'The Metropolitan Museum of Art',
      'sábado 21 nov 2026 a las 19:45',
    ])
    expect(bodyOf(MET('1'), 'palco_boletos', '')[1]).toBe('1 boleto')
    expect(whatsappDocumentName(MET('3'))).toBe('PALCO-PLC-0001-2026.pdf')
  })

  it('WE10: el nombre del recinto en las tres categorías', () => {
    const scala = purchase('teatro-scala', { category: 'teatro', input: { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '2' } }, 2)
    const cinepolis = purchase('cinepolis', {
      category: 'cine',
      input: { filmIndex: 3, age: '21', formatId: 'vip', date: '13/11/2026', time: '19:00', quantity: '2', seats: ['12', '13'] },
    }, 3)
    expect(bodyOf(scala, 'palco_boletos', '')).toEqual(['PLC-0002-2026', '2 boletos', 'Teatro alla Scala', 'lunes 5 oct 2026 a las 15:00'])
    expect(bodyOf(cinepolis, 'palco_boletos', '')).toEqual(['PLC-0003-2026', '2 boletos', 'Cinépolis', 'viernes 13 nov 2026 a las 19:00'])
  })

  it('WE11: la fecha con el día de la semana en minúscula', () => {
    const date = bodyOf(MET('3'), 'palco_boletos', '')[3]
    expect(date).toBe('sábado 21 nov 2026 a las 19:45')
    expect(date).toMatch(/^[a-zá-úñ]/)
  })
})

// Meta rejects parameters with line breaks, tabs or more than four consecutive
// spaces. The v2 template carries the buyer's name, which the user types, and
// these cases cover it.
describe('parámetro de la plantilla', () => {
  it.each([
    ['WE23', 'espacios repetidos', 'Ana    Sofía  Ríos', 'Ana Sofía Ríos'],
    ['WE24', 'tabulador', 'Ana\tSofía', 'Ana Sofía'],
    ['WE25', 'salto de línea', 'Ana\nSofía\r\nRíos', 'Ana Sofía Ríos'],
    ['WE26', 'espacios en los extremos y espacio duro', '  Ana\u00a0Sofía ', 'Ana Sofía'],
    ['WE27', 'un solo carácter', 'A', 'A'],
  ])('%s: %s', (_, __, value, expected) => {
    const cleaned = templateText(value)
    expect(cleaned).toBe(expected)
    expect(cleaned).not.toMatch(/[\n\t]| {5}/)
  })

  it('WE28: los cuatro parámetros pasan por la limpieza', () => {
    const met = MET('3')
    const messy: Purchase = { ...met, venueName: 'The Metropolitan\nMuseum   of Art' }
    expect(bodyOf(messy, 'palco_boletos', '')[2]).toBe('The Metropolitan Museum of Art')
  })
})

describe('plantilla v2 aprobada', () => {
  it('WE29: seis parámetros en el orden de Meta, con comprador y total con método', () => {
    expect(bodyOf(MET('3'), 'palco_boletos_v2', 'Bruno Téllez Nava')).toEqual([
      'Bruno Téllez Nava', 'PLC-0001-2026', '3 boletos', 'The Metropolitan Museum of Art',
      'sábado 21 nov 2026 a las 19:45', 'USD 90.00 con Tarjeta de crédito Visa',
    ])
    expect(bodyOf(MET('1'), 'palco_boletos_v2', 'Bruno')[2]).toBe('1 boleto')
  })

  it('WE30: débito, crédito y PayPal en sus monedas, sin número, titular ni cuenta', () => {
    const base = MET('3')
    const payments: readonly Purchase['payment'][] = [
      { method: 'debit', brand: 'mastercard', maskedNumber: '************4444', holder: 'Elena Vela Torres' },
      { method: 'credit', brand: 'visa', maskedNumber: '************1111', holder: 'Elena Vela Torres' },
      { method: 'paypal', email: 'paypal.ana@example.com' },
    ]
    const expected = ['USD 90.00 con Tarjeta de débito Mastercard', 'USD 90.00 con Tarjeta de crédito Visa', 'USD 90.00 con PayPal']
    payments.forEach((payment, index) => {
      const parameters = bodyOf({ ...base, payment }, 'palco_boletos_v2', 'Bruno')
      expect(parameters[5]).toBe(expected[index])
      expect(parameters.join(' ')).not.toMatch(/\*|4444|1111|Elena|@/)
    })
  })

  it('WE31: limpia todos los parámetros de la v2, incluido el nombre con espacios repetidos', () => {
    const parameters = bodyOf({ ...MET('1'), venueName: 'The Metropolitan\nMuseum   of Art' }, 'palco_boletos_v2', '  Ana    Sofía\tRíos ')
    expect(parameters[0]).toBe('Ana Sofía Ríos')
    expect(parameters[3]).toBe('The Metropolitan Museum of Art')
    expect(parameters.every((value) => !/[\n\t]| {2}/.test(value))).toBe(true)
  })

  // It does not throw: it returns the reason.
  it('WE32: una plantilla desconocida o una v2 sin comprador no producen parámetros', () => {
    expect(whatsappTemplateParameters(MET('1'), 'desconocida', 'Ana')).toEqual({ ok: false, reason: 'unknown-template' })
    expect(whatsappTemplateParameters(MET('1'), 'palco_boletos_v2', '')).toEqual({ ok: false, reason: 'missing-buyer' })
    expect(whatsappTemplateParameters(MET('1'), 'palco_boletos_v2', '   ')).toEqual({ ok: false, reason: 'missing-buyer' })
  })
})

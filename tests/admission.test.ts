import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { evaluateAdmission, parseAdmissionCode, type AdmissionInput, type AdmissionTicket } from '../server/domain/admission'
import { encodeBase32, formatQrPayload, formatShortCode } from '../server/domain/ticket'
import { admissionDetailText, admittedTicketView } from '../server/utils/admission-view'
import type { CalendarDate, CinemaPurchase, MuseumPurchase, TimeOfDay, Venue } from '../types'
import { cents } from '../server/domain/money'

// Gate admission (RN-ACC-03): the code shape and steps 2 to 6, in order. Step 7,
// "not used", is decided by the database and tested by INT21–INT27 and C20. Each
// case carries its identifier in its name.

const ID = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x01, 0x23])
const SIGNATURE = new Uint8Array(64).fill(7)
const SHORT = formatShortCode(ID)
if (!SHORT.ok) throw new Error('id de prueba mal formado')
const QR = formatQrPayload(ID, SIGNATURE)
if (!QR.ok) throw new Error('QR de prueba mal formado')

const venue = (id: string): Venue => VENUES.find((candidate) => candidate.id === id)!
const CINEPOLIS = venue('cinepolis')
const MET = venue('met')

/** Monday, October 26, 2026, the NOW of the HTTP tests. Cinépolis opens from 11:00 to 23:30. */
const TODAY: CalendarDate = { year: 2026, month: 10, day: 26 }
const AT_SIX: TimeOfDay = { hour: 18, minute: 0 }

const TICKET: AdmissionTicket = { venueId: 'cinepolis', venueName: 'Cinépolis', city: 'México', eventDate: TODAY }
const BASE: AdmissionInput = { signature: 'valid', ticket: TICKET, gateVenue: CINEPOLIS, today: TODAY, now: AT_SIX }

describe('la forma del código (RN-ACC-03, paso 1)', () => {
  it('AD1: un QR de PALCO se lee con su id y su firma, con los extremos recortados', () => {
    const parsed = parseAdmissionCode(`  ${QR.value}\n`)
    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.value.kind === 'qr') {
      expect(Buffer.from(parsed.value.id)).toEqual(Buffer.from(ID))
      expect(Buffer.from(parsed.value.signature)).toEqual(Buffer.from(SIGNATURE))
    }
    else throw new Error('se esperaba un QR')
  })

  it('AD2: el código corto, con y sin guiones, en minúsculas y con las sustituciones de Crockford', () => {
    const plain = encodeBase32(ID)
    const lookalike = plain.replaceAll('0', 'o').replaceAll('1', 'l').toLowerCase()
    for (const text of [SHORT.value, plain, plain.toLowerCase(), lookalike, ` ${SHORT.value} `]) {
      const parsed = parseAdmissionCode(text)
      expect(parsed.ok && parsed.value.kind === 'short' && Buffer.from(parsed.value.id).equals(Buffer.from(ID)), text).toBe(true)
    }
  })

  it('AD3: lo demás es ERR_TICKET_CODE_FORMAT, sin distinguir', () => {
    for (const text of [
      '', '   ',
      SHORT.value.slice(0, -1), // 15 characters
      `${SHORT.value}A`, // 17
      'UUUU-UUUU-UUUU-UUUU', // U is not a Crockford character
      'P1.', `${QR.value}.`, QR.value.toLowerCase(), // a malformed QR is not read as a short code
      'PLC-0001-2026', // a folio is not a ticket
    ]) {
      const parsed = parseAdmissionCode(text)
      expect(parsed.ok, JSON.stringify(text)).toBe(false)
      if (!parsed.ok) {
        expect(parsed.result.code).toBe('ERR_TICKET_CODE_FORMAT')
        expect(parsed.result.message).toBe('El código no tiene el formato de un boleto de PALCO')
      }
    }
  })
})

describe('los pasos 2 a 6 de RN-ACC-03', () => {
  it('AD4: un boleto de hoy, del recinto y dentro del horario se admite; con QR o con código corto', () => {
    expect(evaluateAdmission(BASE).ok).toBe(true)
    expect(evaluateAdmission({ ...BASE, signature: 'absent' }).ok).toBe(true)
  })

  it('AD5: la firma inválida gana a todo, también a un boleto inexistente', () => {
    for (const ticket of [TICKET, null]) {
      expect(evaluateAdmission({ ...BASE, signature: 'invalid', ticket })).toEqual({
        ok: false, result: { ok: false, code: 'ERR_TICKET_NOT_AUTHENTIC', message: 'El boleto no es auténtico' }, detail: null,
      })
    }
  })

  it('AD6: sin boleto, ERR_TICKET_NOT_FOUND, también con una firma válida', () => {
    for (const signature of ['valid', 'absent'] as const) {
      const decision = evaluateAdmission({ ...BASE, signature, ticket: null })
      expect(decision.ok).toBe(false)
      if (!decision.ok) expect(decision.result.message).toBe('No hay ningún boleto con este código')
    }
  })

  it('AD7: otro recinto, con su nombre y su ciudad, antes que la fecha', () => {
    const decision = evaluateAdmission({ ...BASE, gateVenue: MET, ticket: { ...TICKET, eventDate: { year: 2026, month: 11, day: 3 } } })
    expect(decision).toEqual({
      ok: false,
      result: { ok: false, code: 'ERR_TICKET_OTHER_VENUE', message: 'El boleto es de otro recinto' },
      detail: { kind: 'venue', venueName: 'Cinépolis', city: 'México' },
    })
  })

  it('AD8: otra fecha, antes o después, con la del evento', () => {
    for (const eventDate of [{ year: 2026, month: 10, day: 25 }, { year: 2026, month: 10, day: 27 }, { year: 2027, month: 10, day: 26 }]) {
      expect(evaluateAdmission({ ...BASE, ticket: { ...TICKET, eventDate } })).toEqual({
        ok: false, result: { ok: false, code: 'ERR_TICKET_WRONG_DATE', message: 'El boleto es para otra fecha' }, detail: { kind: 'date', eventDate },
      })
    }
  })

  it('AD9: el horario de hoy, con los extremos incluidos (RN-APE-08)', () => {
    const hours = { open: { hour: 11, minute: 0 }, close: { hour: 23, minute: 30 } }
    for (const now of [{ hour: 11, minute: 0 }, { hour: 23, minute: 30 }]) expect(evaluateAdmission({ ...BASE, now }).ok).toBe(true)
    for (const now of [{ hour: 10, minute: 59 }, { hour: 23, minute: 31 }]) {
      expect(evaluateAdmission({ ...BASE, now })).toEqual({
        ok: false, result: { ok: false, code: 'ERR_GATE_OUTSIDE_HOURS', message: 'El recinto está fuera de su horario' }, detail: { kind: 'hours', hours },
      })
    }
  })

  it('AD10: el horario aplicable de hoy, no el general: el Met abre hasta las 21:00 en sábado (RN-APE-12)', () => {
    const saturday: CalendarDate = { year: 2026, month: 10, day: 31 }
    const met = { ...BASE, gateVenue: MET, ticket: { ...TICKET, venueId: 'met', eventDate: saturday }, today: saturday }
    expect(evaluateAdmission({ ...met, now: { hour: 20, minute: 30 } }).ok).toBe(true)
    // On Mondays it closes at 17:00.
    const monday = { ...met, ticket: { ...met.ticket, eventDate: TODAY }, today: TODAY }
    expect(evaluateAdmission({ ...monday, now: { hour: 17, minute: 1 } })).toMatchObject({ ok: false, result: { code: 'ERR_GATE_OUTSIDE_HOURS' } })
  })

  it('INV34: con firma, boleto, recinto, fecha y hora, rechaza si y solo si falla algún paso, con el código del primero', () => {
    const steps = [
      ['ERR_TICKET_NOT_AUTHENTIC', (input: AdmissionInput) => input.signature === 'invalid'],
      ['ERR_TICKET_NOT_FOUND', (input: AdmissionInput) => input.ticket === null],
      ['ERR_TICKET_OTHER_VENUE', (input: AdmissionInput) => input.ticket!.venueId !== input.gateVenue.id],
      ['ERR_TICKET_WRONG_DATE', (input: AdmissionInput) => input.ticket!.eventDate.day !== input.today.day],
      ['ERR_GATE_OUTSIDE_HOURS', (input: AdmissionInput) => input.now.hour < 11 || input.now.hour * 60 + input.now.minute > 23 * 60 + 30],
    ] as const
    let cases = 0
    for (const signature of ['valid', 'invalid', 'absent'] as const) {
      for (const ticket of [TICKET, null, { ...TICKET, venueId: 'cinemex' }, { ...TICKET, eventDate: { year: 2026, month: 10, day: 27 } }]) {
        for (const now of [{ hour: 10, minute: 59 }, { hour: 11, minute: 0 }, AT_SIX, { hour: 23, minute: 30 }, { hour: 23, minute: 31 }]) {
          const input: AdmissionInput = { ...BASE, signature, ticket, now }
          const decision = evaluateAdmission(input)
          const first = steps.find(([, fails]) => fails(input))
          cases++
          if (first) expect(decision.ok ? 'OK' : decision.result.code, JSON.stringify({ signature, ticket, now })).toBe(first[0])
          else expect(decision.ok).toBe(true)
        }
      }
    }
    expect(cases).toBe(60)
  })
})

describe('lo que la taquilla muestra', () => {
  const base = {
    folio: 'PLC-0001-2026', venueName: 'Cinépolis', city: 'México', currency: 'MXN' as const,
    date: { year: 2026, month: 10, day: 27 }, time: { hour: 20, minute: 0 }, quantity: 2, amount: cents(57200),
    payment: { method: 'credit' as const, brand: 'visa' as const, maskedNumber: '************1111', holder: 'Ana Sofía Ríos Vela' },
    restrictions: '', purchasedOn: TODAY,
  }
  const cinema: CinemaPurchase = {
    ...base, venueId: 'cinepolis', category: 'cine', film: { title: 'Insidious', classification: 'C', durationMinutes: 112 },
    formatId: 'vip', formatPrice: cents(28000), seats: [12, 13], subtotal: cents(56000), serviceFee: cents(600), feeTotal: cents(1200),
  }

  it('ADV1: el boleto admitido lleva su lugar, sus celdas y el folio, y nada del pago ni del comprador', () => {
    const view = admittedTicketView(cinema, 2, SHORT.value)
    expect(view).toEqual({
      shortCode: SHORT.value, number: 2, quantity: 2, folio: 'PLC-0001-2026',
      cells: [{ label: 'FORMATO', value: 'VIP' }, { label: 'ASIENTO', value: '13' }],
    })
    expect(JSON.stringify(view)).not.toMatch(/1111|Ana|visa|credit/)
  })

  it('ADV2: el museo muestra su tarifa, como el boleto impreso', () => {
    const museum: MuseumPurchase = { ...base, venueId: 'met', category: 'museo', feeKind: 'general', fee: cents(3000), entryNote: '' }
    expect(admittedTicketView(museum, 1, SHORT.value).cells).toEqual([{ label: 'TARIFA', value: 'Tarifa general' }])
  })

  it('ADV3: el detalle de cada rechazo', () => {
    expect(admissionDetailText({ kind: 'venue', venueName: 'Cinépolis', city: 'México' }, cinema)).toBe('Cinépolis · México')
    expect(admissionDetailText({ kind: 'date', eventDate: cinema.date }, cinema)).toBe('Martes 27 oct 2026, 20:00')
    expect(admissionDetailText({ kind: 'hours', hours: { open: { hour: 11, minute: 0 }, close: { hour: 23, minute: 30 } } }, cinema)).toBe('Abre de 11:00 a 23:30')
  })
})

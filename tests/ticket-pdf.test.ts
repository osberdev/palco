import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { PAYMENT_METHODS, type PaymentSummary } from '../server/domain/payment'
import { CELL_VALUE_SIZE, PAYMENT_WIDTH, TICKET_FONT_FILES, renderTicketsPdf, type TicketFonts } from '../server/utils/ticket-pdf'
import type { CardBrand } from '../types'
import { CARD_BRAND_LABELS } from '../utils/payment'
import { TICKET_FOOTER, paymentLabel, type TicketPage } from '../utils/ticket-pages'

// Drawing the purchase PDF with pdfmake. Each case carries its identifier in its name.

const FONTS_DIRECTORY = resolve(import.meta.dirname, '../server/assets/fonts')

function loadFonts(): TicketFonts {
  const entries = Object.entries(TICKET_FONT_FILES).map(([key, file]) => [key, readFileSync(resolve(FONTS_DIRECTORY, file))])
  return Object.fromEntries(entries) as unknown as TicketFonts
}

function page(number: number, total: number): TicketPage {
  return {
    categoryLabel: 'CINE',
    title: 'Insidious',
    eventDate: 'Viernes 13 nov 2026, 19:00',
    venueLine: 'Cinépolis · México',
    qrPayload: `P1.${'0'.repeat(15)}${number}.${'0'.repeat(103)}`,
    shortCode: `000${number}-0000-0000-0000`,
    ticketLabel: `Boleto ${number} de ${total}`,
    cells: [{ label: 'FORMATO', value: 'VIP' }, { label: 'ASIENTO', value: String(11 + number) }],
    folio: 'PLC-0002-2026',
    buyer: 'A nombre de Ana Sofía Ríos Vela',
    paymentLabel: 'Tarjeta de crédito Visa',
    totalLabel: 'MXN 572.00',
    quantityLabel: `${total} ${total === 1 ? 'boleto' : 'boletos'}`,
    notes: [{ label: 'Restricciones', text: 'Prohibidas mascotas (salvo animal de servicio), armas y alimentos ajenos a la dulcería.' }],
    footer: TICKET_FOOTER,
  }
}

const CREATED_AT = new Date(Date.UTC(2026, 9, 17, 19, 42, 7))

/**
 * PDFKit's page dictionaries are not compressed: only the content streams.
 * `/Type /Pages` is the tree, and it is excluded.
 */
function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type \/Page(?![a-zA-Z])/g)?.length ?? 0
}

interface FontkitFont {
  readonly unitsPerEm: number
  layout(text: string): { readonly advanceWidth: number }
}

/** A text's width in points, with the same fontkit layout PDFKit uses, kerning included. */
function textWidth(fontFile: string, size: number, text: string): number {
  const fontkit = createRequire(import.meta.url)('fontkit') as { openSync(path: string): FontkitFont }
  const font = fontkit.openSync(resolve(FONTS_DIRECTORY, fontFile))
  return font.layout(text).advanceWidth / font.unitsPerEm * size
}

describe('PDF de la compra', () => {
  const fonts = loadFonts()

  it('TP7: un PDF con una página por boleto', async () => {
    for (const total of [1, 2, 5]) {
      const pages = Array.from({ length: total }, (_, index) => page(index + 1, total))
      const pdf = await renderTicketsPdf(pages, fonts, CREATED_AT)
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(pageCount(pdf)).toBe(total)
    }
  })

  // The PAGO and TOTAL DE LA COMPRA row must not push the ticket onto a second sheet.
  // The edge case combines the catalog's longest texts: the widest title, the longest
  // venue line, the Vatican restrictions and a dress code, the longest method and a
  // ten-ticket total at the Colón, with its quantity.
  it('TP11: con los textos más largos, cada boleto sigue en una hoja', async () => {
    const vaticanos = VENUES.find((venue) => venue.id === 'vaticanos')!
    const worst = (number: number, total: number): TicketPage => ({
      ...page(number, total),
      categoryLabel: 'TEATRO',
      title: 'El lago de los cisnes (Chaikovski)',
      venueLine: 'Museo Nacional de Antropología · Ciudad de México, México',
      cells: [{ label: 'FORMATO', value: 'Cinépolis Junior' }, { label: 'ASIENTO', value: '350' }],
      folio: 'PLC-10000-2026',
      buyer: `A nombre de ${'Ana Sofía Ríos Vela de la Concepción Mendoza'.slice(0, 60)}`,
      paymentLabel: 'Tarjeta de débito Mastercard',
      totalLabel: 'ARS 380,000.00',
      quantityLabel: '10 boletos',
      notes: [
        { label: 'Vestimenta', text: 'Formal. Se recomienda saco y corbata en platea y palcos.' },
        { label: 'Restricciones', text: vaticanos.restrictions },
      ],
    })
    for (const total of [1, 3]) {
      const pdf = await renderTicketsPdf(Array.from({ length: total }, (_, index) => worst(index + 1, total)), fonts, CREATED_AT)
      expect(pageCount(pdf)).toBe(total)
    }
  })

  // The BOLETOS EN LA COMPRA cell shares the row with PAGO, which has a fixed width.
  // Each possible PAGO value, measured in its cell's font and size (GeistMedium),
  // must fit on one line in its column. It is checked without Poppler; with it,
  // `pdftotext -bbox` confirms it by hand.
  it('TP14: cada valor de PAGO cabe en una línea en su columna', () => {
    const brands = Object.keys(CARD_BRAND_LABELS) as CardBrand[]
    const payments: PaymentSummary[] = PAYMENT_METHODS.flatMap((method): PaymentSummary[] => method === 'paypal'
      ? [{ method, email: 'paypal.ana@example.com' }]
      : brands.map((brand) => ({ method, brand, maskedNumber: '************1111', holder: 'Elena Vela Torres' })))
    const widths = Object.fromEntries(payments.map((payment) => {
      const text = paymentLabel(payment)
      return [text, textWidth(TICKET_FONT_FILES.geistMedium, CELL_VALUE_SIZE, text)]
    }))
    expect(Object.keys(widths)).toHaveLength(5)
    const widest = Object.entries(widths).sort(([, a], [, b]) => b - a)[0]!
    expect(widest[0]).toBe('Tarjeta de crédito Mastercard')
    for (const [text, width] of Object.entries(widths)) expect(width, text).toBeLessThan(PAYMENT_WIDTH)
  })

  it('TP8: las mismas páginas y la misma fecha dan los mismos bytes', async () => {
    const pages = [page(1, 2), page(2, 2)]
    const first = await renderTicketsPdf(pages, fonts, CREATED_AT)
    const second = await renderTicketsPdf(pages, fonts, CREATED_AT)
    expect(first.equals(second)).toBe(true)
  })
})

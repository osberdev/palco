import pdfmake from 'pdfmake'
import type { TicketPage } from '../../utils/ticket-pages'

/**
 * Draws a purchase's PDF with pdfmake: one portrait Letter page per ticket.
 * `utils/ticket-pages.ts` decides the content; this module only draws. The clock
 * is not read: the creation date arrives as a parameter, so the same purchase
 * gives the same bytes.
 */

/** The files in `server/assets/fonts/`, static and shipped with their OFL license. */
export const TICKET_FONT_FILES = {
  geistRegular: 'Geist-Regular.ttf',
  geistMedium: 'Geist-Medium.ttf',
  geistSemiBold: 'Geist-600.ttf',
  geistMonoRegular: 'GeistMono-Regular.ttf',
  geistMonoMedium: 'GeistMono-Medium.ttf',
  instrumentSerif: 'InstrumentSerif-Regular.ttf',
} as const

export type TicketFonts = Readonly<Record<keyof typeof TICKET_FONT_FILES, Uint8Array>>

// The colors from assets/css/tokens.css: pdfmake does not read CSS.
const INK_900 = '#171412'
const INK_700 = '#3D3733'
const INK_500 = '#6B625C'
const INK_400 = '#8C837C'
const INK_200 = '#DCD5CE'

const CATEGORY_COLORS: Readonly<Record<string, readonly [background: string, text: string]>> = {
  TEATRO: ['#F7EBEF', '#5E1B2F'],
  CINE: ['#EBEFF7', '#182C52'],
  MUSEO: ['#F7F0EA', '#6B3E23'],
}

// pdfmake measures in points. The layout is specified as a Letter page at 96 dpi,
// 816 × 1056 px: each pixel is 0.75 pt.
const pxToPt = (value: number): number => value * 0.75
const PAGE_WIDTH = pxToPt(816)
const SIDE = pxToPt(56)
const CONTENT_WIDTH = PAGE_WIDTH - 2 * SIDE
const QR_COLUMN = pxToPt(224)
const FOOTER_HEIGHT = pxToPt(96)
const CELL_GAP = pxToPt(24)
// Three columns.
const CELL_WIDTH = (CONTENT_WIDTH - 2 * CELL_GAP) / 3
// "Tarjeta de crédito Mastercard", the widest method, on one line (TP14).
export const PAYMENT_WIDTH = pxToPt(266)
// Each cell's value, in GeistMedium or, for figures, in Geist Mono.
export const CELL_VALUE_SIZE = pxToPt(18)

/**
 * pdfmake does not take the CSS line height: it multiplies the font's own line
 * height, `(ascent − descent) / unitsPerEm` without the lineGap. For the six ticket
 * fonts it is 1.3 (Geist and Geist Mono: 1005 and −295; Instrument Serif: 990 and
 * −310; all six over 1000, without lineGap). The factor passed is the design line
 * height divided by that height.
 */
const FONT_LINE_HEIGHT = 1.3
const leading = (css: number): number => css / FONT_LINE_HEIGHT

type PdfNode = string | Readonly<Record<string, unknown>> | readonly PdfNode[]

/** Figures are set in mono: "Boleto 1 de 3" has the 1 and the 3 in Geist Mono. */
function withMonoDigits(text: string): readonly PdfNode[] {
  return text
    .split(/(\d+)/)
    .filter((part) => part !== '')
    .map((part) => (/^\d+$/.test(part) ? { text: part, font: 'GeistMono', bold: true } : part))
}

function label(text: string): PdfNode {
  return {
    text: text.toLocaleUpperCase('es-MX'),
    font: 'GeistMedium',
    fontSize: pxToPt(12),
    characterSpacing: pxToPt(12) * 0.06,
    color: INK_500,
  }
}

function rule(dashed: boolean): PdfNode {
  return {
    canvas: [{
      type: 'line',
      x1: 0,
      y1: 0,
      x2: CONTENT_WIDTH,
      y2: 0,
      lineWidth: 0.75,
      lineColor: dashed ? INK_400 : INK_200,
      ...(dashed ? { dash: { length: 3, space: 3 } } : {}),
    }],
  }
}

function categoryTag(text: string): PdfNode {
  const [background, color] = CATEGORY_COLORS[text] ?? [INK_200, INK_900]
  return {
    table: { body: [[{ text, font: 'GeistMedium', fontSize: pxToPt(16), characterSpacing: pxToPt(16) * 0.06, color, fillColor: background }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => pxToPt(11),
      paddingRight: () => pxToPt(11),
      paddingTop: () => pxToPt(7),
      paddingBottom: () => pxToPt(5),
    },
  }
}

function eventDate(text: string): PdfNode {
  // The weekday goes in Geist and the date in mono.
  const space = text.indexOf(' ')
  return {
    text: [
      { text: `${text.slice(0, space)} `, font: 'GeistMedium' },
      { text: text.slice(space + 1), font: 'GeistMono', bold: true },
    ],
    fontSize: pxToPt(26),
    lineHeight: leading(1.25),
    color: INK_900,
    margin: [0, pxToPt(14), 0, 0],
  }
}

function head(page: TicketPage): PdfNode {
  return {
    columns: [
      {
        width: '*',
        stack: [
          categoryTag(page.categoryLabel),
          { text: page.title, font: 'InstrumentSerif', fontSize: pxToPt(60), lineHeight: leading(1.1), color: INK_900, margin: [0, pxToPt(14), 0, 0] },
          eventDate(page.eventDate),
          { text: page.venueLine, font: 'Geist', fontSize: pxToPt(21), lineHeight: leading(1.5), color: INK_700, margin: [0, pxToPt(14), 0, 0] },
        ],
      },
      {
        width: QR_COLUMN,
        stack: [
          // Alphanumeric: the content is [0-9A-Z.], and that mode is denser than byte mode.
          // With 123 characters and level M correction it is version 7, 45 modules: 3 pt
          // each, 135 pt, 4.8 cm.
          { qr: page.qrPayload, fit: QR_COLUMN, eccLevel: 'M', mode: 'alphanumeric', alignment: 'center' },
          { text: page.shortCode, font: 'GeistMono', bold: true, fontSize: pxToPt(17), color: INK_900, alignment: 'center', margin: [0, pxToPt(8), 0, 0] },
        ],
      },
    ],
    columnGap: pxToPt(32),
    margin: [0, 0, 0, pxToPt(28)],
  }
}

/** Uppercase label and value; figures in mono. */
function cell(text: string, value: string | readonly PdfNode[], mono: boolean): { readonly stack: readonly PdfNode[] } {
  return {
    stack: [
      label(text),
      {
        text: value,
        font: mono ? 'GeistMono' : 'GeistMedium',
        bold: mono,
        fontSize: CELL_VALUE_SIZE,
        lineHeight: leading(1.4),
        color: INK_900,
        margin: [0, pxToPt(4), 0, 0],
      },
    ],
  }
}

function details(page: TicketPage): PdfNode {
  const cells = [...page.cells, { label: 'FOLIO', value: page.folio }]
    .map((own) => cell(own.label, own.value, own.label === 'FOLIO' || own.label === 'ASIENTO'))
  // Three columns: the unused ones stay empty.
  const empty: { readonly stack: readonly PdfNode[] } = { stack: [] }
  while (cells.length % 3 !== 0) cells.push(empty)
  const rows: PdfNode[] = []
  for (let index = 0; index < cells.length; index += 3) {
    rows.push({ columns: cells.slice(index, index + 3).map((own) => ({ width: '*', ...own })), columnGap: CELL_GAP, margin: [0, 0, 0, CELL_GAP] })
  }
  // The payment goes on its own row, with the purchase quantity. The total stays in
  // the third column, under the folio; the method is wider than a third, because
  // "Tarjeta de débito Mastercard" does not fit in one, and the quantity takes the
  // rest. Fixed widths: they do not shift between purchases.
  rows.push({
    columns: [
      { width: PAYMENT_WIDTH, ...cell('PAGO', page.paymentLabel, false) },
      { width: '*', ...cell('BOLETOS EN LA COMPRA', withMonoDigits(page.quantityLabel), false) },
      { width: CELL_WIDTH, ...cell('TOTAL DE LA COMPRA', page.totalLabel, true) },
    ],
    columnGap: CELL_GAP,
    margin: [0, 0, 0, CELL_GAP],
  })

  return {
    stack: [
      { text: withMonoDigits(page.ticketLabel), font: 'Geist', bold: true, fontSize: pxToPt(22), lineHeight: leading(1.3), color: INK_900, margin: [0, 0, 0, pxToPt(24)] },
      ...rows,
      { text: page.buyer, font: 'Geist', fontSize: pxToPt(16), lineHeight: leading(1.5), color: INK_700 },
    ],
    margin: [0, pxToPt(32), 0, pxToPt(32)],
  }
}

function beforeAttending(page: TicketPage): PdfNode {
  return {
    stack: [
      { text: 'Antes de asistir', font: 'Geist', bold: true, fontSize: pxToPt(18), lineHeight: leading(1.35), color: INK_900, margin: [0, 0, 0, pxToPt(16)] },
      ...page.notes.map((note) => ({
        stack: [
          label(note.label),
          { text: note.text, font: 'Geist', fontSize: pxToPt(15), lineHeight: leading(1.5), color: INK_700, margin: [0, pxToPt(6), 0, 0] },
        ],
        margin: [0, 0, pxToPt(132), pxToPt(16)],
      })),
    ],
    margin: [0, pxToPt(28), 0, 0],
  }
}

function pageContent(page: TicketPage, index: number): PdfNode {
  return {
    stack: [head(page), rule(true), details(page), rule(false), beforeAttending(page)],
    ...(index > 0 ? { pageBreak: 'before' } : {}),
  }
}

/** Each file is registered in pdfmake's virtual file system: nothing is read from disk. */
function registerFonts(fonts: TicketFonts): void {
  for (const key of Object.keys(TICKET_FONT_FILES) as (keyof typeof TICKET_FONT_FILES)[]) {
    pdfmake.virtualfs.writeFileSync(TICKET_FONT_FILES[key], Buffer.from(fonts[key]))
  }
  pdfmake.setFonts({
    Geist: { normal: TICKET_FONT_FILES.geistRegular, bold: TICKET_FONT_FILES.geistSemiBold },
    GeistMedium: { normal: TICKET_FONT_FILES.geistMedium },
    GeistMono: { normal: TICKET_FONT_FILES.geistMonoRegular, bold: TICKET_FONT_FILES.geistMonoMedium },
    InstrumentSerif: { normal: TICKET_FONT_FILES.instrumentSerif },
  })
  // The ticket uses neither URL images nor local files: both are denied.
  pdfmake.setUrlAccessPolicy(() => false)
  pdfmake.setLocalAccessPolicy(() => false)
}

export async function renderTicketsPdf(pages: readonly TicketPage[], fonts: TicketFonts, createdAt: Date): Promise<Buffer> {
  registerFonts(fonts)
  const footers = pages.map((page) => page.footer)

  return pdfmake.createPdf({
    pageSize: 'LETTER',
    pageOrientation: 'portrait',
    pageMargins: [SIDE, pxToPt(44), SIDE, FOOTER_HEIGHT],
    info: { title: `Boletos ${pages[0]?.folio ?? ''}`.trim(), author: 'PALCO', creationDate: createdAt },
    defaultStyle: { font: 'Geist', fontSize: pxToPt(16), color: INK_900 },
    content: pages.map(pageContent),
    footer: (currentPage: number) => ({
      stack: [
        rule(false),
        { text: footers[currentPage - 1] ?? '', font: 'Geist', fontSize: pxToPt(13), lineHeight: leading(1.45), color: INK_700, margin: [0, pxToPt(20), 0, 0] },
      ],
      margin: [SIDE, 0, SIDE, 0],
    }),
  }).getBuffer()
}

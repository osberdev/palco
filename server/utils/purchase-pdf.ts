import { findPurchaseByFolio, findTicketsByFolio } from '../db/purchases.repository'
import { findSessionUserById } from '../db/users.repository'
import { isFolio } from '../domain/confirmation'
import type { Purchase } from '../../types'
import { ticketPages } from '../../utils/ticket-pages'
import { TICKET_FONT_FILES, renderTicketsPdf, type TicketFonts } from './ticket-pdf'
import { ticketSigner } from './ticket-signing'
import { toTicketViews } from './ticket-views'

let fonts: TicketFonts | null = null

/**
 * The fonts are Nitro server assets (`server/assets/`), not a disk path: in
 * `.output`, `server/assets/fonts` does not exist. They are read once.
 */
async function ticketFonts(): Promise<TicketFonts | null> {
  if (fonts) return fonts
  const storage = useStorage('assets:server')
  const entries: [string, Uint8Array][] = []
  for (const key of Object.keys(TICKET_FONT_FILES) as (keyof typeof TICKET_FONT_FILES)[]) {
    const raw = await storage.getItemRaw<Uint8Array>(`fonts/${TICKET_FONT_FILES[key]}`)
    if (!raw) return null
    entries.push([key, raw])
  }
  fonts = Object.fromEntries(entries) as TicketFonts
  return fonts
}

export type PurchasePdf =
  | { readonly ok: true; readonly purchase: Purchase; readonly pdf: Buffer }
  | { readonly ok: false; readonly statusCode: 401 | 404 | 500; readonly message: string }

/**
 * The PDF of one of the user's purchases, one page per ticket (RF-ENV-01). Used by
 * `GET …/tickets` and by the WhatsApp send, which builds it once per send. A
 * malformed, missing or foreign folio gives the same 404 (RN-ENV-05). `now` is the
 * creation date: the caller reads the clock.
 */
export async function buildPurchasePdf(userId: number, folio: string, now: Date): Promise<PurchasePdf> {
  const purchase = isFolio(folio) ? await findPurchaseByFolio(userId, folio) : null
  const ticketIds = purchase ? await findTicketsByFolio(userId, folio) : null
  if (!purchase || !ticketIds) return { ok: false, statusCode: 404, message: 'Compra inexistente' }

  // The name does not change (RN-PER-09). A cookie user that no longer exists, for
  // example after db:reset, is an ended session, as in the account endpoints.
  const buyer = await findSessionUserById(userId)
  if (!buyer) return { ok: false, statusCode: 401, message: 'Sesión requerida' }

  // `sign` only receives ids from the store, which `issueTickets` issued.
  const tickets = toTicketViews(purchase, ticketIds, ticketSigner().sign)
  if (!tickets) return { ok: false, statusCode: 500, message: 'Boleto mal formado en el almacén' }

  const loaded = await ticketFonts()
  if (!loaded) return { ok: false, statusCode: 500, message: 'Faltan las fuentes del boleto' }
  return { ok: true, purchase, pdf: await renderTicketsPdf(ticketPages(purchase, tickets, buyer.displayName), loaded, now) }
}

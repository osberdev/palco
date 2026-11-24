import type { AdmittedTicket } from '../types'
import { isObject } from './account-outcome'

/**
 * Gate scanning on screen: what the UI does with the response of
 * `POST /api/gate/admissions`, like `classifyPurchaseResponse`. Pure functions: the
 * time arrives as a function.
 */

export type AdmissionOutcome =
  | { readonly kind: 'admitted', readonly ticket: AdmittedTicket, readonly admittedAt: string }
  | {
    readonly kind: 'refused'
    readonly code: string
    readonly message: string
    readonly detail: string | null
    readonly shortCode: string | null
    readonly admittedAt: string | null
  }
  /** 401: the gate closed, in another tab or because the cookie expired. */
  | { readonly kind: 'closed', readonly message: string }
  /** 503: the gate is no longer configured; the page asks again. */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed', readonly status: number }

const CLOSED_MESSAGE = 'La taquilla se cerró. Vuelve a abrirla'

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const textOrNull = (value: unknown): string | null => (isText(value) ? value : null)

function isAdmittedTicket(value: unknown): value is AdmittedTicket {
  return isObject(value)
    && isText(value.shortCode)
    && typeof value.number === 'number'
    && typeof value.quantity === 'number'
    && isText(value.folio)
    && Array.isArray(value.cells)
    && value.cells.every((cell) => isObject(cell) && isText(cell.label) && isText(cell.value))
}

/**
 * Fixed order, the first one that applies wins: no response → `offline`; 401 →
 * `closed`; 503 → `unavailable`; 201 with the ticket → `admitted`; 400, 404 or 409
 * with `code` and `message` → `refused`; otherwise → `failed` with its status. A 400
 * without the rejection shape (an h3 error) is a failure: there is no message to show.
 */
export function classifyAdmissionResponse(status: number, body: unknown): AdmissionOutcome {
  if (status === 0) return { kind: 'offline' }
  if (status === 401) return { kind: 'closed', message: isObject(body) && isText(body.message) ? body.message : CLOSED_MESSAGE }
  if (status === 503) return { kind: 'unavailable' }

  if (status === 201 && isObject(body) && body.ok === true && isAdmittedTicket(body.ticket) && isText(body.admittedAt)) {
    return { kind: 'admitted', ticket: body.ticket, admittedAt: body.admittedAt }
  }

  if ((status === 400 || status === 404 || status === 409) && isObject(body) && body.ok === false
    && isText(body.code) && isText(body.message)) {
    return {
      kind: 'refused',
      code: body.code,
      message: body.message,
      detail: textOrNull(body.detail),
      shortCode: textOrNull(body.shortCode),
      admittedAt: textOrNull(body.admittedAt),
    }
  }

  return { kind: 'failed', status }
}

/** "Última lectura": green or red, the result, the fact that explains it and the trace of a failure. */
export interface ReadingView {
  readonly tone: 'success' | 'error'
  readonly title: string
  readonly detail: string | null
  /** Only for a failure without a server response: "sin conexión · HH:MM:SS". */
  readonly trace: string | null
}

/** A row of "Últimas lecturas": the time, the result and the short code, if one was read. */
export interface ReadingRow {
  readonly time: string
  readonly tone: 'success' | 'error'
  readonly title: string
  readonly shortCode: string | null
}

/** What the screen keeps of a scan: both views, or nothing to show. */
export interface Reading {
  readonly view: ReadingView
  /** Null on a failure: there was no scan, and the list only carries what the server decided. */
  readonly row: ReadingRow | null
}

/** "Últimas lecturas": they live in the page's memory. */
export const READINGS_KEPT = 20

const FAILURE_TITLE = 'No pudimos validar el boleto'

/**
 * The seat is labeled, as on the confirmation ("Asiento 13"); section, format and
 * fee read on their own.
 */
function cellText(cell: { readonly label: string, readonly value: string }): string {
  return cell.label === 'ASIENTO' ? `Asiento ${cell.value}` : cell.value
}

/** The admission detail: `Boleto 1 de 3 · Tarifa general · PLC-0001-2026`. */
export function admittedDetail(ticket: AdmittedTicket): string {
  return [`Boleto ${ticket.number} de ${ticket.quantity}`, ...ticket.cells.map(cellText), ticket.folio].join(' · ')
}

/**
 * The scan a response leaves. `clockTime` gives the scan time on the page, and
 * `formatTime` turns a server ISO time into local time. An admission is shown at
 * the time the server recorded it, the same one shown if it is scanned again.
 * `closed` and `unavailable` leave no scan: the page goes back to the opening form
 * or the unconfigured state.
 */
export function readingFrom(
  outcome: AdmissionOutcome,
  clockTime: () => string,
  formatTime: (iso: string) => string,
): Reading | null {
  switch (outcome.kind) {
    case 'admitted': {
      const title = 'Acceso concedido'
      return {
        view: { tone: 'success', title, detail: admittedDetail(outcome.ticket), trace: null },
        row: { time: formatTime(outcome.admittedAt), tone: 'success', title, shortCode: outcome.ticket.shortCode },
      }
    }
    case 'refused': {
      const detail = outcome.code === 'ERR_TICKET_ALREADY_USED' && outcome.admittedAt !== null
        ? `Entró a las ${formatTime(outcome.admittedAt)}`
        : outcome.detail
      return {
        view: { tone: 'error', title: outcome.message, detail, trace: null },
        row: { time: clockTime(), tone: 'error', title: outcome.message, shortCode: outcome.shortCode },
      }
    }
    case 'offline':
      return { view: { tone: 'error', title: FAILURE_TITLE, detail: null, trace: `sin conexión · ${clockTime()}` }, row: null }
    case 'failed':
      return { view: { tone: 'error', title: FAILURE_TITLE, detail: null, trace: `error ${outcome.status} · ${clockTime()}` }, row: null }
    case 'closed':
    case 'unavailable':
      return null
  }
}

/** The list with the new scan first, never exceeding `READINGS_KEPT`. */
export function withReading(rows: readonly ReadingRow[], row: ReadingRow | null): readonly ReadingRow[] {
  return row === null ? rows : [row, ...rows].slice(0, READINGS_KEPT)
}

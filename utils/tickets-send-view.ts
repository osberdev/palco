import { err } from '../server/domain/result'
import type { WhatsappSendStatus } from '../types'
import { isObject } from './account-outcome'

/**
 * What "Tus boletos" shows depending on the WhatsApp send. Pure functions: the time
 * arrives formatted, and the card only draws.
 */

export type SendResponse =
  | { readonly kind: 'offline' }
  | { readonly kind: 'started'; readonly status: WhatsappSendStatus }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'notRegistered' }
  | { readonly kind: 'limited' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly status: number }

const STATES: readonly string[] = ['idle', 'sending', 'sent', 'failed']

export function isWhatsappSendStatus(value: unknown): value is WhatsappSendStatus {
  return (
    isObject(value)
    && typeof value.available === 'boolean'
    && typeof value.registered === 'boolean'
    && (value.masked === null || typeof value.masked === 'string')
    && typeof value.state === 'string'
    && STATES.includes(value.state)
    && (value.failure === null || isObject(value.failure))
    && typeof value.remaining === 'number'
  )
}

const hasCode = (body: unknown, code: string): boolean => isObject(body) && body.code === code

/** The response of `POST …/whatsapp`, with the criterion of `classifyAccountResponse`. */
export function classifySendResponse(status: number, body: unknown): SendResponse {
  if (status === 0) return { kind: 'offline' }
  if (status === 202 && isWhatsappSendStatus(body)) return { kind: 'started', status: body }
  if (status === 401) return { kind: 'unauthorized' }
  if (status === 404) return { kind: 'notFound' }
  if (status === 409 && hasCode(body, 'ERR_WHATSAPP_NOT_REGISTERED')) return { kind: 'notRegistered' }
  if (status === 429 && hasCode(body, 'ERR_WHATSAPP_SEND_LIMIT')) return { kind: 'limited' }
  if (status === 503 && hasCode(body, 'ERR_WHATSAPP_UNAVAILABLE')) return { kind: 'unavailable' }
  return { kind: 'failed', status }
}

export type SendAction = 'print' | 'send' | 'resend' | 'retry' | 'download' | 'share' | 'changeNumber'

export interface SendAlert {
  readonly variant: 'info' | 'error' | 'success'
  readonly title: string
  /** The trace in mono: "sin conexión · HH:MM:SS", or only the time when unreachable. */
  readonly trace: string | null
}

export interface TicketsSendView {
  readonly kind: 'idle' | 'sending' | 'sent' | 'error' | 'limited' | 'unavailable' | 'unreachable'
  readonly paragraph: string | null
  readonly sendingText: string | null
  readonly alert: SendAlert | null
  /** "Tu compra está confirmada." below the buttons. */
  readonly confirmed: boolean
  readonly actions: readonly { readonly action: SendAction; readonly disabled: boolean }[]
}

const SEND_FAILED_TITLE = 'No pudimos enviar tus boletos a WhatsApp.'

const enabled = (...list: SendAction[]) => list.map((action) => ({ action, disabled: false }))

function view(kind: TicketsSendView['kind'], parts: Partial<TicketsSendView>): TicketsSendView {
  return { kind, paragraph: null, sendingText: null, alert: null, confirmed: false, actions: [], ...parts }
}

/** The send failed and can be retried. */
function errorView(trace: string): TicketsSendView {
  return view('error', {
    alert: { variant: 'error', title: SEND_FAILED_TITLE, trace },
    confirmed: true,
    actions: enabled('retry', 'download', 'share'),
  })
}

/**
 * The card state from the GET. The first one that applies wins: not configured,
 * sending, no sends left in the hour, failed, sent and not sent.
 */
export function ticketsSendView(status: WhatsappSendStatus, formatTime: (iso: string) => string): TicketsSendView {
  const masked = status.masked ?? ''
  if (!status.available) {
    return view('unavailable', { alert: { variant: 'info', title: err('ERR_WHATSAPP_UNAVAILABLE').message, trace: null }, actions: enabled('print', 'share') })
  }
  if (status.state === 'sending') {
    return view('sending', {
      sendingText: `Enviando tus boletos a ${masked}…`,
      actions: [{ action: 'print', disabled: false }, { action: 'send', disabled: true }],
    })
  }
  if (status.remaining === 0) {
    return view('limited', { alert: { variant: 'info', title: err('ERR_WHATSAPP_SEND_LIMIT').message, trace: null }, actions: enabled('download', 'share') })
  }
  if (status.state === 'failed') {
    const failure = status.failure
    const time = failure ? formatTime(failure.at) : null
    if (failure?.code === 'ERR_WHATSAPP_UNREACHABLE') {
      return view('unreachable', {
        alert: { variant: 'info', title: err('ERR_WHATSAPP_UNREACHABLE').message, trace: time },
        actions: enabled('changeNumber', 'download', 'share'),
      })
    }
    // No WhatsApp code but a response.
    const cause = failure?.offline ? 'sin conexión' : failure?.metaCode != null ? `WhatsApp ${failure.metaCode}` : 'error'
    return errorView(time ? `${cause} · ${time}` : cause)
  }
  if (status.state === 'sent') {
    return view('sent', { alert: { variant: 'success', title: `Boletos enviados a ${masked}.`, trace: null }, actions: enabled('print', 'resend') })
  }
  return view('idle', {
    paragraph: 'Recibe tus boletos en WhatsApp para imprimirlos o mostrarlos en la entrada.',
    actions: enabled('print', 'send'),
  })
}

/** The POST did not arrive or answered something else: shown with the client time. */
export function sendRequestFailureView(response: { readonly kind: 'offline' } | { readonly kind: 'failed'; readonly status: number }, time: string): TicketsSendView {
  return errorView(response.kind === 'offline' ? `sin conexión · ${time}` : `error ${response.status} · ${time}`)
}

/**
 * The single "Mis boletos" alert after sending from a row: with `sent`, the sent
 * alert; with another result, the alert for its state with the folio in front of
 * the trace. Without a send, none.
 */
export function rowSendAlert(folio: string, view: TicketsSendView): SendAlert | null {
  if (!view.alert) return null
  if (view.kind === 'sent') return { ...view.alert, title: view.alert.title.replace('Boletos enviados a', `Boletos de ${folio} enviados a`) }
  return { ...view.alert, trace: view.alert.trace ? `${folio} · ${view.alert.trace}` : folio }
}

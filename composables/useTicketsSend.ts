import { useSessionStore } from '../stores/session'
import type { WhatsappSendStatus } from '../types'
import {
  classifySendResponse,
  isWhatsappSendStatus,
  sendRequestFailureView,
  ticketsSendView,
  type SendResponse,
  type TicketsSendView,
} from '../utils/tickets-send-view'

const POLL_MS = 1500

const statusUrl = (folio: string): string => `/api/purchases/${encodeURIComponent(folio)}/whatsapp`

/** The time of an ISO instant on the local clock, HH:MM:SS. Read by the presentation. */
export function formatIsoClock(iso: string): string {
  return formatClockTime(new Date(iso))
}

/** The purchase's send status, or null without a response or with anything else. */
export async function fetchSendStatus(folio: string): Promise<{ readonly status: number; readonly body: WhatsappSendStatus | null }> {
  try {
    const response = await $fetch.raw<unknown>(statusUrl(folio), { ignoreResponseError: true })
    return { status: response.status, body: isWhatsappSendStatus(response._data) ? response._data : null }
  }
  catch {
    return { status: 0, body: null }
  }
}

/** "Enviar a WhatsApp": the POST, classified. */
export async function postSend(folio: string): Promise<SendResponse> {
  try {
    const response = await $fetch.raw<unknown>(statusUrl(folio), { method: 'POST', ignoreResponseError: true })
    return classifySendResponse(response.status, response._data)
  }
  catch {
    return classifySendResponse(0, null)
  }
}

/** The session ended on the server. */
export async function leaveSession(): Promise<void> {
  useSessionStore().clear()
  await navigateTo('/login')
}

/**
 * A purchase's send on the confirmation page. It requests the status on mount and,
 * while the send lasts, every 1.5 s; it stops when the send ends or on unmount,
 * and without a network it keeps the last status. `clock` gives the time of a
 * failed POST.
 */
export function useTicketsSend(folio: () => string, clock: () => Date) {
  const status = shallowRef<WhatsappSendStatus | null>(null)
  const requestFailure = shallowRef<TicketsSendView | null>(null)
  const posting = shallowRef(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = true

  function stop(): void {
    if (timer) clearTimeout(timer)
    timer = null
  }

  async function refresh(): Promise<void> {
    stop()
    const response = await fetchSendStatus(folio())
    if (!active) return
    if (response.status === 401) {
      await leaveSession()
      return
    }
    if (!response.body) return
    status.value = response.body
    if (response.body.state === 'sending') timer = setTimeout(refresh, POLL_MS)
  }

  /** The POST; answers whether the number dialog must be opened. */
  async function send(): Promise<'notRegistered' | null> {
    if (posting.value) return null
    posting.value = true
    requestFailure.value = null
    const response = await postSend(folio())
    posting.value = false
    switch (response.kind) {
      case 'started':
        status.value = response.status
        await refresh()
        return null
      case 'notRegistered':
        return 'notRegistered'
      case 'unauthorized':
        await leaveSession()
        return null
      case 'offline':
      case 'failed':
        requestFailure.value = sendRequestFailureView(response, formatClockTime(clock()))
        return null
      default:
        // The limit, a missing configuration or a purchase that no longer exists: the GET
        // says which.
        await refresh()
        return null
    }
  }

  const view = computed<TicketsSendView | null>(() =>
    requestFailure.value ?? (status.value ? ticketsSendView(status.value, formatIsoClock) : null),
  )

  onMounted(refresh)
  onBeforeUnmount(() => {
    active = false
    stop()
  })

  return { status, view, posting, send, refresh }
}

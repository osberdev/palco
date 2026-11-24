import { rowSendAlert, sendRequestFailureView, ticketsSendView, type SendAlert } from '../utils/tickets-send-view'
import { fetchSendStatus, formatIsoClock, leaveSession, postSend } from './useTicketsSend'

const POLL_MS = 1500
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * "Enviar a WhatsApp" from the "Mis boletos" rows (RF-ENV-08). One send at a time:
 * its row's button waits while it lasts, and when it ends a single alert sits
 * above the list.
 */
export function useRowTicketsSend(clock: () => Date) {
  const busyFolio = shallowRef<string | null>(null)
  const alert = shallowRef<SendAlert | null>(null)
  let active = true
  onBeforeUnmount(() => {
    active = false
  })

  /** The status until it leaves `sending`; without a network, the last one. */
  async function settle(folio: string): Promise<void> {
    let last = await fetchSendStatus(folio)
    while (active && last.body?.state === 'sending') {
      await wait(POLL_MS)
      const next = await fetchSendStatus(folio)
      if (!next.body) break
      last = next
    }
    if (last.status === 401) {
      await leaveSession()
      return
    }
    if (last.body) alert.value = rowSendAlert(folio, ticketsSendView(last.body, formatIsoClock))
  }

  /** Answers whether the number dialog must be opened for that purchase. */
  async function send(folio: string): Promise<'notRegistered' | null> {
    if (busyFolio.value !== null) return null
    busyFolio.value = folio
    alert.value = null
    try {
      const response = await postSend(folio)
      switch (response.kind) {
        case 'notRegistered':
          return 'notRegistered'
        case 'unauthorized':
          await leaveSession()
          return null
        case 'offline':
        case 'failed':
          alert.value = rowSendAlert(folio, sendRequestFailureView(response, formatClockTime(clock())))
          return null
        default:
          await settle(folio)
          return null
      }
    }
    finally {
      busyFolio.value = null
    }
  }

  return { busyFolio, alert, send }
}

import type { MaybeRefOrGetter } from 'vue'
import { useSessionStore } from '../stores/session'
import type { TicketsInput } from '../server/domain/confirmation'
import type { PaymentInput } from '../server/domain/payment'
import type { SavedPaymentBody } from './usePayment'
import type { PurchaseStep } from '../types'
import {
  classifyPurchaseResponse,
  generateRequestId,
  nextRequestKey,
  type ConfirmationOutcome,
  type RequestKey,
} from '../utils/confirmation-outcome'
import type { ServerFieldErrors } from './useServerFieldErrors'

/**
 * The purchase being confirmed, without the `requestId`, which is added on send.
 * In the body, `tickets` travels as the composite's input, without the category:
 * the server takes it from the venue (`parseTicketsInput`).
 */
export interface PurchaseRequestBody {
  readonly venueId: string
  readonly tickets: TicketsInput
  readonly payment: PaymentInput | SavedPaymentBody
}

/** What each purchase contributes: its tickets and its payment. */
export type PurchaseSelection = Omit<PurchaseRequestBody, 'venueId'>

/**
 * The current confirmation alert: a rejection on a step, an ended session, no
 * connection or a server error. The last two carry the failure time, which comes
 * from the page clock.
 */
export type ConfirmationAlert =
  | { readonly kind: 'rejected'; readonly step: PurchaseStep; readonly field: string; readonly message: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'offline'; readonly time: string }
  | { readonly kind: 'failed'; readonly status: number; readonly time: string }

interface Options {
  readonly venueId: MaybeRefOrGetter<string>
  /** Tickets and payment, from the composites' inputs: the same the client evaluates. */
  readonly selection: () => PurchaseSelection
  /** The page clock: no composable reads it on its own. */
  readonly clock: () => Date
  /** Reads `today` again and refetches the venue detail after a rejection. */
  readonly refreshContext: () => Promise<void>
  readonly serverErrors: ServerFieldErrors
  /** A tickets rejection goes back to step 1. */
  readonly onTicketsRejected: () => void
  /** A rejection of the saved method, with its code. */
  readonly onSavedMethodRejected?: (code: string) => void
}

/**
 * "Confirmar compra": sends the purchase with its request identifier (RN-CON-07),
 * classifies the response and sets the matching alert and per-field messages. A
 * second `confirm()` in progress sends nothing.
 */
export function usePurchaseConfirmation(options: Options) {
  const { venueId, selection, clock, refreshContext, serverErrors, onTicketsRejected, onSavedMethodRejected } = options

  const status = ref<'idle' | 'submitting'>('idle')
  const alert = ref<ConfirmationAlert | null>(null)

  // Kept across retries of the same purchase and renewed when the body changes. It
  // lives only in the page's memory.
  let requestKey: RequestKey | null = null

  async function send(requestId: string, request: PurchaseRequestBody): Promise<ConfirmationOutcome> {
    try {
      const response = await $fetch.raw<unknown>('/api/purchases', {
        method: 'POST',
        body: { requestId, venueId: request.venueId, tickets: request.tickets.input, payment: request.payment },
        ignoreResponseError: true,
      })
      return classifyPurchaseResponse(response.status, response._data)
    }
    catch {
      // No response: the network dropped or the request was aborted.
      return classifyPurchaseResponse(0, null)
    }
  }

  async function confirm(): Promise<void> {
    if (status.value === 'submitting') return
    status.value = 'submitting'
    // A new attempt does not keep the previous attempt's alert.
    alert.value = null

    const request: PurchaseRequestBody = { venueId: toValue(venueId), ...selection() }
    requestKey = nextRequestKey(requestKey, JSON.stringify(request), generateRequestId)
    serverErrors.clearAll()

    const outcome = await send(requestKey.requestId, request)

    switch (outcome.kind) {
      case 'confirmed':
        // Without going back to `idle`: the form stays locked until leaving.
        // `replace`, so Back does not return to the form.
        await navigateTo(`/confirmacion/${outcome.folio}`, { replace: true })
        return
      case 'rejected':
        // The detail and `today` are requested again before showing the field, so client
        // validation matches the server's.
        await refreshContext()
        // After the changes the new detail causes (a sold-out venue sets the quantity to
        // 0), so they do not erase the message just set.
        await nextTick()
        serverErrors.record(outcome.field, outcome.seatIndex, outcome.message, outcome.code)
        alert.value = { kind: 'rejected', step: outcome.step, field: outcome.field, message: outcome.message }
        if (outcome.step === 'tickets') onTicketsRejected()
        if (outcome.field === 'savedMethod') onSavedMethodRejected?.(outcome.code)
        break
      case 'unauthorized':
        alert.value = { kind: 'unauthorized' }
        break
      case 'offline':
        alert.value = { kind: 'offline', time: formatClockTime(clock()) }
        break
      case 'failed':
        alert.value = { kind: 'failed', status: outcome.status, time: formatClockTime(clock()) }
        break
    }
    status.value = 'idle'
  }

  function dismissAlert(): void {
    alert.value = null
  }

  /** The session ended on the server; the browser does not know yet. */
  async function signInAgain(): Promise<void> {
    useSessionStore().clear()
    await navigateTo('/login')
  }

  return { status, alert, confirm, dismissAlert, signInAgain }
}

export type PurchaseConfirmation = ReturnType<typeof usePurchaseConfirmation>

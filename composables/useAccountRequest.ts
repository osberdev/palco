import { useSessionStore } from '../stores/session'
import { classifyAccountResponse, type AccountOutcome } from '../utils/account-outcome'

/**
 * The alert for an account request that did not complete: a rejection of the whole
 * request, an ended session, no connection or a server error, with the failure
 * time from the page clock.
 */
export type AccountAlert =
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'offline'; readonly time: string }
  | { readonly kind: 'failed'; readonly status: number; readonly time: string }

interface RawResponse {
  readonly status: number
  readonly _data?: unknown
}

/**
 * Sends an account request, classifies the response and sets the matching alert.
 * A second submission in progress does nothing. A field rejection leaves no alert:
 * its field shows it, and the caller receives it in the result.
 */
export function useAccountRequest(clock: () => Date) {
  const pending = ref(false)
  const alert = ref<AccountAlert | null>(null)

  async function send<T>(
    request: () => Promise<RawResponse>,
    success: (body: Readonly<Record<string, unknown>>) => T | null,
  ): Promise<AccountOutcome<T> | null> {
    if (pending.value) return null
    pending.value = true
    alert.value = null

    let outcome: AccountOutcome<T>
    try {
      const response = await request()
      outcome = classifyAccountResponse(response.status, response._data, success)
    }
    catch {
      // No response: the network dropped or the request was aborted.
      outcome = classifyAccountResponse(0, null, success)
    }

    switch (outcome.kind) {
      case 'rejected':
        if (outcome.field === null) alert.value = { kind: 'rejected', message: outcome.message }
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
    pending.value = false
    return outcome
  }

  function dismiss(): void {
    alert.value = null
  }

  /** The session ended on the server; the browser does not know yet. */
  async function signInAgain(): Promise<void> {
    useSessionStore().clear()
    await navigateTo('/login')
  }

  return { pending, alert, send, dismiss, signInAgain }
}

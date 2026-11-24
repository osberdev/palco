import { evaluatePhotoSize, evaluateProfilePhoto } from '../server/domain/photo'
import { useSessionStore } from '../stores/session'
import { classifyProfileResponse, type ProfileOutcome } from '../utils/profile-outcome'

/** An unsaved change: a new photo or removing the saved one. */
export type PendingPhoto =
  | { readonly kind: 'upload'; readonly bytes: Uint8Array; readonly url: string }
  | { readonly kind: 'remove' }

export type PhotoAction = PendingPhoto['kind']

export type PhotoAlert =
  | { readonly kind: 'saved'; readonly action: PhotoAction }
  | { readonly kind: 'offline'; readonly action: PhotoAction; readonly time: string }
  | { readonly kind: 'failed'; readonly action: PhotoAction; readonly status: number; readonly time: string }
  | { readonly kind: 'unauthorized' }

interface Options {
  /** The page reads the clock and passes it down, as in the purchase. */
  readonly clock: () => Date
}

/**
 * Profile photo: choose, validate with the domain, preview and save or remove with
 * "Confirmar" (RF-PER-06, 08 and 09). Nothing is sent until confirming.
 */
export function useProfilePhoto({ clock }: Options) {
  const store = useSessionStore()

  const pending = ref<PendingPhoto | null>(null)
  /** The file rejection, from the client or the server, below the hint. */
  const error = ref<string | null>(null)
  const alert = ref<PhotoAlert | null>(null)
  const saving = ref(false)

  function discardPending(): void {
    if (pending.value?.kind === 'upload') URL.revokeObjectURL(pending.value.url)
    pending.value = null
  }

  /**
   * Size goes first because it is decided with `File.size`, without reading the
   * file; then the full photo, in the same order as the server (RN-PER-06).
   */
  async function choose(file: File): Promise<void> {
    if (saving.value) return
    alert.value = null
    error.value = null
    discardPending()

    const size = evaluatePhotoSize(file.size)
    if (!size.ok) {
      error.value = size.message
      return
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const photo = evaluateProfilePhoto(bytes)
    if (!photo.ok) {
      error.value = photo.result.message
      return
    }

    pending.value = { kind: 'upload', bytes, url: URL.createObjectURL(file) }
  }

  function startRemoval(): void {
    if (saving.value) return
    alert.value = null
    error.value = null
    discardPending()
    pending.value = { kind: 'remove' }
  }

  function cancel(): void {
    if (saving.value) return
    alert.value = null
    discardPending()
  }

  async function send(change: PendingPhoto): Promise<ProfileOutcome> {
    try {
      const response = change.kind === 'upload'
        ? await $fetch.raw<unknown>('/api/profile/photo', {
            method: 'PUT',
            body: change.bytes,
            headers: { 'Content-Type': 'application/octet-stream' },
            ignoreResponseError: true,
          })
        : await $fetch.raw<unknown>('/api/profile/photo', { method: 'DELETE', ignoreResponseError: true })
      return classifyProfileResponse(response.status, response._data)
    }
    catch {
      // No response: the network dropped or the request was aborted.
      return classifyProfileResponse(0, null)
    }
  }

  async function confirm(): Promise<void> {
    const change = pending.value
    if (change === null || saving.value) return
    saving.value = true
    alert.value = null

    const outcome = await send(change)
    switch (outcome.kind) {
      case 'saved':
        // The top bar changes immediately: the circle reads the version from the store.
        store.setUser(outcome.user)
        discardPending()
        alert.value = { kind: 'saved', action: change.kind }
        break
      case 'rejected':
        discardPending()
        error.value = outcome.message
        break
      case 'unauthorized':
        alert.value = { kind: 'unauthorized' }
        break
      case 'offline':
        alert.value = { kind: 'offline', action: change.kind, time: formatClockTime(clock()) }
        break
      case 'failed':
        alert.value = { kind: 'failed', action: change.kind, status: outcome.status, time: formatClockTime(clock()) }
        break
    }
    saving.value = false
  }

  async function signInAgain(): Promise<void> {
    discardPending()
    store.clear()
    await navigateTo('/login')
  }

  onBeforeUnmount(discardPending)

  return { pending, error, alert, saving, choose, startRemoval, cancel, confirm, signInAgain }
}

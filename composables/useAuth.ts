import { useSessionStore } from '../stores/session'
import type { LoginResponse, SessionResponse } from '../types'

export function useAuth() {
  const store = useSessionStore()

  /**
   * During server rendering, `$fetch` to an internal route does not carry the
   * browser's cookie: it has to be forwarded by hand or the session looks empty in
   * the initial HTML and the screen flickers on hydration.
   */
  async function fetchSession(): Promise<void> {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

    try {
      const response = await $fetch<SessionResponse>('/api/auth/session', { headers })
      store.setUser(response.user)
    }
    catch {
      store.clear()
    }
  }

  async function ensureSession(): Promise<void> {
    if (store.hydrated) return
    await fetchSession()
  }

  async function login(username: string, password: string): Promise<LoginResponse> {
    // `ignoreResponseError` lets 400 and 401 arrive as a body instead of an
    // exception: the endpoint returns the domain code in the body, and that code is
    // what the UI needs to show.
    const response = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      ignoreResponseError: true,
    })

    if (response.ok) store.setUser(response.user)

    return response
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' })
    store.clear()
    await navigateTo('/login')
  }

  return { fetchSession, ensureSession, login, logout }
}

import { defineStore } from 'pinia'
import type { SessionUser } from '../types'
import { initialsOf } from '../utils/initials'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)

  // Tells "we have not asked the server yet" apart from "we asked and there is
  // no session". Without this flag the middleware refetches on every navigation.
  const hydrated = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  const initials = computed(() => initialsOf(user.value?.displayName ?? ''))

  function setUser(newUser: SessionUser | null): void {
    user.value = newUser
    hydrated.value = true
  }

  function clear(): void {
    user.value = null
    hydrated.value = true
  }

  return { user, hydrated, isAuthenticated, initials, setUser, clear }
})

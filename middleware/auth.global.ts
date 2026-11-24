import { useSessionStore } from '../stores/session'
import { routeAccess } from '../utils/navigation'

export default defineNuxtRouteMiddleware(async (to) => {
  const store = useSessionStore()
  const { ensureSession } = useAuth()

  await ensureSession()

  const access = routeAccess(to.path, store.isAuthenticated)
  if (access.action === 'redirect') return navigateTo(access.to)
})

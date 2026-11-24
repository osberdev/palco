import { GATE_COOKIE } from '../../utils/gate-session'

/**
 * "Cerrar taquilla": deletes the gate cookie. Idempotent, also without an open
 * gate or a configuration. It does not touch the buyer's session.
 */
export default defineEventHandler((event) => {
  deleteCookie(event, GATE_COOKIE, { path: '/' })
  return { ok: true }
})

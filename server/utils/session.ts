import type { H3Event } from 'h3'

export interface SessionData {
  userId?: number
}

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7

/**
 * The cookie is sealed, not just signed: unsealed, the user id would travel in
 * plain sight and anyone could edit it from the inspector to impersonate another
 * user.
 */
export function usePalcoSession(event: H3Event) {
  const { sessionPassword } = useRuntimeConfig(event)

  return useSession<SessionData>(event, {
    name: 'palco_session',
    password: sessionPassword,
    maxAge: SEVEN_DAYS_IN_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  })
}

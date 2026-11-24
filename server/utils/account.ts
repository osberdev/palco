import type { H3Event } from 'h3'
import { findSessionUserById } from '../db/users.repository'

/**
 * The session user for account endpoints, never from the body or the route
 * (RN-SEG-01). Without a session, or with the session of a user that no longer
 * exists (for example after `db:reset`), 401.
 */
export async function requireAccountUserId(event: H3Event): Promise<number> {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number' || await findSessionUserById(userId) === null) {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }
  return userId
}

/** The JSON body, or `undefined` if it cannot be read: `readBody` throws its own 400. */
export async function readJsonBody(event: H3Event): Promise<unknown> {
  try {
    return await readBody(event)
  }
  catch {
    return undefined
  }
}

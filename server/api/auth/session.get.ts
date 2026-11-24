import { findSessionUserById } from '../../db/users.repository'
import type { SessionResponse } from '../../../types'

export default defineEventHandler(async (event): Promise<SessionResponse> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId

  if (typeof userId !== 'number') return { user: null }

  // Re-read from the database rather than trusting the cookie: if the user no longer
  // exists, the sealed session would still be cryptographically valid.
  const user = await findSessionUserById(userId)
  if (user === null) {
    await session.clear()
    return { user: null }
  }

  return { user }
})

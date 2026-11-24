import { deleteProfilePhoto, findSessionUserById } from '../../db/users.repository'
import type { ProfilePhotoResponse } from '../../../types'

/** Removes the photo and goes back to the initials (RN-PER-10). Idempotent. */
export default defineEventHandler(async (event): Promise<ProfilePhotoResponse> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number' || await findSessionUserById(userId) === null) {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  await deleteProfilePhoto(userId)
  const user = await findSessionUserById(userId)
  if (user === null) {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }
  return { ok: true, user }
})

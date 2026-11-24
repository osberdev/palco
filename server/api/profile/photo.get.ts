import { findProfilePhoto } from '../../db/users.repository'
import type { PhotoFormat } from '../../domain/photo'

const CONTENT_TYPES: Readonly<Record<PhotoFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * The session user's photo, never someone else's (RN-SEG-01): the route has no id.
 * The type comes from the format the domain recognized, not from what the browser
 * declared on upload, and `nosniff` prevents reinterpretation. The cache can be
 * immutable because the URL carries the version (`?v=`).
 */
export default defineEventHandler(async (event) => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  const photo = await findProfilePhoto(userId)
  if (photo === null) {
    throw createError({ statusCode: 404, message: 'Sin foto de perfil' })
  }

  setResponseHeaders(event, {
    'Content-Type': CONTENT_TYPES[photo.format],
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  return photo.data
})

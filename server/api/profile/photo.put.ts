import { findSessionUserById, saveProfilePhoto } from '../../db/users.repository'
import { evaluatePhotoSize, evaluateProfilePhoto } from '../../domain/photo'
import { err, type Result } from '../../domain/result'
import type { ProfilePhotoResponse } from '../../../types'

const failure = (result: Result): ProfilePhotoResponse =>
  ({ ok: false, code: result.code, message: result.message })

/**
 * Saves the session user's photo (RN-PER-06, RN-SEG-01). The body is the raw
 * bytes, without multipart. The request `Content-Type` is ignored: the domain
 * decides the format from the bytes.
 *
 * Order: session; `Content-Length`, which rejects the size without reading the
 * body; the full photo with `evaluateProfilePhoto`; and saving.
 */
export default defineEventHandler(async (event): Promise<ProfilePhotoResponse> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number' || await findSessionUserById(userId) === null) {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  const declaredLength = getRequestHeader(event, 'content-length')
  if (declaredLength === undefined || !/^[0-9]+$/.test(declaredLength)) {
    setResponseStatus(event, 400)
    return failure(err('ERR_INPUT_INVALID'))
  }
  const declaredSize = evaluatePhotoSize(Number(declaredLength))
  if (declaredSize.code === 'ERR_PHOTO_TOO_LARGE') {
    setResponseStatus(event, 400)
    return failure(declaredSize)
  }

  const raw = await readRawBody(event, false)
  const bytes = raw === undefined ? new Uint8Array(0) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)

  const photo = evaluateProfilePhoto(bytes)
  if (!photo.ok) {
    setResponseStatus(event, 400)
    return failure(photo.result)
  }

  await saveProfilePhoto(userId, photo.value.format, bytes)
  const user = await findSessionUserById(userId)
  if (user === null) {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }
  return { ok: true, user }
})

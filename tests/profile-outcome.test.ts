import { describe, expect, it } from 'vitest'
import { classifyProfileResponse } from '../utils/profile-outcome'

// What the profile screen does with the photo response. Each case carries its
// identifier in its name.

const user = {
  id: 1,
  username: 'RIVA030315MJCSLNA2JC',
  displayName: 'Ana Sofía Ríos Vela',
  photoVersion: 'd850a135-8472-4996-9b08-aa48e508cf4b',
}

describe('classifyProfileResponse', () => {
  it('PO1: 200 con el usuario y su versión', () => {
    expect(classifyProfileResponse(200, { ok: true, user })).toEqual({ kind: 'saved', user })
  })

  it('PO2: 200 al quitar, con photoVersion null', () => {
    const withoutPhoto = { ...user, photoVersion: null }
    expect(classifyProfileResponse(200, { ok: true, user: withoutPhoto })).toEqual({ kind: 'saved', user: withoutPhoto })
  })

  it('PO3: 200 sin un usuario con su forma', () => {
    expect(classifyProfileResponse(200, { ok: true, user: { ...user, photoVersion: 7 } })).toEqual({ kind: 'failed', status: 200 })
  })

  it('PO4: 400 con código y mensaje', () => {
    const body = { ok: false, code: 'ERR_PHOTO_FORMAT', message: 'La foto debe ser JPEG, PNG o WebP' }
    expect(classifyProfileResponse(400, body)).toEqual({ kind: 'rejected', code: 'ERR_PHOTO_FORMAT', message: 'La foto debe ser JPEG, PNG o WebP' })
  })

  it('PO5: un 400 sin la forma del rechazo no tiene mensaje que mostrar', () => {
    expect(classifyProfileResponse(400, { statusCode: 400, message: 'Bad Request' })).toEqual({ kind: 'failed', status: 400 })
  })

  it('PO6: 401', () => {
    expect(classifyProfileResponse(401, { statusCode: 401, message: 'Sesión requerida' })).toEqual({ kind: 'unauthorized' })
  })

  it('PO7: sin respuesta', () => {
    expect(classifyProfileResponse(0, null)).toEqual({ kind: 'offline' })
  })

  it.each([404, 500, 503])('PO8: %d', (status) => {
    expect(classifyProfileResponse(status, { statusCode: status })).toEqual({ kind: 'failed', status })
  })
})

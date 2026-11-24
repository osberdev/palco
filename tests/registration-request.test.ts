import { describe, expect, it } from 'vitest'
import { parseRegistrationBody } from '../server/utils/registration-request'

// The shape of the `POST /api/auth/register` body: exact, with no extra keys. There
// are five, including the optional email. Each case carries its identifier in its
// name.

const BODY = {
  username: 'PEML990417MJCRRC08JC',
  displayName: 'Lucía Pérez Martínez',
  email: 'lucia@example.com',
  password: '!Palco26',
  passwordConfirmation: '!Palco26',
}

describe('parseRegistrationBody', () => {
  // Without the email key, the body no longer has the shape.
  it('RB1: las cinco claves de texto → los cinco valores; con las cuatro anteriores → null', () => {
    expect(parseRegistrationBody(BODY)).toEqual(BODY)
    expect(parseRegistrationBody({ ...BODY, email: '' })).toEqual({ ...BODY, email: '' })
    const { email: _omitted, ...previous } = BODY
    expect(parseRegistrationBody(previous)).toBeNull()
  })

  // The email is part of the body; anything beyond it is another key.
  it('RB2: con una clave de más → null', () => {
    expect(parseRegistrationBody({ ...BODY, phone: '' })).toBeNull()
  })

  it('RB3: sin passwordConfirmation → null', () => {
    const { passwordConfirmation: _omitted, ...rest } = BODY
    expect(parseRegistrationBody(rest)).toBeNull()
  })

  it('RB4: una contraseña numérica → null; un correo que no es texto → null', () => {
    expect(parseRegistrationBody({ ...BODY, password: 12345678 })).toBeNull()
    expect(parseRegistrationBody({ ...BODY, email: null })).toBeNull()
  })

  it.each([
    ['null', null],
    ['un arreglo', [BODY]],
    ['un texto', JSON.stringify(BODY)],
  ])('RB5: %s → null', (_label, body) => {
    expect(parseRegistrationBody(body)).toBeNull()
  })
})

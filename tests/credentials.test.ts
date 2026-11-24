import { describe, expect, it } from 'vitest'
import { isAlphanumeric, isSpecial, validatePassword } from '../server/domain/credentials'
import { MESSAGES, type ResultCode } from '../server/domain/result'

const codeOf = (value: string): ResultCode => validatePassword(value).code

describe('isAlphanumeric', () => {
  it('reconoce el rango ASCII completo', () => {
    for (const ch of ['a', 'z', 'A', 'Z', '0', '9']) {
      expect(isAlphanumeric(ch), ch).toBe(true)
    }
  })

  it('excluye acentuadas, símbolos y espacio', () => {
    for (const ch of ['á', 'ñ', '_', '!', ' ']) {
      expect(isAlphanumeric(ch), ch).toBe(false)
      expect(isSpecial(ch), ch).toBe(true)
    }
  })
})

describe('validatePassword — exactamente 8 con las cuatro clases', () => {
  describe('longitud', () => {
    it('rechaza 7 caracteres', () => {
      expect(codeOf('Abc123$')).toBe('ERR_PASSWORD_LENGTH')
    })

    it('acepta 8 caracteres', () => {
      expect(validatePassword('Abc123$%').ok).toBe(true)
    })

    it('rechaza 9 caracteres', () => {
      expect(codeOf('Abc123$%!')).toBe('ERR_PASSWORD_LENGTH')
    })

    it('reporta el campo vacío como obligatorio y no como longitud', () => {
      expect(codeOf('')).toBe('ERR_PASSWORD_EMPTY')
    })
  })

  describe('clases obligatorias', () => {
    it('rechaza una contraseña sin mayúscula', () => {
      expect(codeOf('abc123$%')).toBe('ERR_PASSWORD_NO_UPPERCASE')
    })

    it('rechaza una contraseña sin minúscula', () => {
      expect(codeOf('ABC123$%')).toBe('ERR_PASSWORD_NO_LOWERCASE')
    })

    it('rechaza una contraseña sin dígito', () => {
      expect(codeOf('Abcdef$%')).toBe('ERR_PASSWORD_NO_DIGIT')
    })

    it('rechaza una contraseña sin carácter especial', () => {
      expect(codeOf('Abc12345')).toBe('ERR_PASSWORD_NO_SPECIAL')
    })
  })

  describe('posición del símbolo', () => {
    // The symbol is mandatory in any position.
    it('acepta el símbolo al inicio, en medio y al final', () => {
      for (const value of ['!Palco26', 'Cine#204', 'Teatro9$', 'Museo$7A']) {
        expect(validatePassword(value).ok, value).toBe(true)
      }
    })

    it('acepta dos símbolos interiores', () => {
      expect(validatePassword('Ab#1$2cd').ok).toBe(true)
    })
  })

  describe('espacios', () => {
    it('rechaza el espacio antes que la longitud', () => {
      // 'Abc 123$' has a valid length and a symbol: if the space were checked last, it
      // would count as the required special character.
      expect(codeOf('Abc 123$')).toBe('ERR_PASSWORD_HAS_SPACE')
    })

    it('rechaza el espacio aunque la longitud sea incorrecta', () => {
      expect(codeOf('Abc 1$')).toBe('ERR_PASSWORD_HAS_SPACE')
    })
  })

  describe('orden de evaluación', () => {
    it('reporta la mayúscula ante varias reglas incumplidas a la vez', () => {
      // 'abc12345' lacks both uppercase and a symbol; the fixed order makes the case's
      // oracle unambiguous.
      expect(codeOf('abc12345')).toBe('ERR_PASSWORD_NO_UPPERCASE')
    })
  })

  /**
   * The thirteen rows of the password reference table, copied literally. They are
   * the declared oracle: if someone changes the implementation without updating the
   * table, this test breaks.
   */
  describe('casos de referencia', () => {
    const CASES: readonly (readonly [string, ResultCode])[] = [
      ['Abc123$%', 'OK'],
      ['QwErTy9!', 'OK'],
      ['!Palco26', 'OK'],
      ['Cine#204', 'OK'],
      ['Teatro9$', 'OK'],
      ['Abc123$', 'ERR_PASSWORD_LENGTH'],
      ['Abc123$%!', 'ERR_PASSWORD_LENGTH'],
      ['', 'ERR_PASSWORD_EMPTY'],
      ['abc12345', 'ERR_PASSWORD_NO_UPPERCASE'],
      ['ABC123!@', 'ERR_PASSWORD_NO_LOWERCASE'],
      ['Abcdef$%', 'ERR_PASSWORD_NO_DIGIT'],
      ['Abc12345', 'ERR_PASSWORD_NO_SPECIAL'],
      ['Abc 123$', 'ERR_PASSWORD_HAS_SPACE'],
    ]

    it.each(CASES)('%s → %s', (value, expected) => {
      expect(validatePassword(value).code).toBe(expected)
    })
  })

  it('emite el mensaje del catálogo, nunca uno genérico', () => {
    expect(validatePassword('abc12345').message).toBe(MESSAGES.ERR_PASSWORD_NO_UPPERCASE)
    expect(validatePassword('Abc123$').message).toBe(MESSAGES.ERR_PASSWORD_LENGTH)
  })
})

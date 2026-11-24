import { describe, expect, it } from 'vitest'
import { computeCheckDigit, validateUsername } from '../server/domain/curp'
import type { ResultCode } from '../server/domain/result'

/** The four synthetic CURPs seeded in `scripts/db-seed.ts`. */
const SEEDS = [
  'RIVA030315MJCSLNA2JC',
  'TENB010908HCMLVRA6CM',
  'IASC951122MQTBLR02QT',
  'MEXD980704HNLNXG10NL',
] as const

const VALID = SEEDS[0]

/**
 * Completes a 17-character CURP with its check digit and the two state letters. It
 * is computed rather than written by hand because the cases using this helper test
 * the date, not the check digit.
 */
function withCheckDigit(seventeen: string, state: string): string {
  return `${seventeen}${computeCheckDigit(seventeen)}${state}`
}

const codeOf = (value: string): ResultCode => validateUsername(value).code

describe('validateUsername — CURP más entidad', () => {
  it('acepta las cuatro CURP semilla', () => {
    for (const seed of SEEDS) {
      expect(validateUsername(seed), seed).toMatchObject({ ok: true, code: 'OK' })
    }
  })

  it('acepta la X como letra normal en las posiciones 3 y 15', () => {
    // Diego Méndez has no second surname: X stands in for the missing surname in
    // position 3 and for the missing consonant in position 15.
    expect(validateUsername('MEXD980704HNLNXG10NL').ok).toBe(true)
  })

  describe('longitud', () => {
    it('rechaza 19 caracteres', () => {
      expect(codeOf(VALID.slice(0, 19))).toBe('ERR_CURP_LENGTH')
    })

    it('acepta 20 caracteres', () => {
      expect(validateUsername(VALID).ok).toBe(true)
    })

    it('rechaza 21 caracteres', () => {
      expect(codeOf(`${VALID}A`)).toBe('ERR_CURP_LENGTH')
    })

    it('reporta el campo vacío como obligatorio y no como longitud', () => {
      expect(codeOf('')).toBe('ERR_USERNAME_EMPTY')
    })
  })

  describe('transversales', () => {
    it('rechaza minúscula en la primera posición', () => {
      expect(codeOf(`r${VALID.slice(1)}`)).toBe('ERR_CURP_NOT_UPPERCASE')
    })

    it('rechaza minúscula en una posición interior', () => {
      expect(codeOf(`${VALID.slice(0, 14)}l${VALID.slice(15)}`)).toBe('ERR_CURP_NOT_UPPERCASE')
    })

    it('rechaza minúscula en la última posición', () => {
      expect(codeOf(`${VALID.slice(0, 19)}c`)).toBe('ERR_CURP_NOT_UPPERCASE')
    })

    it('rechaza espacio al inicio', () => {
      expect(codeOf(` ${VALID.slice(1)}`)).toBe('ERR_CURP_HAS_SPACE')
    })

    it('rechaza espacio en posición interior', () => {
      expect(codeOf(`${VALID.slice(0, 10)} ${VALID.slice(11)}`)).toBe('ERR_CURP_HAS_SPACE')
    })

    it('rechaza espacio al final', () => {
      expect(codeOf(`${VALID.slice(0, 19)} `)).toBe('ERR_CURP_HAS_SPACE')
    })

    it('rechaza carácter especial al inicio', () => {
      expect(codeOf(`-${VALID.slice(1)}`)).toBe('ERR_CURP_SPECIAL_CHAR')
    })

    it('rechaza carácter especial en posición interior', () => {
      expect(codeOf(`${VALID.slice(0, 10)}-${VALID.slice(11)}`)).toBe('ERR_CURP_SPECIAL_CHAR')
    })

    it('rechaza carácter especial al final', () => {
      expect(codeOf(`${VALID.slice(0, 19)}-`)).toBe('ERR_CURP_SPECIAL_CHAR')
    })
  })

  describe('formato posicional', () => {
    it('rechaza un dígito en las primeras 4 posiciones', () => {
      expect(codeOf(`1${VALID.slice(1)}`)).toBe('ERR_CURP_FORMAT_INITIALS')
    })

    it('rechaza un dígito en las posiciones 14 a 16', () => {
      expect(codeOf(`${VALID.slice(0, 13)}1${VALID.slice(14)}`)).toBe('ERR_CURP_FORMAT_CONSONANTS')
    })

    it('rechaza una marca de sexo distinta de H, M o X', () => {
      expect(codeOf(`${VALID.slice(0, 10)}Z${VALID.slice(11)}`)).toBe('ERR_CURP_INVALID_SEX')
    })

    it('acepta las tres marcas de sexo', () => {
      for (const mark of ['H', 'M', 'X']) {
        const value = withCheckDigit(`ABCD000315${mark}DFXXXA`, 'DF')
        expect(validateUsername(value).ok, mark).toBe(true)
      }
    })

    it('rechaza un código de entidad inexistente', () => {
      expect(codeOf(`${VALID.slice(0, 11)}ZZ${VALID.slice(13)}`)).toBe('ERR_CURP_INVALID_STATE')
    })

    it('rechaza letras finales que no coinciden con la entidad de nacimiento', () => {
      // The check digit does not change: it covers positions 1-17 and the two trailing
      // letters are outside it, so the mismatch is the only possible reason.
      expect(codeOf(`${VALID.slice(0, 18)}NL`)).toBe('ERR_CURP_STATE_MISMATCH')
    })
  })

  describe('dígito verificador', () => {
    it('rechaza una CURP válida con un carácter alterado', () => {
      expect(codeOf(`RIVB${VALID.slice(4)}`)).toBe('ERR_CURP_CHECKSUM')
    })

    it('rechaza un dígito verificador cambiado', () => {
      const wrong = String((Number(VALID[17]) + 1) % 10)
      expect(codeOf(`${VALID.slice(0, 17)}${wrong}${VALID.slice(18)}`)).toBe('ERR_CURP_CHECKSUM')
    })

    it('calcula el dígito de las cuatro semillas', () => {
      for (const seed of SEEDS) {
        expect(String(computeCheckDigit(seed)), seed).toBe(seed[17])
      }
    })

    it('no calcula sobre caracteres ajenos al alfabeto', () => {
      expect(computeCheckDigit('RIV-030315MJCSLNA2JC')).toBeNull()
    })
  })

  describe('fecha de nacimiento y siglo', () => {
    it('rechaza 29/02 cuando la homoclave es dígito: 1900 no es bisiesto', () => {
      expect(codeOf(withCheckDigit('ABCD000229HDFXXX1', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
    })

    it('acepta 29/02 cuando la homoclave es letra: 2000 sí es bisiesto', () => {
      expect(validateUsername(withCheckDigit('ABCD000229HDFXXXA', 'DF')).ok).toBe(true)
    })

    it('rechaza 31 de abril', () => {
      expect(codeOf(withCheckDigit('ABCD000431HDFXXXA', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
    })

    it('rechaza 31 de febrero', () => {
      expect(codeOf(withCheckDigit('ABCD000231HDFXXXA', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
    })

    it('rechaza el mes 00 y el mes 13', () => {
      expect(codeOf(withCheckDigit('ABCD000015HDFXXXA', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
      expect(codeOf(withCheckDigit('ABCD001315HDFXXXA', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
    })

    it('rechaza el día 00', () => {
      expect(codeOf(withCheckDigit('ABCD000300HDFXXXA', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
    })

    it('rechaza una fecha con letras', () => {
      expect(codeOf(withCheckDigit('ABCDAB0315HDFXXXA', 'DF'))).toBe('ERR_CURP_INVALID_DATE')
    })
  })

  /**
   * The eighteen rows of the username reference table, copied literally. They are
   * the declared oracle: if someone changes the implementation without updating the
   * table, this test breaks.
   */
  describe('casos de referencia', () => {
    const CASES: readonly (readonly [string, ResultCode])[] = [
      ['RIVA030315MJCSLNA2JC', 'OK'],
      ['TENB010908HCMLVRA6CM', 'OK'],
      ['IASC951122MQTBLR02QT', 'OK'],
      ['MEXD980704HNLNXG10NL', 'OK'],
      ['RIVA030315MJCSLNA2J', 'ERR_CURP_LENGTH'],
      ['RIVA030315MJCSLNA2JCA', 'ERR_CURP_LENGTH'],
      ['', 'ERR_USERNAME_EMPTY'],
      ['rIVA030315MJCSLNA2JC', 'ERR_CURP_NOT_UPPERCASE'],
      ['RIVA030315 JCSLNA2JC', 'ERR_CURP_HAS_SPACE'],
      ['RIVA030315-JCSLNA2JC', 'ERR_CURP_SPECIAL_CHAR'],
      ['1IVA030315MJCSLNA2JC', 'ERR_CURP_FORMAT_INITIALS'],
      ['RIVA030315MJC1LNA2JC', 'ERR_CURP_FORMAT_CONSONANTS'],
      ['RIVA030315ZJCSLNA2JC', 'ERR_CURP_INVALID_SEX'],
      ['RIVA030315MZZSLNA2JC', 'ERR_CURP_INVALID_STATE'],
      ['RIVB030315MJCSLNA2JC', 'ERR_CURP_CHECKSUM'],
      ['RIVA030315MJCSLNA2NL', 'ERR_CURP_STATE_MISMATCH'],
      ['ABCD000229HDFXXXA8DF', 'OK'],
      ['ABCD000229HDFXXX16DF', 'ERR_CURP_INVALID_DATE'],
    ]

    it.each(CASES)('%s → %s', (value, expected) => {
      expect(validateUsername(value).code).toBe(expected)
    })
  })
})

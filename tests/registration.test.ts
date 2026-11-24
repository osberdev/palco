import { describe, expect, it } from 'vitest'
import { validatePassword } from '../server/domain/credentials'
import { validateUsername } from '../server/domain/curp'
import {
  evaluateDisplayName,
  evaluatePasswordConfirmation,
  evaluateRegistration,
  evaluateRegistrationCurp,
  evaluateRegistrationEmail,
  nameLength,
  normalizeRegistrationEmail,
  type RegistrationField,
  type RegistrationInput,
} from '../server/domain/registration'
import { MESSAGES, type Result, type ResultCode } from '../server/domain/result'
import type { CalendarDate } from '../types'
import { EMAIL_ACCEPTED } from './helpers/emails'

// Registration (RN-PER-09, RN-REG-01 to 04). Each case carries its identifier in
// its name. The CURPs are synthetic and pass validateUsername.

const date = (year: number, month: number, day: number): CalendarDate => ({ year, month, day })
const TODAY = date(2026, 10, 13)

const LUCIA = 'PEML990417MJCRRC08JC' // 17/04/1999
const LEONARDO = 'GOAL100512HJCMRNA3JC' // 12/05/2010, under age
const EIGHTEEN = 'LOMA081014MJCPRRA6JC' // 14/10/2008: turns 18 on 14/10/2026
const LEAP = 'PEFA080229MJCRRNA5JC' // 29/02/2008
const UNBORN = 'XEXX300101HJCXXXA5JC' // 01/01/2030
const BAD_CHECKSUM = 'RIVB030315MJCSLNA2JC'

const BASE: RegistrationInput = {
  username: LUCIA,
  displayName: 'Lucía Pérez Martínez',
  // The optional email, empty in the database.
  email: '',
  password: '!Palco26',
  passwordConfirmation: '!Palco26',
}

function expectCode(result: Result, code: ResultCode): void {
  expect(result).toEqual(code === 'OK' ? { ok: true, code, message: '' } : { ok: false, code, message: MESSAGES[code] })
}

describe('CURP sintéticas', () => {
  it.each([LUCIA, LEONARDO, EIGHTEEN, LEAP, UNBORN])('%s pasa validateUsername', (curp) => {
    expect(validateUsername(curp).ok).toBe(true)
  })
})

describe('evaluateDisplayName (RN-PER-09)', () => {
  it.each([
    ['NM1: base', 'Lucía Pérez Martínez', 'OK'],
    ['NM2: vacío', '', 'ERR_NAME_EMPTY'],
    ['NM3: 60 letras, el límite incluido', 'a'.repeat(60), 'OK'],
    ['NM4: 61 letras', 'a'.repeat(61), 'ERR_NAME_TOO_LONG'],
    ['NM5: un dígito (A4)', 'Lucía 2', 'ERR_NAME_INVALID_CHARS'],
    ['NM6: solo espacios no es vacío', '   ', 'ERR_NAME_INVALID_CHARS'],
    ['NM7: la longitud antes que los caracteres', `${'a'.repeat(60)}2`, 'ERR_NAME_TOO_LONG'],
    ['NM9: apóstrofo y guion', "O'Connor-Ruiz", 'OK'],
    ['NM9: apóstrofo tipográfico', 'D’Angelo Ruiz', 'OK'],
    ['NM10: sin recorte', ' Ana Ríos', 'OK'],
  ] as const)('%s', (_label, text, code) => {
    expectCode(evaluateDisplayName(text), code)
  })

  it('NM8: se cuentan puntos de código', () => {
    const decomposed = 'é'
    expect(nameLength(decomposed.repeat(30))).toBe(60)
    expectCode(evaluateDisplayName(decomposed.repeat(30)), 'OK')
    expect(nameLength(decomposed.repeat(31))).toBe(62)
    expectCode(evaluateDisplayName(decomposed.repeat(31)), 'ERR_NAME_TOO_LONG')
  })
})

describe('evaluateRegistrationCurp (RN-REG-04)', () => {
  it('RC1: adulta', () => {
    expectCode(evaluateRegistrationCurp(LUCIA, TODAY), 'OK')
  })

  it('RC2: menor de edad', () => {
    expectCode(evaluateRegistrationCurp(LEONARDO, TODAY), 'ERR_REGISTRATION_UNDERAGE')
  })

  it('RC3: la frontera de los 18', () => {
    expectCode(evaluateRegistrationCurp(EIGHTEEN, date(2026, 10, 13)), 'ERR_REGISTRATION_UNDERAGE')
    expectCode(evaluateRegistrationCurp(EIGHTEEN, date(2026, 10, 14)), 'OK')
  })

  it('RC4: el 29 de febrero cumple el 1 de marzo', () => {
    expectCode(evaluateRegistrationCurp(LEAP, date(2026, 2, 28)), 'ERR_REGISTRATION_UNDERAGE')
    expectCode(evaluateRegistrationCurp(LEAP, date(2026, 3, 1)), 'OK')
  })

  it('RC5: un nacimiento futuro es menor de edad', () => {
    expectCode(evaluateRegistrationCurp(UNBORN, TODAY), 'ERR_REGISTRATION_UNDERAGE')
  })

  it('RC6: el formato antes que la edad', () => {
    expectCode(evaluateRegistrationCurp(BAD_CHECKSUM, TODAY), 'ERR_CURP_CHECKSUM')
  })

  it('RC7: today inválida', () => {
    expectCode(evaluateRegistrationCurp(LUCIA, date(2026, 2, 30)), 'ERR_DATE_INVALID')
  })
})

describe('evaluatePasswordConfirmation (RN-REG-03)', () => {
  it.each([
    ['PM1: coinciden', '!Palco26', '!Palco26', 'OK'],
    ['PM2: no coinciden (A4)', '!Palco26', '!Palco27', 'ERR_PASSWORD_MISMATCH'],
    ['PM3: sin normalizar', '!Palco26', '!Palco26 ', 'ERR_PASSWORD_MISMATCH'],
  ] as const)('%s', (_label, password, confirmation, code) => {
    expectCode(evaluatePasswordConfirmation(password, confirmation), code)
  })
})

describe('evaluateRegistration (RN-REG-01)', () => {
  // What is registered includes `email`, null for an empty email. It still excludes
  // the confirmation.
  it('RG1: base, sin la confirmación en lo registrado', () => {
    expect(evaluateRegistration(BASE, TODAY)).toEqual({
      ok: true,
      registration: { username: LUCIA, displayName: 'Lucía Pérez Martínez', email: null, password: '!Palco26' },
    })
  })

  it('RG2: la CURP antes que el nombre', () => {
    expect(evaluateRegistration({ ...BASE, username: LEONARDO, displayName: 'Lucía 2' }, TODAY))
      .toMatchObject({ ok: false, field: 'username', result: { code: 'ERR_REGISTRATION_UNDERAGE' } })
  })

  it('RG3: el nombre antes que la contraseña', () => {
    expect(evaluateRegistration({ ...BASE, displayName: 'Lucía 2', password: 'abc', passwordConfirmation: 'abc' }, TODAY))
      .toMatchObject({ ok: false, field: 'displayName', result: { code: 'ERR_NAME_INVALID_CHARS' } })
  })

  it('RG4: la contraseña antes que la confirmación', () => {
    expect(evaluateRegistration({ ...BASE, password: 'abc12345', passwordConfirmation: 'abc12346' }, TODAY))
      .toMatchObject({ ok: false, field: 'password', result: { code: 'ERR_PASSWORD_NO_UPPERCASE' } })
  })
})

describe('evaluateRegistrationEmail (RN-REG-06)', () => {
  it('RE1: vacío es válido', () => {
    expectCode(evaluateRegistrationEmail(''), 'OK')
  })

  it('RE2: un correo válido, y el resultado no depende de las mayúsculas', () => {
    expectCode(evaluateRegistrationEmail('ana.rios@example.com'), 'OK')
    expectCode(evaluateRegistrationEmail('Ana.Rios@Example.COM'), 'OK')
    expect(evaluateRegistrationEmail('Ana.Rios@Example.COM')).toEqual(evaluateRegistrationEmail('ana.rios@example.com'))
  })

  // One per evaluateEmail code a non-empty text can reach.
  it.each([
    ['RE3', 'ana rios@example.com', 'ERR_EMAIL_HAS_SPACE'],
    ['RE4', 'josé@example.com', 'ERR_EMAIL_NOT_ASCII'],
    ['RE5', 'a'.repeat(255), 'ERR_EMAIL_TOO_LONG'],
    ['RE6', 'ana.example.com', 'ERR_EMAIL_AT_SIGN'],
    ['RE7', '.ana@example.com', 'ERR_EMAIL_LOCAL_PART'],
    ['RE8', 'ana@example..com', 'ERR_EMAIL_DOMAIN'],
    ['RE9', 'ana@example.c', 'ERR_EMAIL_TLD'],
  ] as const)('%s: %s → %s', (_id, text, code) => {
    expectCode(evaluateRegistrationEmail(text), code)
  })

  it('RE10: el correo va después del nombre y antes de la contraseña', () => {
    expect(evaluateRegistration({ ...BASE, displayName: 'Lucía 2', email: 'ana@example..com' }, TODAY))
      .toMatchObject({ ok: false, field: 'displayName', result: { code: 'ERR_NAME_INVALID_CHARS' } })
    expect(evaluateRegistration({ ...BASE, email: 'ana@example..com', password: 'abc', passwordConfirmation: 'abc' }, TODAY))
      .toMatchObject({ ok: false, field: 'email', result: { code: 'ERR_EMAIL_DOMAIN' } })
  })

  it('RE11: lo registrado lleva null sin correo, y el correo en minúsculas', () => {
    const empty = evaluateRegistration(BASE, TODAY)
    const written = evaluateRegistration({ ...BASE, email: 'Ana.Rios@Example.COM' }, TODAY)
    expect(empty.ok && empty.registration.email).toBeNull()
    expect(written.ok && written.registration.email).toBe('ana.rios@example.com')
  })

  it('RE12: en minúsculas y en mayúsculas, el mismo veredicto; lo guardado es toLowerCase y normalizar es idempotente', () => {
    expect(EMAIL_ACCEPTED).toHaveLength(11)
    for (const [id, accepted] of EMAIL_ACCEPTED) {
      const lower = accepted.toLowerCase()
      const upper = accepted.toUpperCase()
      expect(evaluateRegistrationEmail(lower), id).toEqual(evaluateRegistrationEmail(upper))
      expectCode(evaluateRegistrationEmail(upper), 'OK')
      for (const form of [accepted, lower, upper]) {
        const stored = normalizeRegistrationEmail(form)
        expect(stored, id).toBe(form.toLowerCase())
        expect(normalizeRegistrationEmail(stored!), id).toBe(stored)
      }
    }
  })
})

// Cartesian product: 4 CURPs × 4 names × 3 emails × 2 passwords × 2
// confirmations. The emails: empty, valid and invalid.
const UNIVERSE: RegistrationInput[] = [LUCIA, LEONARDO, UNBORN, BAD_CHECKSUM].flatMap((username) =>
  ['Lucía Pérez Martínez', '', 'a'.repeat(61), 'Lucía 2'].flatMap((displayName) =>
    ['', 'ana.rios@example.com', 'ana@example..com'].flatMap((email) =>
      ['!Palco26', 'abc12345'].flatMap((password) =>
        [password, `${password}x`].map((passwordConfirmation) => ({ username, displayName, email, password, passwordConfirmation })),
      ),
    ),
  ),
)

function byField(input: RegistrationInput): Readonly<Record<RegistrationField, Result>> {
  return {
    username: evaluateRegistrationCurp(input.username, TODAY),
    displayName: evaluateDisplayName(input.displayName),
    email: evaluateRegistrationEmail(input.email),
    password: validatePassword(input.password),
    passwordConfirmation: evaluatePasswordConfirmation(input.password, input.passwordConfirmation),
  }
}

describe('invariantes del registro', () => {
  // 192 inputs.
  it('INV20: la compuesta da OK si y solo si los cinco campos dan OK', () => {
    expect(UNIVERSE).toHaveLength(192)
    for (const input of UNIVERSE) {
      const allOk = Object.values(byField(input)).every((result) => result.ok)
      expect(evaluateRegistration(input, TODAY).ok).toBe(allOk)
    }
  })

  it('INV21: el motivo de la compuesta es el de su campo', () => {
    for (const input of UNIVERSE) {
      const selection = evaluateRegistration(input, TODAY)
      if (selection.ok) continue
      expect(byField(input)[selection.field]).toEqual(selection.result)
    }
  })

  it('INV22: ningún rechazo contiene la contraseña (RNF-14)', () => {
    for (const input of UNIVERSE) {
      const selection = evaluateRegistration(input, TODAY)
      if (selection.ok) continue
      expect(JSON.stringify(selection)).not.toContain(input.password)
    }
  })
})

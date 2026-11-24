import { describe, expect, it } from 'vitest'
import { avatarLinkLabel, initialsOf } from '../utils/initials'

// The top bar circle's initials. IN1 to IN3 pin that the seeded users do not
// change. Each case carries its identifier in its name.

describe('initialsOf', () => {
  it.each([
    ['IN1', 'Ana Sofía Ríos Vela', 'AS'],
    ['IN2', 'Diego Méndez', 'DM'],
    ['IN3', 'Lucía', 'LU'],
    ['IN4', "'Ana Ríos", 'AR'],
    ['IN5', "' Ana  Ríos '", 'AR'],
    ['IN6', "'\u00E9lise Roy'", '\u00C9R'],
    // The same decomposed "é": e + U+0301.
    ['IN6b', "'e\u0301lise Roy'", '\u00C9R'],
    ['IN7', '- Ana', 'AN'],
  ])('%s: %s → %s', (_id, name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('IN8: una letra del plano astral se toma completa', () => {
    // U+10428 and U+10429, lowercase letters of the Deseret alphabet; U+10400 is the
    // uppercase of U+10428.
    const initials = initialsOf('\u{10428}\u{10429} Roy')
    expect(initials).toBe('\u{10400}R')
    expect(initials).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('sin ninguna letra → vacío', () => {
    expect(initialsOf('')).toBe('')
    expect(initialsOf("' - '")).toBe('')
  })
})

describe('avatarLinkLabel (WCAG 2.5.3)', () => {
  it('AV1: con iniciales, el nombre empieza con el texto visible', () => {
    expect(avatarLinkLabel('AS')).toBe('AS, perfil')
    expect(avatarLinkLabel(initialsOf('Ana Sofía Ríos Vela'))).toMatch(/^AS/)
  })

  it('AV2: sin texto visible (con foto) → Perfil', () => {
    expect(avatarLinkLabel('')).toBe('Perfil')
  })

  it('AV3: las iniciales con acento se conservan al inicio', () => {
    expect(avatarLinkLabel(initialsOf('élise Roy'))).toBe('ÉR, perfil')
  })
})

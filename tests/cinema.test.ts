import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import {
  CINEMA_FORMAT_IDS,
  MINIMUM_AGE,
  evaluateAge,
  evaluateFilm,
  evaluateFormat,
  evaluateSeat,
} from '../server/domain/cinema'
import type { CinemaVenue, FilmClassification } from '../types'
import { CINEMA_FORMAT_NAMES, CLASSIFICATION_LABELS } from '../utils/cinema'

function cinema(id: string): CinemaVenue {
  const found = VENUES.find((v) => v.id === id)
  if (!found || found.category !== 'cine') throw new Error(`No es un cine: ${id}`)
  return found
}

const CINEMAS = VENUES.filter((v): v is CinemaVenue => v.category === 'cine')

describe('formatos', () => {
  it('G1 — CINEMA_FORMAT_IDS tiene 18 ids en el orden de CINEMA_FORMAT_NAMES', () => {
    expect(CINEMA_FORMAT_IDS).toHaveLength(18)
    expect([...CINEMA_FORMAT_IDS]).toEqual(Object.keys(CINEMA_FORMAT_NAMES))
  })

  it.each(CINEMAS.map((c) => [c.id, c] as const))('G2 — los formatos de %s siguen el orden del enum', (_, c) => {
    const positions = c.formats.map((f) => CINEMA_FORMAT_IDS.indexOf(f.id))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it.each(CINEMAS.map((c) => [c.id, c] as const))('G3 — %s no opera VR', (_, c) => {
    expect(evaluateFormat(c, 'vr').code).toBe('ERR_FORMAT_UNAVAILABLE')
  })

  it('G4 — Cinemark no opera IMAX, aunque otras cadenas sí', () => {
    expect(evaluateFormat(cinema('cinemark'), 'imax').code).toBe('ERR_FORMAT_UNAVAILABLE')
  })

  it('G5 — Cinemark opera XD', () => {
    expect(evaluateFormat(cinema('cinemark'), 'xd').code).toBe('OK')
  })

  it('G6 — un id fuera del enum es entrada inválida', () => {
    expect(evaluateFormat(cinema('cinemark'), 'foo').code).toBe('ERR_INPUT_INVALID')
  })
})

describe('película', () => {
  it('G7 — Cinemex tiene 3 películas: el índice 3 no existe', () => {
    expect(evaluateFilm(cinema('cinemex'), 3).code).toBe('ERR_FILM_INVALID')
  })

  it('G8 — un índice no entero es entrada inválida', () => {
    expect(evaluateFilm(cinema('cinepolis'), 1.5).code).toBe('ERR_INPUT_INVALID')
  })
})

describe('evaluateAge — frontera de cada clasificación', () => {
  it.each([
    ['A1', 'AA', 0, 'OK'],
    ['A2', 'A', 0, 'OK'],
    ['A3', 'B', 0, 'OK'],
    ['A4', 'B15', 0, 'OK'],
    ['A5', 'G', 0, 'OK'],
    ['A6', 'PG', 0, 'OK'],
    ['A7', 'PG-13', 12, 'ERR_AGE_INSUFFICIENT'],
    ['A8', 'PG-13', 13, 'OK'],
    ['A9', 'R', 16, 'ERR_AGE_INSUFFICIENT'],
    ['A10', 'R', 17, 'OK'],
    ['A11', 'NC-17', 16, 'ERR_AGE_INSUFFICIENT'],
    ['A12', 'NC-17', 17, 'OK'],
    ['A13', 'C', 17, 'ERR_AGE_INSUFFICIENT'],
    ['A14', 'C', 18, 'OK'],
    ['A15', 'D', 17, 'ERR_AGE_INSUFFICIENT'],
    ['A16', 'D', 18, 'OK'],
    ['A17', 'C', -1, 'ERR_INPUT_INVALID'],
    ['A18', 'C', 18.5, 'ERR_INPUT_INVALID'],
  ] as const)('%s — %s con %d → %s', (_, classification, age, expected) => {
    expect(evaluateAge(classification, age).code).toBe(expected)
  })

  it('A19 — una clasificación desconocida es entrada inválida', () => {
    expect(evaluateAge('X' as FilmClassification, 30).code).toBe('ERR_INPUT_INVALID')
  })
})

describe('evaluateSeat — sala de 60 butacas', () => {
  it.each([
    ['S1', 0, 60, 'ERR_SEAT_INVALID'],
    ['S2', 1, 60, 'OK'],
    ['S3', 60, 60, 'OK'],
    ['S4', 61, 60, 'ERR_SEAT_INVALID'],
    ['S5', 12.5, 60, 'ERR_INPUT_INVALID'],
    ['S6', 1, 0, 'ERR_INPUT_INVALID'],
  ] as const)('%s — asiento %d de %d → %s', (_, seat, roomSeats, expected) => {
    expect(evaluateSeat(seat, roomSeats).code).toBe(expected)
  })
})

describe('etiquetas de clasificación', () => {
  // The age field hint announces the same age the rule applies.
  it.each(['PG-13', 'R', 'NC-17', 'C'] as const)('L2 — la etiqueta de %s dice su edad mínima', (classification) => {
    expect(CLASSIFICATION_LABELS[classification]).toContain(`${MINIMUM_AGE[classification]} años en adelante`)
  })

  it('L1 — cubren las 11 clasificaciones y ninguna queda en inglés', () => {
    expect(Object.keys(CLASSIFICATION_LABELS)).toHaveLength(11)
    for (const label of Object.values(CLASSIFICATION_LABELS)) {
      expect(label).not.toMatch(/general audiences|parental guidance|under|adults|accompan/i)
    }
  })
})

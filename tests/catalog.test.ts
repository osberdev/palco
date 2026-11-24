import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { referencePrice } from '../server/domain/booking'
import { toCatalogVenue, toVenueDetail } from '../server/utils/catalog'
import type { CatalogVenue, CinemaVenue, TheaterVenue, Venue } from '../types'
import { CINEMA_FORMAT_NAMES } from '../utils/cinema'

// Counts and minimum prices taken from the legacy console implementation's data.

function venue(id: string): Venue {
  const found = VENUES.find((v) => v.id === id)
  if (!found) throw new Error(`No existe en el catálogo: ${id}`)
  return found
}

function theater(id: string): TheaterVenue {
  const found = venue(id)
  if (found.category !== 'teatro') throw new Error(`No es un teatro: ${id}`)
  return found
}

function cinema(id: string): CinemaVenue {
  const found = venue(id)
  if (found.category !== 'cine') throw new Error(`No es un cine: ${id}`)
  return found
}

describe('datos de secciones y formatos', () => {
  it.each([
    ['teatro-colon', 7],
    ['teatro-scala', 7],
    ['teatro-metropolitan', 5],
  ])('%s tiene %i secciones', (id, count) => {
    expect(theater(id).sections).toHaveLength(count)
  })

  it.each([
    ['cinemark', 4],
    ['cinepolis', 7],
    ['cinemex', 7],
    ['amc', 5],
  ])('%s tiene %i formatos', (id, count) => {
    expect(cinema(id).formats).toHaveLength(count)
  })

  it('ningún cine ofrece vr', () => {
    const cinemas = VENUES.filter((v): v is CinemaVenue => v.category === 'cine')
    expect(cinemas).toHaveLength(4)
    for (const c of cinemas) expect(c.formats.map((f) => f.id)).not.toContain('vr')
  })

  it('CINEMA_FORMAT_NAMES tiene los 18 ids', () => {
    expect(Object.keys(CINEMA_FORMAT_NAMES)).toHaveLength(18)
  })
})

describe('referencePrice — R1–R12', () => {
  it.each([
    ['R1', 'teatro-colon', 800000],
    ['R2', 'teatro-scala', 3500],
    ['R3', 'teatro-metropolitan', 50000],
    ['R4', 'cinemark', 1400],
    ['R5', 'cinepolis', 9500],
    ['R6', 'cinemex', 9000],
    ['R7', 'amc', 1500],
    ['R8', 'louvre', 2200],
    ['R9', 'met', 3000],
    ['R10', 'vaticanos', 2000],
    ['R11', 'mna', 10500],
    ['R12', 'mnac', 1200],
  ])('%s %s → %d', (_id, venueId, expected) => {
    expect(referencePrice(venue(venueId))).toBe(expected)
  })
})

describe('toCatalogVenue', () => {
  it.each([
    ['teatro-colon', 7],
    ['cinepolis', 7],
    ['louvre', null],
  ])('detailCount de %s es %s', (id, expected) => {
    expect(toCatalogVenue(venue(id), 0).detailCount).toBe(expected)
  })

  it.each([
    ['louvre', true],
    ['mna', true],
    ['met', false],
    ['cinepolis', false],
  ])('hasResidentFee de %s es %s', (id, expected) => {
    expect(toCatalogVenue(venue(id), 0).hasResidentFee).toBe(expected)
  })

  it('available es el valor que recibe', () => {
    expect(toCatalogVenue(venue('teatro-colon'), 123).available).toBe(123)
  })

  it('las claves son exactamente las de CatalogVenue', () => {
    // The record forces listing every key: if CatalogVenue gains or loses one, this
    // stops compiling.
    const keys: Record<keyof CatalogVenue, true> = {
      id: true,
      name: true,
      city: true,
      category: true,
      currency: true,
      capacity: true,
      available: true,
      referencePrice: true,
      detailCount: true,
      hasResidentFee: true,
    }
    for (const v of VENUES) {
      expect(Object.keys(toCatalogVenue(v, 0)).sort()).toEqual(Object.keys(keys).sort())
    }
  })
})

describe('cartelera de los teatros', () => {
  it.each([
    ['teatro-colon', ['Aida (Verdi)', 'La bohème (Puccini)', 'El lago de los cisnes (Chaikovski)']],
    ['teatro-scala', ['Nabucco (Verdi)', 'Madama Butterfly (Puccini)', 'Il barbiere di Siviglia (Rossini)']],
    ['teatro-metropolitan', ['Mentiras, el musical', 'Hoy no me puedo levantar', 'Rent']],
  ])('%s tiene sus 3 obras, en orden', (id, plays) => {
    expect(theater(id).plays).toEqual(plays)
  })
})

describe('cartelera de cine', () => {
  it.each([
    ['cinemark', [['Spider-Man: Brand New Day', 'PG-13', 148], ['Toy Story 5', 'G', 100], ['Insidious', 'R', 112], ['Coyote vs Acme', 'PG', 95]]],
    ['cinepolis', [['Spider-Man: Brand New Day', 'B', 148], ['Toy Story 5', 'AA', 100], ['La Odisea', 'B15', 165], ['Insidious', 'C', 112]]],
    ['cinemex', [['Spider-Man: Brand New Day', 'B', 148], ['Toy Story 5', 'AA', 100], ['La Odisea', 'B15', 165]]],
    ['amc', [['Spider-Man: Brand New Day', 'PG-13', 148], ['Toy Story 5', 'G', 100], ['Insidious', 'R', 112]]],
  ] as const)('%s tiene su cartelera, en orden', (id, films) => {
    expect(cinema(id).films.map((f) => [f.title, f.classification, f.durationMinutes])).toEqual(films)
  })
})

describe('toVenueDetail', () => {
  it.each([
    ['teatro-colon', ['Platea', 'Palcos bajos', 'Palcos balcón', 'Cazuela', 'Tertulia', 'Galería', 'Paraíso']],
    ['teatro-scala', ['Platea', 'Palchi I ordine', 'Palchi II ordine', 'Palchi III ordine', 'Palchi IV ordine', 'Galleria I', 'Galleria II (loggione)']],
    ['teatro-metropolitan', ['Preferente A', 'Preferente B', 'Luneta', 'Balcón', 'Anfiteatro']],
  ])('%s → TheaterDetail con userLimit 10 y sus secciones', (id, sections) => {
    const detail = toVenueDetail(venue(id), 42, 10)
    expect(detail).not.toBeNull()
    expect(detail?.category).toBe('teatro')
    expect(detail?.userLimit).toBe(10)
    expect(detail?.available).toBe(42)
    expect(detail?.category === 'teatro' && detail.venue.sections.map((s) => s.name)).toEqual(sections)
  })

  it.each(['cinemark', 'cinepolis', 'cinemex', 'amc'])('%s → CinemaDetail con userLimit 10', (id) => {
    const detail = toVenueDetail(venue(id), 42, 10)
    expect(detail?.category).toBe('cine')
    expect(detail?.userLimit).toBe(10)
    expect(detail?.available).toBe(42)
    expect(detail?.venue.id).toBe(id)
  })

  it.each(['louvre', 'met', 'vaticanos', 'mna', 'mnac'])('%s → MuseumDetail con userLimit 5', (id) => {
    const detail = toVenueDetail(venue(id), 42, 5)
    expect(detail.category).toBe('museo')
    expect(detail.userLimit).toBe(5)
    expect(detail.available).toBe(42)
    expect(detail.venue.id).toBe(id)
  })
})

describe('residencyQuestion', () => {
  it.each([
    ['louvre', '¿Resides en la Unión Europea?'],
    ['mna', '¿Eres mexicano o resides en México?'],
    ['met', null],
    ['vaticanos', null],
    ['mnac', null],
  ])('%s → %s', (id, question) => {
    const found = venue(id)
    expect(found.category === 'museo' && found.residencyQuestion).toBe(question)
  })
})

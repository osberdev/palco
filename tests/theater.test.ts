import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { evaluatePlay, evaluateSection } from '../server/domain/theater'
import type { TheaterVenue } from '../types'

function theater(id: string): TheaterVenue {
  const found = VENUES.find((v) => v.id === id)
  if (!found || found.category !== 'teatro') throw new Error(`No es un teatro: ${id}`)
  return found
}

describe('evaluateSection — frontera por teatro', () => {
  it.each([
    ['teatro-colon', 6, 'OK'],
    ['teatro-colon', 7, 'ERR_SECTION_INVALID'],
    ['teatro-scala', 6, 'OK'],
    ['teatro-scala', 7, 'ERR_SECTION_INVALID'],
    // Metropólitan: the legacy console implementation gives OK for 4 and
    // ERR_SECTION_INVALID for 5.
    ['teatro-metropolitan', 4, 'OK'],
    ['teatro-metropolitan', 5, 'ERR_SECTION_INVALID'],
    ['teatro-scala', -1, 'ERR_SECTION_INVALID'],
    ['teatro-scala', 1.5, 'ERR_INPUT_INVALID'],
  ])('%s, índice %d → %s', (id, index, expected) => {
    expect(evaluateSection(theater(id), index).code).toBe(expected)
  })
})

describe('evaluatePlay', () => {
  it.each([
    [0, 'OK'],
    [2, 'OK'],
    [3, 'ERR_PLAY_INVALID'],
    [-1, 'ERR_PLAY_INVALID'],
    [0.5, 'ERR_INPUT_INVALID'],
  ])('índice %d → %s', (index, expected) => {
    expect(evaluatePlay(theater('teatro-scala'), index).code).toBe(expected)
  })
})

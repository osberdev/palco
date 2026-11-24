import type { CinemaFormatId, FilmClassification } from '../types'

/**
 * Cinema presentation helpers: format and classification names. They live here
 * rather than next to the server catalog because the screen names all 18 formats,
 * operated or not, and the client does not import server data. The precedent is
 * `utils/categories.ts`.
 */

/** Display names of the cinema formats. */
export const CINEMA_FORMAT_NAMES: Readonly<Record<CinemaFormatId, string>> = Object.freeze({
  'tradicional': 'Tradicional',
  'pluus': 'Cinépolis Pluus',
  'vip': 'VIP',
  'macro-xe': 'Macro XE',
  'junior': 'Cinépolis Junior',
  '4dx': '4DX',
  'x4d': 'X4D',
  'platino': 'Platino',
  'premium': 'Premium',
  'cinemextremo': 'CinemeXtremo',
  'cinema': 'CineMá',
  'imax': 'IMAX',
  'xd': 'XD',
  'd-box': 'D-BOX',
  'screenx': 'ScreenX',
  'dolby': 'Dolby Cinema',
  'prime': 'Prime',
  'vr': 'VR',
})

/**
 * Classification labels, with G and PG translated (RNF-20). R and NC-17 announce
 * the minimum age `evaluateAge` applies; B and B15 do not match the rule yet, which
 * does not restrict them.
 */
export const CLASSIFICATION_LABELS: Readonly<Record<FilmClassification, string>> = Object.freeze({
  'AA': 'AA (público infantil)',
  'A': 'A (todo público)',
  'B': 'B (12 años en adelante)',
  'B15': 'B15 (15 años en adelante)',
  'C': 'C (18 años en adelante)',
  'D': 'D (exclusiva para adultos)',
  'G': 'G (audiencia general)',
  'PG': 'PG (guía parental)',
  'PG-13': 'PG-13 (13 años en adelante)',
  'R': 'R (17 años en adelante)',
  'NC-17': 'NC-17 (17 años en adelante)',
})

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// A static test (RNF-11): it analyzes the text of the stylesheets, not the computed
// CSS. Scoped rules beat base.css's universal selector, so reduced motion only
// reaches them if their durations are tokens or they declare their own override.

const ROOT = join(import.meta.dirname, '..')

function collect(directory: string, extension: string): string[] {
  return readdirSync(join(ROOT, directory), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith(extension))
    .map((path) => join(ROOT, directory, path))
}

const FILES = [
  ...collect('components', '.vue'),
  ...collect('layouts', '.vue'),
  ...collect('pages', '.vue'),
  ...collect('assets/css', '.css'),
].map((path) => ({ path: relative(ROOT, path), source: readFileSync(path, 'utf8') }))

const TIME_LITERAL = /(?<![\w-])(\d*\.?\d+)(ms|s)\b/g
const DURATION_TOKEN = /var\(--dur-(fast|base|slow)\)/
const REDUCED_MOTION = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/

function declarations(source: string, property: RegExp): string[] {
  const pattern = new RegExp(`(?<![\\w-])(?:${property.source})\\s*:\\s*([^;{}]+);`, 'g')
  return [...source.matchAll(pattern)].map((match) => match[1]!.trim())
}

function nonZeroLiterals(value: string): string[] {
  return [...value.matchAll(TIME_LITERAL)]
    .filter((match) => Number(match[1]) !== 0)
    .map((match) => match[0])
}

describe('movimiento reducido (RNF-11)', () => {
  it('MO1: toda duración de transición es un token de duración o 0', () => {
    const offenders = FILES.flatMap(({ path, source }) =>
      declarations(source, /transition|transition-duration/)
        .filter((value) => nonZeroLiterals(value).length > 0)
        .map((value) => `${path}: ${value}`),
    )
    expect(offenders).toEqual([])
    // The test is not vacuous: the transitions exist and use the tokens.
    const tokenized = FILES.flatMap(({ source }) =>
      declarations(source, /transition/).filter((value) => DURATION_TOKEN.test(value)),
    )
    expect(tokenized.length).toBeGreaterThan(0)
  })

  it('MO2: toda animación con duración literal tiene su anulación de movimiento reducido', () => {
    const animated = FILES.filter(({ source }) =>
      declarations(source, /animation|animation-duration/).some(
        (value) => nonZeroLiterals(value).length > 0,
      ),
    )
    const offenders = animated
      .filter(({ source }) => {
        const block = source.split(REDUCED_MOTION)[1]
        return block === undefined || !/animation(-name)?\s*:\s*none/.test(block)
      })
      .map(({ path }) => path)
    expect(offenders).toEqual([])
    expect(animated.map(({ path }) => path)).toContain('components/ui/BaseButton.vue')
  })

  it('MO3: tokens.css anula los tres tokens de duración con movimiento reducido', () => {
    const tokens = FILES.find(({ path }) => path === 'assets/css/tokens.css')
    expect(tokens).toBeDefined()
    const block = tokens?.source.split(REDUCED_MOTION)[1] ?? ''
    for (const token of ['fast', 'base', 'slow']) {
      expect(block).toMatch(new RegExp(`--dur-${token}:\\s*0ms;`))
    }
  })
})

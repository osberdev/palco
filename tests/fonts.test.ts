import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TICKET_FONT_FILES } from '../server/utils/ticket-pdf'

// The local fonts of the design system and the ticket: @nuxt/fonts's `local`
// provider takes them from server/assets/fonts/, which Nitro publishes at /fonts.
// Each case carries its identifier in its name.

const ROOT = resolve(import.meta.dirname, '..')
const FONTS_DIRECTORY = resolve(ROOT, 'server/assets/fonts')
const FONT_FILE_RE = /\.(?:ttf|woff|woff2|eot|otf)$/

/**
 * A transcription of `generateSlugs` from the @nuxt/fonts 0.10.3 local provider
 * (dist/module.mjs), with JavaScript regular expressions instead of magic-regexp.
 * It lives only in the test: if the version changes, FN1 says so before comparing
 * anything.
 */
const WEIGHT_NAMES: Readonly<Record<string, string>> = {
  100: 'thin', 200: 'extra-light', 300: 'light', 400: 'normal', 500: 'medium',
  600: 'semi-bold', 700: 'bold', 800: 'extra-bold', 900: 'black',
}
const WEIGHT_TOKENS = [...new Set(Object.entries(WEIGHT_NAMES).flat().filter((token) => token !== 'normal'))]
const WEIGHT_ALTERNATIVES = [...new Set([...WEIGHT_TOKENS, ...WEIGHT_TOKENS.map((token) => token.replace('-', ''))])]
const WEIGHT_RE = new RegExp(`(?<=\\D)(?<weight>${WEIGHT_ALTERNATIVES.join('|')})(?=\\D|\\b)`, 'i')
const STYLE_RE = /(?<style>italic|oblique)(?=\W|\b)/i
const SUBSET_RE = /(?<subset>cyrillic-ext|cyrillic|greek-ext|greek|vietnamese|latin-ext|latin)(?=\W|\b)/i

const familySlug = (family: string): string => family.toLowerCase().replace(/\W+/g, '')

function fileSlugs(file: string): readonly string[] {
  let name = file.replace(/\.[^.]*$/, '')
  const weight = name.match(WEIGHT_RE)?.groups?.weight ?? 'normal'
  const style = name.match(STYLE_RE)?.groups?.style ?? 'normal'
  const subset = name.match(SUBSET_RE)?.groups?.subset ?? 'latin'
  for (const slug of [weight, style, subset]) name = name.replace(slug, '')
  const slugs = new Set<string>()
  for (const stem of [name.replace(/\.\w*$/, ''), name.replace(/[._-]\w*$/, '')]) {
    slugs.add([familySlug(stem.replace(/[\W_]+$/, '')), WEIGHT_NAMES[weight] ?? weight, style, subset].join('-').toLowerCase())
  }
  return [...slugs]
}

/** What the provider looks up for a family, a weight and a style, in latin. */
const lookupSlug = (family: string, weight: number, style: string): string =>
  [familySlug(family), WEIGHT_NAMES[weight] ?? String(weight), style, 'latin'].join('-')

/** The `fonts.families` of nuxt.config.ts, read from the text. */
function configuredFamilies(): readonly { name: string, weights: number[], styles: string[] }[] {
  const config = readFileSync(resolve(ROOT, 'nuxt.config.ts'), 'utf8')
  const entries = [...config.matchAll(/\{ name: '([^']+)', weights: \[([^\]]+)\], styles: \[([^\]]+)\] \}/g)]
  return entries.map(([, name, weights, styles]) => ({
    name: name!,
    weights: weights!.split(',').map((weight) => Number(weight.trim())),
    styles: [...styles!.matchAll(/'([^']+)'/g)].map((match) => match[1]!),
  }))
}

interface FontkitFont {
  hasGlyphForCodePoint(codePoint: number): boolean
}
interface Fontkit {
  openSync(path: string): FontkitFont
}

describe('fuentes locales', () => {
  it('FN1: cada familia, peso y estilo de nuxt.config.ts tiene su archivo con el nombre que reconoce el proveedor local', () => {
    const installed = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/@nuxt/fonts/package.json'), 'utf8')) as { version: string }
    expect(installed.version, 'la transcripción de generateSlugs es de la 0.10.3').toBe('0.10.3')

    const files = readdirSync(FONTS_DIRECTORY).filter((file) => FONT_FILE_RE.test(file))
    const registry = new Map<string, string[]>()
    for (const file of files) {
      for (const slug of fileSlugs(file)) registry.set(slug, [...(registry.get(slug) ?? []), file])
    }

    const families = configuredFamilies()
    expect(families.map((family) => family.name)).toEqual(['Instrument Serif', 'Geist', 'Geist Mono'])
    const found: Record<string, readonly string[]> = {}
    for (const family of families) {
      for (const weight of family.weights) {
        for (const style of family.styles) {
          found[`${family.name} ${weight} ${style}`] = registry.get(lookupSlug(family.name, weight, style)) ?? []
        }
      }
    }
    expect(found).toEqual({
      'Instrument Serif 400 normal': ['InstrumentSerif-Regular.ttf'],
      'Instrument Serif 400 italic': ['InstrumentSerif-Italic.woff'],
      'Geist 400 normal': ['Geist-Regular.ttf'],
      'Geist 500 normal': ['Geist-Medium.ttf'],
      'Geist 600 normal': ['Geist-600.ttf'],
      'Geist Mono 400 normal': ['GeistMono-Regular.ttf'],
      'Geist Mono 500 normal': ['GeistMono-Medium.ttf'],
    })
  })

  it('FN2: cada fuente del PDF existe', () => {
    for (const file of Object.values(TICKET_FONT_FILES)) {
      expect(existsSync(resolve(FONTS_DIRECTORY, file)), file).toBe(true)
    }
  })

  it('FN3: Instrument Serif itálica tiene todos los caracteres de los textos que la usan', () => {
    // Only the sign-in tagline uses it: .display-md is italic in base.css, but
    // ErrorState and EmptyState, its only users, set it upright.
    const panel = readFileSync(resolve(ROOT, 'components/auth/AuthBrandPanel.vue'), 'utf8')
    const tagline = panel.match(/<p class="tagline">([^<]+)<\/p>/)?.[1]
    expect(tagline).toBe('Acceso a la cultura del mundo')

    const fontkit = createRequire(import.meta.url)('fontkit') as Fontkit
    const font = fontkit.openSync(resolve(FONTS_DIRECTORY, 'InstrumentSerif-Italic.woff'))
    const text = `${tagline}áéíóúüñÁÉÍÓÚÜÑ¿¡`
    const missing = [...new Set(text)].filter((character) => !font.hasGlyphForCodePoint(character.codePointAt(0)!))
    expect(missing).toEqual([])
  })
})

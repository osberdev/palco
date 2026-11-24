import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// A static test: it analyzes the text of the stylesheets, not the computed CSS,
// like tests/motion.test.ts. Color, spacing and radius literals live only in
// tokens.css; outside it, a spacing or radius is a token, a `calc` of tokens or an
// optical remainder of 1 to 3 px, and a font size is always a `--fs-*` token.

const ROOT = join(import.meta.dirname, '..')

function collect(directory: string, extension: string): string[] {
  return readdirSync(join(ROOT, directory), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith(extension))
    .map((path) => join(ROOT, directory, path))
}

/** Only the CSS: in a `.vue`, the content of its `<style>` blocks. */
function styles(path: string, source: string): string {
  if (!path.endsWith('.vue')) return source
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n')
}

const FILES = [
  ...collect('components', '.vue'),
  ...collect('layouts', '.vue'),
  ...collect('pages', '.vue'),
  ...collect('assets/css', '.css'),
]
  .filter((path) => !path.endsWith('tokens.css'))
  .map((path) => ({ path: relative(ROOT, path), css: styles(path, readFileSync(path, 'utf8')) }))

interface Declaration {
  readonly property: string
  readonly value: string
}

/** Declarations without comments and without custom properties. */
function declarations(css: string): Declaration[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...clean.matchAll(/(?<![\w-])([a-z][a-z-]*)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)]
    .map((match) => ({ property: match[1]!, value: match[2]! }))
}

const SPACING = /^(margin|padding)(-[a-z-]+)?$|^(gap|row-gap|column-gap)$|^inset(-[a-z-]+)?$|^border(-[a-z]+)*-radius$/

const PX_LITERAL = /(?<![\w-])-?(\d*\.?\d+)px\b/g

/** px literals of 4 or more in a spacing or radius property. */
function spacingOffenders(declaration: Declaration): string[] {
  if (!SPACING.test(declaration.property)) return []
  return [...declaration.value.matchAll(PX_LITERAL)]
    .filter((match) => Number(match[1]) >= 4)
    .map((match) => match[0])
}

const NAMED_COLORS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond',
  'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
  'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia',
  'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
  'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
  'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
  'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
  'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal',
  'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
]

const COLOR_LITERAL = new RegExp(
  `#[0-9a-f]{3,8}\\b|(?<![\\w-])(?:rgba?|hsla?)\\(|(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`,
  'gi',
)

/** Color literals: hexadecimal, rgb(), hsl() or a color name. */
function colorOffenders(declaration: Declaration): string[] {
  const value = declaration.value.replace(/(["'])(?:(?!\1).)*\1/g, '')
  return [...value.matchAll(COLOR_LITERAL)].map((match) => match[0])
}

const FONT = /^font(-size)?$/

const SIZE_LITERAL = /(?<![\w-])-?(\d*\.?\d+)(px|rem|em)\b/g

/** Literal font sizes in `font` or `font-size`; unitless line height is allowed. */
function fontOffenders(declaration: Declaration): string[] {
  if (!FONT.test(declaration.property)) return []
  return [...declaration.value.matchAll(SIZE_LITERAL)].map((match) => match[0])
}

function report(detect: (declaration: Declaration) => string[]): string[] {
  return FILES.flatMap(({ path, css }) =>
    declarations(css)
      .filter((declaration) => detect(declaration).length > 0)
      .map(({ property, value }) => `${path}: ${property}: ${value}`),
  )
}

const one = (text: string): Declaration => declarations(`${text};`)[0]!

describe('tokens de diseño', () => {
  it('TK1: ningún espaciado ni radio con un literal de 4 px o más', () => {
    expect(report(spacingOffenders)).toEqual([])
  })

  it('TK2: ningún color literal fuera de tokens.css', () => {
    expect(report(colorOffenders)).toEqual([])
  })

  it('TK4: ningún tamaño de letra literal fuera de tokens.css', () => {
    expect(report(fontOffenders)).toEqual([])
  })

  it('TK3: el detector detecta', () => {
    expect(spacingOffenders(one('padding: 20px'))).toEqual(['20px'])
    expect(spacingOffenders(one('gap: calc(var(--sp-2) + 2px) 14px'))).toEqual(['14px'])
    for (const allowed of ['calc(var(--sp-1) + 2px)', '2px', '0', 'var(--sp-4)']) {
      expect(spacingOffenders(one(`padding: ${allowed}`))).toEqual([])
    }
    expect(colorOffenders(one('stroke: rgb(255 255 255 / 30%)'))).toEqual(['rgb('])
    expect(colorOffenders(one('stroke: color-mix(in srgb, var(--white) 30%, transparent)'))).toEqual([])
    expect(fontOffenders(one('font: 500 14px/1.45 var(--font-sans)'))).toEqual(['14px'])
    expect(fontOffenders(one('font-size: 1.5rem'))).toEqual(['1.5rem'])
    expect(fontOffenders(one('font-size: var(--avatar-font, 12px)'))).toEqual(['12px'])
    for (const allowed of ['500 var(--fs-14)/1.45 var(--font-sans)', 'inherit', 'italic 400 var(--fs-32)/1.15 var(--font-display)']) {
      expect(fontOffenders(one(`font: ${allowed}`))).toEqual([])
    }
  })
})

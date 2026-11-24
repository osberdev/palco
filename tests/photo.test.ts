import { describe, expect, it } from 'vitest'
import {
  evaluatePhotoSize,
  evaluateProfilePhoto,
  inspectImage,
  PHOTO_MAX_BYTES,
  type PhotoInfo,
} from '../server/domain/photo'
import { MESSAGES, type ResultCode } from '../server/domain/result'

// The headers are built here: the repository carries no binary fixtures.

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0))
const be16 = (value: number): number[] => [(value >> 8) & 0xFF, value & 0xFF]
const be32 = (value: number): number[] => [(value >>> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]
const le16 = (value: number): number[] => [value & 0xFF, (value >> 8) & 0xFF]
const le24 = (value: number): number[] => [value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF]
const le32 = (value: number): number[] => [value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >>> 24) & 0xFF]

/** Pads with zeros up to `size`; without a size, the header's minimum. */
function bytesOf(header: readonly number[], size = header.length): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, header.length))
  bytes.set(header)
  return size < header.length ? bytes.slice(0, size) : bytes
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

const pngHeader = (width: number, height: number, chunk = 'IHDR'): number[] =>
  [...PNG_SIGNATURE, ...be32(13), ...ascii(chunk), ...be32(width), ...be32(height), 8, 2, 0, 0, 0]

const png = (width: number, height: number, size?: number): Uint8Array => bytesOf(pngHeader(width, height), size)

const segment = (marker: number, content: readonly number[]): number[] =>
  [0xFF, marker, ...be16(content.length + 2), ...content]

const sof = (marker: number, width: number, height: number): number[] =>
  segment(marker, [8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])

const jpeg = (width: number, height: number, marker = 0xC0, before: number[] = [], size?: number): Uint8Array =>
  bytesOf([0xFF, 0xD8, ...segment(0xE0, ascii('JFIF\0')), ...before, ...sof(marker, width, height), ...segment(0xDA, [0])], size)

const riff = (chunk: number[]): number[] => [...ascii('RIFF'), ...le32(chunk.length + 4), ...ascii('WEBP'), ...chunk]

const webpLossy = (width: number, height: number): Uint8Array =>
  bytesOf(riff([...ascii('VP8 '), ...le32(18), 0x30, 0x01, 0x00, 0x9D, 0x01, 0x2A, ...le16(width), ...le16(height), 0, 0]))

const webpLossless = (width: number, height: number): Uint8Array =>
  bytesOf(riff([...ascii('VP8L'), ...le32(5), 0x2F, ...le32((width - 1) | ((height - 1) << 14)), 0]))

const webpExtended = (width: number, height: number): Uint8Array =>
  bytesOf(riff([...ascii('VP8X'), ...le32(10), 0, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]))

const svg = (size?: number): Uint8Array =>
  bytesOf(ascii('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"></svg>'), size)

const pdf = (size?: number): Uint8Array => bytesOf(ascii('%PDF-1.7\n%âãÏÓ\n'), size)

function expectInfo(bytes: Uint8Array, expected: PhotoInfo): void {
  expect(evaluateProfilePhoto(bytes)).toEqual({ ok: true, value: expected })
}

function expectCode(bytes: Uint8Array, code: ResultCode): void {
  const result = evaluateProfilePhoto(bytes)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.result.code).toBe(code)
}

describe('mensajes de la foto', () => {
  it('sin punto final y con el signo de multiplicación U+00D7', () => {
    expect(MESSAGES.ERR_PHOTO_TOO_LARGE).toBe('La foto no puede pesar más de 2 MB')
    expect(MESSAGES.ERR_PHOTO_FORMAT).toBe('La foto debe ser JPEG, PNG o WebP')
    expect(MESSAGES.ERR_PHOTO_TOO_SMALL).toBe('La foto debe medir al menos 128 × 128 píxeles')
  })
})

describe('evaluateProfilePhoto', () => {
  it('PH1: PNG de 256 × 200', () => expectInfo(png(256, 200), { format: 'png', width: 256, height: 200 }))
  it('PH2: JPEG baseline (C0) de 256 × 200', () => expectInfo(jpeg(256, 200, 0xC0), { format: 'jpeg', width: 256, height: 200 }))
  it('PH3: JPEG progresivo (C2) de 256 × 200', () => expectInfo(jpeg(256, 200, 0xC2), { format: 'jpeg', width: 256, height: 200 }))
  it('PH4: WebP VP8 de 300 × 128', () => expectInfo(webpLossy(300, 128), { format: 'webp', width: 300, height: 128 }))
  it('PH5: WebP VP8L de 300 × 128', () => expectInfo(webpLossless(300, 128), { format: 'webp', width: 300, height: 128 }))
  it('PH6: WebP VP8X de 300 × 128', () => expectInfo(webpExtended(300, 128), { format: 'webp', width: 300, height: 128 }))

  it('PH7: JPEG con APP1 de 60 000 bytes y APP2 antes del SOF', () => {
    const app1 = segment(0xE1, new Array<number>(60_000 - 2).fill(0x45))
    const app2 = segment(0xE2, ascii('ICC_PROFILE\0'))
    expectInfo(jpeg(256, 200, 0xC0, [...app1, ...app2]), { format: 'jpeg', width: 256, height: 200 })
  })

  it('PH8: el SOS llega antes de cualquier SOF', () => {
    expectCode(bytesOf([0xFF, 0xD8, ...segment(0xE0, ascii('JFIF\0')), ...segment(0xDA, [0]), ...sof(0xC0, 256, 200)]), 'ERR_PHOTO_FORMAT')
  })

  it('PH9: SVG', () => expectCode(svg(), 'ERR_PHOTO_FORMAT'))
  it('PH10: GIF', () => expectCode(bytesOf([...ascii('GIF89a'), ...le16(256), ...le16(256)], 64), 'ERR_PHOTO_FORMAT'))
  it('PH11: PDF', () => expectCode(pdf(), 'ERR_PHOTO_FORMAT'))
  it('PH12: PNG cortado en el byte 20', () => expectCode(png(256, 256, 20), 'ERR_PHOTO_FORMAT'))
  it('PH13: PNG sin IHDR', () => expectCode(bytesOf(pngHeader(256, 256, 'IDAT')), 'ERR_PHOTO_FORMAT'))
  it('PH14: RIFF…WEBP con un fragmento desconocido', () => {
    expectCode(bytesOf(riff([...ascii('ALPH'), ...le32(16), ...new Array<number>(16).fill(0)])), 'ERR_PHOTO_FORMAT')
  })
  it('PH15: arreglo vacío', () => expectCode(new Uint8Array(0), 'ERR_PHOTO_FORMAT'))

  it('PH16: PNG de 128 × 128', () => expectInfo(png(128, 128), { format: 'png', width: 128, height: 128 }))
  it('PH17: PNG de 127 × 128', () => expectCode(png(127, 128), 'ERR_PHOTO_TOO_SMALL'))
  it('PH18: PNG de 128 × 127', () => expectCode(png(128, 127), 'ERR_PHOTO_TOO_SMALL'))

  it('PH19: PNG de exactamente 2 097 152 bytes', () => {
    expectInfo(png(256, 256, PHOTO_MAX_BYTES), { format: 'png', width: 256, height: 256 })
  })
  it('PH20: PNG de 2 097 153 bytes', () => expectCode(png(256, 256, PHOTO_MAX_BYTES + 1), 'ERR_PHOTO_TOO_LARGE'))
  it('PH21: PDF de 3 MB, por el orden', () => expectCode(pdf(3_000_000), 'ERR_PHOTO_TOO_LARGE'))
  it('PH22: PNG de 3 MB y 64 × 64, por el orden', () => expectCode(png(64, 64, 3_000_000), 'ERR_PHOTO_TOO_LARGE'))

  it.each([0, -1, 1.5])('PH23: evaluatePhotoSize(%d) → ERR_PHOTO_FORMAT', (size) => {
    expect(evaluatePhotoSize(size).code).toBe('ERR_PHOTO_FORMAT')
  })
})

describe('inspectImage', () => {
  it('no lanza con ninguna cabecera truncada de los tres formatos', () => {
    for (const full of [png(256, 256), jpeg(256, 200), webpLossy(300, 128), webpLossless(300, 128), webpExtended(300, 128)]) {
      for (let length = 0; length < full.length; length++) {
        expect(() => inspectImage(full.slice(0, length))).not.toThrow()
      }
    }
  })
})

describe('INV17: peso, formato y dimensiones en su orden', () => {
  const sizes = [
    ['por debajo', 4096],
    ['en el límite', PHOTO_MAX_BYTES],
    ['por encima', PHOTO_MAX_BYTES + 1],
  ] as const
  const formats = ['png', 'jpeg', 'webp', 'pdf', 'svg'] as const
  const sides = [128, 127] as const

  function build(format: (typeof formats)[number], width: number, height: number, size: number): Uint8Array {
    switch (format) {
      case 'png': return png(width, height, size)
      case 'jpeg': return jpeg(width, height, 0xC0, [], size)
      case 'webp': return bytesOf([...webpExtended(width, height)], size)
      case 'pdf': return pdf(size)
      case 'svg': return svg(size)
    }
  }

  const cases = sizes.flatMap(([sizeLabel, size]) =>
    formats.flatMap((format) =>
      sides.flatMap((width) => sides.map((height) => ({ sizeLabel, size, format, width, height })))))

  it.each(cases)('$sizeLabel · $format · $width × $height', ({ size, format, width, height }) => {
    const sizeFails = size > PHOTO_MAX_BYTES
    const formatFails = format === 'pdf' || format === 'svg'
    const sideFails = width < 128 || height < 128
    const expected: ResultCode | null = sizeFails
      ? 'ERR_PHOTO_TOO_LARGE'
      : formatFails ? 'ERR_PHOTO_FORMAT' : sideFails ? 'ERR_PHOTO_TOO_SMALL' : null

    const result = evaluateProfilePhoto(build(format, width, height, size))
    expect(result.ok).toBe(expected === null)
    if (!result.ok) expect(result.result.code).toBe(expected)
  })
})

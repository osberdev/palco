import { accept, err, ok, reject, type Checked, type Result } from './result'

/** 2 MiB, inclusive (RN-PER-06). */
export const PHOTO_MAX_BYTES = 2_097_152

/** Minimum side in pixels, inclusive (RN-PER-06). */
export const PHOTO_MIN_SIDE = 128

export type PhotoFormat = 'jpeg' | 'png' | 'webp'

export interface PhotoInfo {
  readonly format: PhotoFormat
  readonly width: number
  readonly height: number
}

/**
 * Photo size. It comes first in the composite because it is decided without
 * reading the file: the server uses `Content-Length` and the client `File.size`.
 */
export function evaluatePhotoSize(size: number): Result {
  if (!Number.isInteger(size) || size <= 0) return err('ERR_PHOTO_FORMAT')
  if (size > PHOTO_MAX_BYTES) return err('ERR_PHOTO_TOO_LARGE')
  return ok()
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0))

function matchesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset + expected.length > bytes.length) return false
  return expected.every((value, index) => bytes[offset + index] === value)
}

// The reads assume the caller already checked the array bounds.
const uint16BigEndian = (bytes: Uint8Array, at: number): number => bytes[at]! * 0x100 + bytes[at + 1]!
const uint16LittleEndian = (bytes: Uint8Array, at: number): number => bytes[at]! + bytes[at + 1]! * 0x100
const uint24LittleEndian = (bytes: Uint8Array, at: number): number =>
  bytes[at]! + bytes[at + 1]! * 0x100 + bytes[at + 2]! * 0x10000
const uint32BigEndian = (bytes: Uint8Array, at: number): number =>
  bytes[at]! * 0x1000000 + bytes[at + 1]! * 0x10000 + bytes[at + 2]! * 0x100 + bytes[at + 3]!
const uint32LittleEndian = (bytes: Uint8Array, at: number): number =>
  bytes[at]! + bytes[at + 1]! * 0x100 + bytes[at + 2]! * 0x10000 + bytes[at + 3]! * 0x1000000

const formatError = (): Checked<PhotoInfo> => reject(err('ERR_PHOTO_FORMAT'))

function inspectPng(bytes: Uint8Array): Checked<PhotoInfo> {
  if (bytes.length < 24 || !matchesAt(bytes, 12, ascii('IHDR'))) return formatError()
  return accept({ format: 'png', width: uint32BigEndian(bytes, 16), height: uint32BigEndian(bytes, 20) })
}

/** SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC), which share the range. */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC

/**
 * Walks the segments up to the SOF. A fixed offset is not used: the metadata APP
 * segments (EXIF, ICC) come first and their length varies.
 */
function inspectJpeg(bytes: Uint8Array): Checked<PhotoInfo> {
  let at = 2
  while (at < bytes.length) {
    if (bytes[at] !== 0xFF) return formatError()
    while (at < bytes.length && bytes[at] === 0xFF) at++
    if (at >= bytes.length) return formatError()

    const marker = bytes[at]!
    at++
    if (marker === 0xDA || marker === 0xD9) return formatError()
    if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) continue

    if (at + 2 > bytes.length) return formatError()
    const length = uint16BigEndian(bytes, at)
    if (length < 2) return formatError()

    if (isStartOfFrame(marker)) {
      // Length (2), precision (1), height (2) and width (2).
      if (at + 7 > bytes.length) return formatError()
      return accept({ format: 'jpeg', width: uint16BigEndian(bytes, at + 5), height: uint16BigEndian(bytes, at + 3) })
    }
    at += length
  }
  return formatError()
}

function inspectWebp(bytes: Uint8Array): Checked<PhotoInfo> {
  if (bytes.length < 16) return formatError()

  if (matchesAt(bytes, 12, ascii('VP8 '))) {
    if (bytes.length < 30 || !matchesAt(bytes, 23, [0x9D, 0x01, 0x2A])) return formatError()
    return accept({
      format: 'webp',
      width: uint16LittleEndian(bytes, 26) & 0x3FFF,
      height: uint16LittleEndian(bytes, 28) & 0x3FFF,
    })
  }

  if (matchesAt(bytes, 12, ascii('VP8L'))) {
    if (bytes.length < 25 || bytes[20] !== 0x2F) return formatError()
    const bits = uint32LittleEndian(bytes, 21)
    return accept({ format: 'webp', width: (bits & 0x3FFF) + 1, height: (Math.floor(bits / 0x4000) & 0x3FFF) + 1 })
  }

  if (matchesAt(bytes, 12, ascii('VP8X'))) {
    if (bytes.length < 30) return formatError()
    return accept({ format: 'webp', width: uint24LittleEndian(bytes, 24) + 1, height: uint24LittleEndian(bytes, 27) + 1 })
  }

  return formatError()
}

/**
 * Format and dimensions read from the header, not from the extension or the type
 * the browser declares, which the client controls. A truncated header is a
 * rejection, never an exception.
 */
export function inspectImage(bytes: Uint8Array): Checked<PhotoInfo> {
  if (matchesAt(bytes, 0, PNG_SIGNATURE)) return inspectPng(bytes)
  if (matchesAt(bytes, 0, [0xFF, 0xD8, 0xFF])) return inspectJpeg(bytes)
  if (matchesAt(bytes, 0, ascii('RIFF')) && matchesAt(bytes, 8, ascii('WEBP'))) return inspectWebp(bytes)
  return formatError()
}

/** RN-PER-06. Fixed order, the first rejection wins: size, format, dimensions. */
export function evaluateProfilePhoto(bytes: Uint8Array): Checked<PhotoInfo> {
  const size = evaluatePhotoSize(bytes.length)
  if (!size.ok) return reject(size)

  const info = inspectImage(bytes)
  if (!info.ok) return info

  if (info.value.width < PHOTO_MIN_SIDE || info.value.height < PHOTO_MIN_SIDE) {
    return reject(err('ERR_PHOTO_TOO_SMALL'))
  }
  return info
}

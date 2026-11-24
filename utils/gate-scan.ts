/**
 * Scanning with the gate camera. Pure functions: the instant and the WASM URL
 * arrive as parameters.
 */

/** The same text read again within this window is not sent again. */
export const SCAN_REPEAT_MS = 3000

/**
 * The camera notice. It is not a `ResultCode`: the browser decides it and it never
 * reaches the server.
 */
export const CAMERA_UNAVAILABLE_MESSAGE = 'No podemos usar la cámara. Escribe el código corto'

export interface SeenScan {
  readonly text: string
  readonly at: number
}

/**
 * Whether a scanned QR is sent. The window counts from the last time the camera saw
 * it, not from the send: a ticket held in front of the camera is sent once, and the
 * same ticket taken away and brought back after 3 s is sent again, and says "Este
 * boleto ya se usó". An empty text is never sent.
 */
export function shouldSendScan(text: string, at: number, previous: SeenScan | null): boolean {
  if (text === '') return false
  if (previous === null || previous.text !== text) return true
  return at - previous.at >= SCAN_REPEAT_MS
}

/**
 * zxing-wasm's `locateFile`. By default it fetches the WASM from jsDelivr; here the
 * WASM ships with PALCO, with its hash, and nothing goes to another domain. Anything
 * else keeps its prefix.
 */
export function zxingLocateFile(path: string, prefix: string, wasmUrl: string): string {
  return path.endsWith('.wasm') ? wasmUrl : prefix + path
}

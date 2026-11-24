import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCAN_REPEAT_MS, shouldSendScan, zxingLocateFile } from '../utils/gate-scan'

// Scanning with the camera. Each case carries its identifier.

const QR = 'P1.ABC'

describe('lo leído otra vez', () => {
  it('CM1: lo primero y lo distinto se envían; vacío, nunca', () => {
    expect(shouldSendScan(QR, 0, null)).toBe(true)
    expect(shouldSendScan('P1.XYZ', 10, { text: QR, at: 5 })).toBe(true)
    expect(shouldSendScan('', 0, null)).toBe(false)
  })

  it('CM2: lo mismo dentro de 3 s no; desde los 3 s, sí', () => {
    expect(shouldSendScan(QR, 1000 + SCAN_REPEAT_MS - 1, { text: QR, at: 1000 })).toBe(false)
    expect(shouldSendScan(QR, 1000 + SCAN_REPEAT_MS, { text: QR, at: 1000 })).toBe(true)
  })

  it('CM3: un boleto que se queda frente a la cámara se envía una sola vez', () => {
    // The window counts from the last time it was seen: every frame renews it.
    let previous = null as { text: string, at: number } | null
    let sent = 0
    for (let at = 0; at <= 20_000; at += 200) {
      if (shouldSendScan(QR, at, previous)) sent++
      previous = { text: QR, at }
    }
    expect(sent).toBe(1)
  })
})

describe('el WASM', () => {
  it('CM4: el WASM sale de PALCO; lo demás conserva su prefijo', () => {
    expect(zxingLocateFile('zxing_reader.wasm', 'https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/', '/_nuxt/zxing_reader.abc.wasm'))
      .toBe('/_nuxt/zxing_reader.abc.wasm')
    expect(zxingLocateFile('otro.js', '/base/', '/x.wasm')).toBe('/base/otro.js')
  })

  it('CM5: solo GateCamera carga zxing-wasm, con import(), con su WASM por `?url` y con locateFile', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(vue|ts)$/.test(name)) files.push(path)
      }
    }
    for (const dir of ['pages', 'components', 'composables', 'layouts', 'utils', 'stores', 'server']) walk(dir)
    const users = files.filter((file) => /(from |import\()'zxing-wasm/.test(readFileSync(file, 'utf8')))
    expect(users).toEqual([join('components', 'gate', 'GateCamera.vue')])

    const source = readFileSync(users[0]!, 'utf8')
    // No static import: no other page carries it in its bundle.
    expect(source).not.toMatch(/^import .*zxing-wasm/m)
    expect(source).toContain(`import('zxing-wasm/reader')`)
    expect(source).toContain(`import('zxing-wasm/reader/zxing_reader.wasm?url')`)
    expect(source).toMatch(/locateFile: \(path(: string)?, prefix(: string)?\) => zxingLocateFile\(path, prefix, wasmUrl\)/)
  })
})

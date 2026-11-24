import { describe, expect, it } from 'vitest'
import { activeDestination } from '../utils/navigation'

describe('activeDestination', () => {
  it.each([
    ['/', 'catalogo'],
    ['/catalogo/teatro', 'catalogo'],
    ['/compra/teatro-scala', 'catalogo'],
    ['/boletos', 'boletos'],
    ['/boletos/', 'boletos'],
    ['/login', null],
    ['/ruta-inexistente', null],
    ['/catalogo', null],
    ['/boletos-viejos', null],
    ['/confirmacion/PLC-0001-2026', 'boletos'],
    ['/CONFIRMACION/PLC-0001-2026/', 'boletos'],
    ['/confirmacion', null],
    ['/confirmaciones/x', null],
    ['/perfil', 'perfil'],
    ['/PERFIL/', 'perfil'],
    ['/perfiles', null],
    ['/perfil/x', null],
    ['/metodos-de-pago', 'metodos'],
    ['/METODOS-DE-PAGO/', 'metodos'],
    ['/metodos-de-pago/nuevo', 'metodos'],
    ['/metodos-de-pago/9c5b1f7e-2d4a-4e8b-9f3a-1b2c3d4e5f60', 'metodos'],
    ['/metodos', null],
    ['/metodos-de-pagos', null],
  ] as const)('%s → %s', (path, expected) => {
    expect(activeDestination(path)).toBe(expected)
  })
})

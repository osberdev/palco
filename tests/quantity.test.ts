import { describe, expect, it } from 'vitest'
import { initialQuantity } from '../utils/quantity'

describe('initialQuantity', () => {
  it('QT1: agotado, arranca en 0', () => {
    expect(initialQuantity(0)).toBe('0')
  })

  it('QT2: con lugares, arranca en 1', () => {
    expect(initialQuantity(1)).toBe('1')
    expect(initialQuantity(2030)).toBe('1')
  })
})

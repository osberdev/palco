import type { Cents } from '../../types'

// The only place where a `number` becomes `Cents`. Operations are integer-only:
// with amounts in cents there is no binary rounding, while `1.15 * 3` in units
// would give 3.4499999999999997.

/**
 * Only changes the type. MN3 guarantees that the catalog data are safe integers,
 * not this function, so a mistyped literal fails in a test rather than in a
 * domain exception.
 */
export function cents(value: number): Cents {
  return value as Cents
}

export const ZERO_CENTS: Cents = cents(0)

export function addCents(a: Cents, b: Cents): Cents {
  return (a + b) as Cents
}

/** An amount times an integer, such as the price times the quantity. */
export function multiplyCents(amount: Cents, factor: number): Cents {
  return (amount * factor) as Cents
}

/** The smallest of a non-empty list, such as the reference price. */
export function minCents(amounts: readonly Cents[]): Cents {
  return Math.min(...amounts) as Cents
}

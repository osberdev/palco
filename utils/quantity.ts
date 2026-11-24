/**
 * The quantity a purchase starts with: 0 if the venue is sold out and otherwise
 * one ticket. `useSoldOutQuantity` uses it and explains why it is not decided in
 * `QuantityField`.
 */
export function initialQuantity(available: number): string {
  return available === 0 ? '0' : '1'
}

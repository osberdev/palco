/**
 * Shape checks for endpoint bodies and parameters. It imports nothing with side
 * effects on load: the parsers that use it are tested without opening the database.
 */

/** A plain JSON object: not `null`, not an array, not an instance of another class. */
export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Lowercase UUID v4, the shape of `randomUUID` and of `formatRequestId`. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
}

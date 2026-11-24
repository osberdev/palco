/**
 * How PostgreSQL types are read where `pg` and PGlite disagree, or where the
 * application wants another shape. One table for both, and this module imports
 * neither: if each had its own, the PGlite tests would stop saying anything about
 * the server.
 *
 * - `date` and `int8`: `pg` gives a `Date` shifted to the process time zone, and
 *   text for `int8`, which is what `SUM` and `COUNT` return. No value exceeds 2^53.
 * - `time`: without seconds, because `TimeOfDay` has none.
 * - `timestamptz`: as text; no rule computes with these dates.
 */
const asText = (value: string): string => value

export const TYPE_PARSERS: Readonly<Record<number, (value: string) => unknown>> = {
  20: Number, // int8
  1082: asText, // date, already ISO with the default DateStyle
  1083: (value) => value.slice(0, 5), // time, HH:MM
  1184: asText, // timestamptz
}

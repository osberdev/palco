// The accepted emails of EM1–EM11 (RN-PAG-11), shared by the payment tests
// (tests/payment.test.ts) and the optional registration email (RE12).

export const L64 = 'a'.repeat(64)
export const B63 = 'b'.repeat(63)
export const LONGEST = `${L64}@${B63}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`

/** Accepted by the legacy console implementation as well. */
export const EMAIL_ACCEPTED: readonly (readonly [string, string])[] = [
  ['EM1', 'ana@example.com'],
  ['EM2', 'ana@sub.example.com'],
  ['EM3', 'a.b@example.com'],
  ['EM4', 'ana+promo@example.com'],
  ['EM5', 'ANA@EXAMPLE.COM'],
  ['EM6', "o'neil@example.com"],
  ['EM7', 'ana@mi-dominio.mx'],
  ['EM8', 'ana_sofia@example.com.mx'],
  ['EM9', `${L64}@example.com`],
  ['EM10', `ana@${B63}.com`],
  ['EM11', LONGEST],
]

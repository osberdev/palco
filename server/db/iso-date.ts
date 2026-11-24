const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A date ready to be sent to a `date` column. PostgreSQL reads the text according
 * to `DateStyle`: "12/11/2026" is silently stored as December 11 when someone meant
 * November 12. The column type does not guarantee the ISO form, so the repository
 * guarantees it before the value reaches the database.
 */
export function requireIsoDate(text: string): string {
  if (!ISO_DATE.test(text)) throw new Error('Fecha con forma inválida: se espera AAAA-MM-DD')
  return text
}

/**
 * The top bar circle's initials from the name (RN-PER-09). The name can be anything
 * the rule admits, so letters are counted rather than characters: a leading
 * apostrophe or hyphen is not an initial, and a letter outside the basic plane is
 * taken whole, never half a surrogate pair. Each letter keeps its combining marks,
 * and the result is normalized to NFC: a precomposed "é" and "e" + U+0301 give the
 * same initial, because the same name cannot give different initials depending on
 * the keyboard.
 *
 * With two or more words that have letters, the first letter of the first two;
 * with one, its first two letters; with no letters, ''.
 */
export function initialsOf(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((word) => word.match(/\p{L}\p{M}*/gu) ?? [])
    .filter((letters) => letters.length > 0)

  const [first, second] = words
  if (first === undefined) return ''
  const initials = second === undefined ? first.slice(0, 2).join('') : first[0]! + second[0]!
  return initials.toLocaleUpperCase('es-MX').normalize('NFC')
}

/**
 * The accessible name of the circle that links to the profile (WCAG 2.5.3): it
 * starts with the visible initials, "AS, perfil"; without visible initials (with a
 * photo, or without a name) it is "Perfil".
 */
export function avatarLinkLabel(visibleInitials: string): string {
  return visibleInitials === '' ? 'Perfil' : `${visibleInitials}, perfil`
}

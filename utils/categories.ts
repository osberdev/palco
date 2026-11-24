import type { CategorySlug } from '../types'

/**
 * The three categories in catalog order. They live in the presentation layer and
 * are not requested from the endpoint because the tabs and the title must stay
 * visible when the catalog fails to load (RF-CAT-10).
 */
export const CATEGORY_SLUGS: readonly CategorySlug[] = ['teatro', 'cine', 'museo']

export function isCategorySlug(value: unknown): value is CategorySlug {
  return typeof value === 'string' && (CATEGORY_SLUGS as readonly string[]).includes(value)
}

/** 'teatro' → 'Teatro'. */
export function categoryTitle(slug: CategorySlug): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

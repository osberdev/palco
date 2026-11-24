export type NavigationDestination = 'catalogo' | 'boletos' | 'metodos' | 'perfil'

export interface NavigationLink {
  readonly destination: NavigationDestination
  readonly label: string
  readonly to: string
}

/** Top bar destinations, in order (RF-NAV-10). */
export const NAVIGATION_LINKS: readonly NavigationLink[] = [
  { destination: 'catalogo', label: 'Catálogo', to: '/' },
  { destination: 'boletos', label: 'Mis boletos', to: '/boletos' },
  { destination: 'metodos', label: 'Métodos de pago', to: '/metodos-de-pago' },
  { destination: 'perfil', label: 'Perfil', to: '/perfil' },
]

/** Routes visible without a session (RF-AUT-18): sign-in and registration. */
export const PUBLIC_PATHS: readonly string[] = ['/login', '/registro']

/**
 * Open routes: visible with or without a session. The gate is not a buyer
 * account, and whoever opens it may or may not have a session in that browser;
 * it is neither required nor removed.
 */
export const OPEN_PATHS: readonly string[] = ['/acceso']

export type AccessReason = 'SESSION_REQUIRED' | 'ALREADY_AUTHENTICATED'

export type RouteAccess =
  | { readonly action: 'allow' }
  | { readonly action: 'redirect'; readonly to: '/login'; readonly reason: 'SESSION_REQUIRED' }
  | { readonly action: 'redirect'; readonly to: '/'; readonly reason: 'ALREADY_AUTHENTICATED' }

/**
 * Reproduces the router's resolution with its default configuration
 * (`sensitive: false`, `strict: false`): `/login`, `/login/` and `/LOGIN` are the
 * same page, so the menu treats them the same way.
 */
export function normalizePath(path: string): string {
  const normalized = path.toLowerCase().replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.includes(normalizePath(path))
}

export function isOpenPath(path: string): boolean {
  return OPEN_PATHS.includes(normalizePath(path))
}

/**
 * The route guard's decision. Fixed order: an open route always passes; without a
 * session outside a public route, to `/login`; with a session on a public route,
 * to `/`. The open route goes first so the result does not depend on the order if
 * a route were ever both public and open (INV33). The guard does not decide
 * whether the page exists: the router resolves that.
 */
export function routeAccess(path: string, isAuthenticated: boolean): RouteAccess {
  if (isOpenPath(path)) return { action: 'allow' }
  const isPublic = isPublicPath(path)
  if (!isAuthenticated && !isPublic) {
    return { action: 'redirect', to: '/login', reason: 'SESSION_REQUIRED' }
  }
  if (isAuthenticated && isPublic) {
    return { action: 'redirect', to: '/', reason: 'ALREADY_AUTHENTICATED' }
  }
  return { action: 'allow' }
}

/**
 * The destination the bar marks as active. "Catálogo" covers the home page, the
 * catalog and the purchase, because the purchase is reached from the catalog.
 * "Mis boletos" also covers the confirmation, which is reached from there. "Métodos
 * de pago" covers the list, adding and editing. "Perfil" only covers `/perfil`.
 * Any other route, `/login` included, marks none.
 */
export function activeDestination(path: string): NavigationDestination | null {
  const normalized = normalizePath(path)
  if (normalized === '/' || normalized.startsWith('/catalogo/') || normalized.startsWith('/compra/')) {
    return 'catalogo'
  }
  if (normalized === '/boletos' || normalized.startsWith('/confirmacion/')) return 'boletos'
  if (normalized === '/metodos-de-pago' || normalized.startsWith('/metodos-de-pago/')) return 'metodos'
  if (normalized === '/perfil') return 'perfil'
  return null
}

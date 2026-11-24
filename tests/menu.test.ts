import { describe, expect, it } from 'vitest'
import { CATEGORY_SLUGS, categoryTitle, isCategorySlug } from '../utils/categories'
import { activeDestination, normalizePath, OPEN_PATHS, PUBLIC_PATHS, routeAccess } from '../utils/navigation'

// The route guard and the navigation menu. Each describe is an equivalence class;
// each test carries its identifier so it can be filtered with `-t`.

const ALLOW = { action: 'allow' } as const
const TO_LOGIN = { action: 'redirect', to: '/login', reason: 'SESSION_REQUIRED' } as const
const TO_HOME = { action: 'redirect', to: '/', reason: 'ALREADY_AUTHENTICATED' } as const

describe('EP-V1 · con sesión, ruta protegida: allow', () => {
  it.each([
    ['MN1', '/'],
    ['MN2', '/catalogo/cine'],
    ['MN3', '/compra/louvre'],
    ['MN4', '/boletos'],
    // The guard lets it through and the router decides the 404.
    ['MN5', '/ruta-inexistente'],
  ])('%s %s', (_id, path) => {
    expect(routeAccess(path, true)).toEqual(ALLOW)
  })
})

describe('EP-V2 · sin sesión, ruta pública: allow', () => {
  it('MN6 /login', () => {
    expect(routeAccess('/login', false)).toEqual(ALLOW)
  })
})

describe('EP-V3 · slug de categoría', () => {
  it.each([
    ['CT1', 'teatro'],
    ['CT2', 'cine'],
    ['CT3', 'museo'],
  ])('%s %s es slug', (_id, value) => {
    expect(isCategorySlug(value)).toBe(true)
  })

  it('CT12 categoryTitle de los tres slugs', () => {
    expect(CATEGORY_SLUGS.map(categoryTitle)).toEqual(['Teatro', 'Cine', 'Museo'])
  })

  it('CT13 CATEGORY_SLUGS en orden, y cada uno es slug', () => {
    expect(CATEGORY_SLUGS).toEqual(['teatro', 'cine', 'museo'])
    for (const slug of CATEGORY_SLUGS) expect(isCategorySlug(slug)).toBe(true)
  })
})

describe('EP-W1 · con sesión, ruta pública: redirect a / por ALREADY_AUTHENTICATED', () => {
  it('MN7 /login', () => {
    expect(routeAccess('/login', true)).toEqual(TO_HOME)
  })
})

describe('EP-E1 · sin sesión, ruta protegida: redirect a /login por SESSION_REQUIRED', () => {
  it.each([
    ['MN14', '/'],
    ['MN15', '/boletos'],
    ['MN16', '/compra/teatro-scala'],
    ['MN17', '/ruta-inexistente'],
    // Boundaries: they share a prefix with /login and are not the public route.
    ['MN18', '/login-falso'],
    ['MN19', '/login/extra'],
  ])('%s %s', (_id, path) => {
    expect(routeAccess(path, false)).toEqual(TO_LOGIN)
  })
})

describe('EP-E2 · valor que no es slug: la página responde 404', () => {
  it.each([
    ['CT4', 'opera'],
    ['CT5', 'Teatro'],
    ['CT6', ''],
    ['CT7', ' teatro'],
    ['CT8', undefined],
    ['CT9', null],
    ['CT10', 42],
    // route.params may carry an array.
    ['CT11', ['teatro']],
  ] as const)('%s %j no es slug', (_id, value) => {
    expect(isCategorySlug(value)).toBe(false)
  })
})

describe('EP-W2 · forma no canónica de una ruta: se trata como su forma canónica', () => {
  it('MN8 /login/ con sesión → /', () => {
    expect(routeAccess('/login/', true)).toEqual(TO_HOME)
  })

  it('MN9 /LOGIN con sesión → /', () => {
    expect(routeAccess('/LOGIN', true)).toEqual(TO_HOME)
  })

  it('MN10 /Login sin sesión → allow', () => {
    expect(routeAccess('/Login', false)).toEqual(ALLOW)
  })

  it('MN11 /BOLETOS marca boletos', () => {
    expect(activeDestination('/BOLETOS')).toBe('boletos')
  })

  it('MN12 /Catalogo/teatro/ marca catalogo', () => {
    expect(activeDestination('/Catalogo/teatro/')).toBe('catalogo')
  })

  it.each([
    ['/', '/'],
    ['//', '/'],
    ['/login/', '/login'],
    ['/LOGIN', '/login'],
    ['/boletos///', '/boletos'],
    ['/Compra/Louvre/', '/compra/louvre'],
  ])('MN13 normalizePath(%s) → %s', (path, expected) => {
    expect(normalizePath(path)).toBe(expected)
  })
})

const BASE_PATHS = [
  '/',
  '/catalogo/cine',
  '/compra/louvre',
  '/boletos',
  '/perfil',
  '/metodos-de-pago',
  '/ruta-inexistente',
  '/login',
  '/compra/teatro-scala',
  '/login-falso',
  '/login/extra',
  '/registro',
  // The gate's open route, and one that only looks like it.
  '/acceso',
  '/acceso/extra',
]
const UNIVERSE = BASE_PATHS.flatMap((path) => [
  path,
  `${path}/`,
  path.toUpperCase(),
  `${path.toUpperCase()}/`,
])
const SESSIONS = [true, false]

describe('INV · invariantes del menú sobre rutas y sesión', () => {
  it('INV13 una ruta y su forma canónica dan la misma salida', () => {
    for (const path of UNIVERSE) {
      for (const session of SESSIONS) {
        expect(routeAccess(path, session), `${path} ${session}`).toEqual(
          routeAccess(normalizePath(path), session),
        )
      }
      expect(activeDestination(path), path).toBe(activeDestination(normalizePath(path)))
    }
  })

  it('INV14 normalizePath es idempotente', () => {
    for (const path of UNIVERSE) {
      expect(normalizePath(normalizePath(path)), path).toBe(normalizePath(path))
    }
  })

  it('INV15 ningún destino de redirección vuelve a redirigir', () => {
    for (const path of UNIVERSE) {
      for (const session of SESSIONS) {
        const access = routeAccess(path, session)
        if (access.action === 'redirect') {
          expect(routeAccess(access.to, session), `${path} ${session}`).toEqual(ALLOW)
        }
      }
    }
  })
})

describe('RG-MN · /registro es pública', () => {
  it('RG-MN1 sin sesión, /registro → allow', () => {
    expect(routeAccess('/registro', false)).toEqual(ALLOW)
  })

  it('RG-MN2 con sesión, /registro → redirect a / por ALREADY_AUTHENTICATED', () => {
    expect(routeAccess('/registro', true)).toEqual(TO_HOME)
  })

  it('RG-MN3 sin sesión, /REGISTRO/ → allow, como su forma canónica', () => {
    expect(routeAccess('/REGISTRO/', false)).toEqual(ALLOW)
  })
})

describe('GM · casos adicionales de revisión', () => {
  it('GM1 /login/ sin sesión → allow', () => {
    expect(routeAccess('/login/', false)).toEqual(ALLOW)
  })

  it('GM2 // marca catalogo', () => {
    expect(activeDestination('//')).toBe('catalogo')
  })

  it('GM3 un objeto no es slug', () => {
    expect(isCategorySlug({ slug: 'teatro' })).toBe(false)
  })

  it('GM4 normalizePath de la ruta vacía → /', () => {
    // In an http URI, the empty path is equivalent to '/' (RFC 3986 §6.2.3), and that
    // is what normalizePath returns.
    expect(normalizePath('')).toBe('/')
  })
})

describe('AC-MN · /acceso es abierta: se ve con sesión y sin ella', () => {
  it.each([
    ['AC-MN1', '/acceso', false],
    ['AC-MN2', '/acceso', true],
    ['AC-MN3', '/ACCESO/', false],
    ['AC-MN4', '/Acceso', true],
  ])('%s %s con sesión %s → allow', (_id, path, session) => {
    expect(routeAccess(path, session)).toEqual(ALLOW)
  })

  it('AC-MN5 /acceso/extra no es abierta: sin sesión → /login', () => {
    expect(routeAccess('/acceso/extra', false)).toEqual(TO_LOGIN)
  })

  it('AC-MN6 /acceso no marca ningún destino de la barra', () => {
    expect(activeDestination('/acceso')).toBeNull()
  })

  it('INV33 las rutas públicas y las abiertas son disjuntas, y toda abierta da allow con sesión y sin ella', () => {
    for (const path of OPEN_PATHS) {
      expect(PUBLIC_PATHS.map(normalizePath), path).not.toContain(normalizePath(path))
      for (const session of SESSIONS) expect(routeAccess(path, session), `${path} ${session}`).toEqual(ALLOW)
    }
  })
})

import { registerHooks } from 'node:module'

/**
 * The scripts run on Node, which requires extensions in relative imports, while
 * `server/` imports without them because Nitro and Vite resolve them. The scripts
 * need the catalog and the domain, so this hook tries `.ts` and `/index.ts` when a
 * relative import does not resolve. Whatever already resolved is unchanged, and
 * packages do not go through here.
 *
 * Loaded with `node --import ./scripts/resolve-ts.ts`.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    }
    catch (error) {
      if (!specifier.startsWith('.')) throw error
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(`${specifier}${suffix}`, context)
        }
        catch {
          // Try the next suffix; if none resolves, the original error.
        }
      }
      throw error
    }
  },
})

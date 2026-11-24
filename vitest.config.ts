import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Needs a real PostgreSQL: `bun run test:concurrency`.
    exclude: ['tests/concurrency/**', 'node_modules/**'],
    environment: 'node',
    // Each PGlite instance takes about 800 MB and a new one needs about 2 s to
    // open: under load, opening and resetting it exceeds the 5 s default.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 3, minForks: 1 } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },

  esbuild: {
    // Must be a string, not an object: with an object Vite still opens the
    // project tsconfig to fill in missing options, and that read follows
    // `extends` into `.nuxt/tsconfig.json`. The domain is the system under test
    // and its tests run without a prepared Nuxt.
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        target: 'es2022',
        verbatimModuleSyntax: true,
        useDefineForClassFields: true,
      },
    }),
  },
})

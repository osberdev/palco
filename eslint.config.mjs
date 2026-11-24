import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // With asynchronous data access, a forgotten `await` leaves a write
    // unawaited and the types do not notice. Only where the database is used:
    // typed linting is slower, and the UI does not touch the database.
    files: ['server/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // A compared promise, such as `findUser(id) === null`, is always false, and
    // no-floating-promises misses it because the value is used.
    files: ['server/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    // Components must have multi-word names. In `pages/` and `layouts/` the
    // file name is a Nuxt routing contract: `login.vue`, `index.vue`,
    // `auth.vue`, `default.vue`.
    files: ['components/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'error',
    },
  },
  {
    files: ['pages/**/*.vue', 'layouts/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
)

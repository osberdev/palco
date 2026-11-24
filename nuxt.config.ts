import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-08-29',
  ssr: true,
  devtools: { enabled: false },

  modules: ['@nuxt/fonts', '@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  // Without `pathPrefix`, Nuxt would register `components/layout/AppTopbar.vue`
  // as `LayoutAppTopbar`. Folders are only for organization, not part of the
  // component name.
  components: [{ path: '~/components', pathPrefix: false }],

  // The confirmation page carries the ticket QR codes in its HTML and in the
  // Nuxt payload: they are bearer credentials, like its endpoint, so the page
  // must never be cached.
  routeRules: {
    '/confirmacion/**': { headers: { 'cache-control': 'private, no-store' } },
  },

  // The families only appear in the tokens.css variables (--font-sans and the
  // rest), and @nuxt/fonts only generates @font-face rules for the families it
  // finds in `font-family` or `font`: without processCSSVariables no design
  // system font would load. Weights and styles are the ones the CSS uses. Local
  // fonts keep a download or a remote fallback-metrics lookup from blocking the
  // CSS transform during development.
  fonts: {
    provider: 'local',
    experimental: { processCSSVariables: true },
    families: [
      { name: 'Instrument Serif', weights: [400], styles: ['normal', 'italic'] },
      { name: 'Geist', weights: [400, 500, 600], styles: ['normal'] },
      { name: 'Geist Mono', weights: [400, 500], styles: ['normal'] },
    ],
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  runtimeConfig: {
    // Seals the session cookie. No default: NUXT_SESSION_PASSWORD is required, and
    // server/plugins/00.session-password.ts stops startup without it.
    sessionPassword: '',
    // Initial free seats per venue, "teatro-scala=5,mna=0". Overridden by
    // NUXT_AVAILABILITY_OVERRIDES; it exists to demonstrate the sold-out state.
    // Empty, every venue starts at full capacity.
    availabilityOverrides: '',
    // Registration attempts per IP, "attempts/seconds". Overridden by
    // NUXT_REGISTRATION_RATE_LIMIT; empty means the rule's 5/900 (RN-REG-07).
    registrationRateLimit: '',
  },

  // A native Node addon: bundling it breaks the .node binding resolution.
  nitro: {
    // Share the ticket fonts with the web UI without copying the TTF files.
    publicAssets: [{ dir: fileURLToPath(new URL('./server/assets/fonts', import.meta.url)), baseURL: '/fonts' }],
    externals: {
      external: ['bcrypt'],
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es-MX' },
      title: 'PALCO',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
})

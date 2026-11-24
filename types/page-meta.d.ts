declare module '#app' {
  interface PageMeta {
    /**
     * The page takes the full width between the top bar and the footer, without the
     * container and padding of `layouts/default.vue`. The purchase uses it for the
     * side panel band.
     */
    fullBleed?: boolean
  }
}

export {}

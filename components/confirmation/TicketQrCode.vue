<script setup lang="ts">
import { encode } from 'uqr'

interface Props {
  /** The ticket's signed content, from [0-9A-Z.] (RN-BOL-02). */
  payload: string
  label: string
}

const { payload, label } = defineProps<Props>()

// uqr picks alphanumeric mode for [0-9A-Z.], denser than byte mode. Level M
// correction, like the PDF, and the 4-module quiet zone the standard requires.
// It is drawn with a path in the template rather than with v-html: the SVG is
// never interpreted as markup.
const qr = computed(() => {
  const { size, data } = encode(payload, { ecc: 'M', border: 4 })
  let path = ''
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`
    })
  })
  return { size, path }
})
</script>

<template>
  <svg
    class="qr"
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    shape-rendering="crispEdges"
    role="img"
    :aria-label="label"
  >
    <rect class="light" :width="qr.size" :height="qr.size" />
    <path class="dark" :d="qr.path" />
  </svg>
</template>

<style scoped>
.qr {
  display: block;
  width: 100%;
  height: auto;
}

.light {
  fill: var(--white);
}

.dark {
  fill: var(--ink-900);
}
</style>

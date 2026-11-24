<script setup lang="ts">
interface Props {
  /** `ink` on a light surface, `light` on the dark panel. */
  tone?: 'ink' | 'light'
  height?: number
  withWordmark?: boolean
}

const { tone = 'ink', height = 28, withWordmark = true } = defineProps<Props>()

const width = computed(() => Math.round((height * 24) / 32))
</script>

<template>
  <span class="palco-logo" :class="`tone-${tone}`">
    <svg
      :width="width"
      :height="height"
      viewBox="0 0 24 32"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 32V12a10 10 0 0 1 20 0v20Z" class="shape" />
      <rect x="0" y="19.1" width="24" height="1.8" class="cutout" />
      <circle cx="2" cy="20" r="2.3" class="cutout" />
      <circle cx="22" cy="20" r="2.3" class="cutout" />
    </svg>
    <span v-if="withWordmark" class="wordmark">PALCO</span>
  </span>
</template>

<style scoped>
.palco-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

.wordmark {
  font: 600 var(--fs-13) var(--font-sans);
  letter-spacing: 0.14em;
}

.tone-ink .shape {
  fill: var(--ink-900);
}

.tone-ink .cutout {
  fill: var(--white);
}

.tone-ink .wordmark {
  color: var(--ink-900);
}

.tone-light .shape {
  fill: var(--ink-50);
}

.tone-light .cutout {
  fill: var(--ink-900);
}

.tone-light .wordmark {
  color: var(--ink-50);
}
</style>

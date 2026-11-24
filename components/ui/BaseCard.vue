<script setup lang="ts">
interface Props {
  /** Highlights on hover. Only for cards that are navigation targets. */
  interactive?: boolean
  as?: 'div' | 'article'
}

const { interactive = false, as = 'div' } = defineProps<Props>()
</script>

<template>
  <component :is="as" class="card" :class="{ interactive }">
    <slot />
  </component>
</template>

<style scoped>
.card {
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}

/* A real :hover rule. */
.interactive {
  transition:
    border-color var(--dur-base) var(--ease),
    box-shadow var(--dur-base) var(--ease),
    transform var(--dur-base) var(--ease);
}

.interactive:hover {
  box-shadow: var(--sh-md);
  transform: translateY(-2px);
}
</style>

<script setup lang="ts">
interface Props {
  /** The link target. Without it, it is a button that emits `back`. */
  to?: string
  label?: string
  /** Button only: blocked while confirming. */
  disabled?: boolean
}

const { to, label = 'Inicio', disabled = false } = defineProps<Props>()

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="back-link body-md">← {{ label }}</NuxtLink>
  <!-- "← Boletos" returns to step 1 without changing route: it is not a link. -->
  <button v-else type="button" class="back-link back-button body-md" :disabled="disabled" @click="emit('back')">← {{ label }}</button>
</template>

<style scoped>
.back-link {
  align-self: flex-start;
  color: var(--ink-500);
  text-decoration: none;
  transition: color var(--dur-fast) var(--ease);
}

.back-link:hover {
  color: var(--ink-900);
}

.back-button {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

/* --ink-300 while blocked. */
.back-button:disabled {
  color: var(--ink-300);
  cursor: not-allowed;
}
</style>

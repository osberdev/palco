<script setup lang="ts">
interface Props {
  displayName: string
  /**
   * Hour of the day, 0–23. It is received as a prop rather than read from the clock
   * here: that keeps the component deterministic and the greeting testable without
   * faking time (RNF-03 applied by analogy to the presentation layer).
   */
  hour: number
}

const { displayName, hour } = defineProps<Props>()

const greeting = computed(() => {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
})

const firstName = computed(() => displayName.trim().split(/\s+/)[0] ?? '')
</script>

<template>
  <div class="greeting">
    <h1 class="display-lg">{{ greeting }}, {{ firstName }}</h1>
    <p class="body-lg subtitle">Selecciona una categoría para comenzar</p>
  </div>
</template>

<style scoped>
.greeting {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.subtitle {
  color: var(--ink-500);
}

@media (width <= 1023px) {
  .greeting h1 {
    font-size: var(--fs-40);
  }
}

@media (width <= 639px) {
  .greeting {
    gap: calc(var(--sp-1) + 2px);
  }

  .greeting h1 {
    font-size: var(--fs-32);
  }

  .subtitle {
    font-size: var(--fs-15);
  }
}
</style>

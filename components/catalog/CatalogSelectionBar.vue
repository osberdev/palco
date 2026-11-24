<script setup lang="ts">
import type { CatalogVenue } from '../../types'

interface Props {
  /** The venue chosen in the grid; null while nothing is selected. */
  venue: CatalogVenue | null
}

const { venue } = defineProps<Props>()

const summary = computed(() =>
  venue ? `Seleccionado: ${venue.name} · ${venue.city} · ${venue.currency}` : 'Ningún recinto seleccionado',
)

function choose(): void {
  if (venue) navigateTo(`/compra/${venue.id}`)
}
</script>

<template>
  <div class="selection-bar">
    <p class="body-sm summary" aria-live="polite">{{ summary }}</p>
    <BaseButton class="choose" :disabled="!venue" @click="choose">Elegir boletos</BaseButton>
  </div>
</template>

<style scoped>
.selection-bar {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp-5);
  padding-top: var(--sp-5);
  border-top: var(--border);
}

.summary {
  color: var(--ink-500);
}

@media (width <= 639px) {
  .selection-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .choose {
    width: 100%;
  }
}
</style>

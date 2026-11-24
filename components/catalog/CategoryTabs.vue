<script setup lang="ts">
import type { CategorySlug } from '../../types'

interface Props {
  active: CategorySlug
}

const { active } = defineProps<Props>()
</script>

<template>
  <nav aria-label="Categorías" class="category-tabs">
    <NuxtLink
      v-for="slug in CATEGORY_SLUGS"
      :key="slug"
      :to="`/catalogo/${slug}`"
      class="tab label"
      :class="{ active: slug === active }"
      :aria-current="slug === active ? 'page' : undefined"
    >
      {{ categoryTitle(slug) }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.category-tabs {
  display: flex;
  gap: var(--sp-2);
}

.tab {
  padding: var(--sp-2) var(--sp-4);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-xs);
  color: var(--ink-700);
  text-decoration: none;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.tab:hover:not(.active) {
  border-color: var(--ink-400);
}

.tab.active {
  background: var(--ink-900);
  border-color: var(--ink-900);
  color: var(--ink-50);
}
</style>

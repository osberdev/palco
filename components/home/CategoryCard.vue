<script setup lang="ts">
import type { Category } from '../../types'

interface Props {
  category: Category
}

const { category } = defineProps<Props>()

const image = computed(() => `/img/${category.slug}.jpg`)

// The photograph is decorative: if it is missing it is removed, and the category
// color declared behind it remains.
const imageFailed = ref(false)
</script>

<template>
  <NuxtLink :to="`/catalogo/${category.slug}`" class="category-link">
    <BaseCard as="article" interactive class="category-card">
    <div class="media" :class="`media-${category.slug}`">
      <img
        v-if="!imageFailed"
        :src="image"
        :alt="category.name"
        loading="lazy"
        @error="imageFailed = true"
      >
    </div>
    <div class="body">
      <span class="heading-md name">{{ category.name }}</span>
      <span class="facts">
        {{ category.countLabel }}<br>
        Máx. {{ category.maxTickets }} boletos
      </span>
    </div>
    </BaseCard>
  </NuxtLink>
</template>

<style scoped>
.category-link {
  display: block;
  height: 100%;
  border-radius: var(--r-md);
  color: inherit;
  text-decoration: none;
}

.category-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.media {
  aspect-ratio: 3 / 2;
  overflow: hidden;
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/*
 * The category background. It stays permanently behind the photograph: if the
 * image fails to load, `imageFailed` removes it and the card keeps its
 * composition instead of opening a hole.
 */
.media-teatro {
  background: var(--teatro-subtle);
}

.media-cine {
  background: var(--cine-subtle);
}

.media-museo {
  background: var(--museo-subtle);
}

.body {
  padding: calc(var(--sp-4) + var(--sp-1));
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.name {
  color: var(--ink-900);
}

.facts {
  font: 400 var(--fs-14)/1.6 var(--font-mono);
  color: var(--ink-500);
}

/* sm: the card lies down and the image becomes a side strip. */
@media (width <= 639px) {
  .category-card {
    flex-direction: row;
    align-items: stretch;
  }

  .media {
    flex: none;
    width: 120px;
    aspect-ratio: auto;
  }

  .body {
    padding: var(--sp-4);
    gap: calc(var(--sp-1) + 2px);
  }
}
</style>

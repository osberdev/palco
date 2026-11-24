<script setup lang="ts">
import type { Purchase } from '../../types'

interface Props {
  purchase: Purchase
}

const { purchase } = defineProps<Props>()

const notes = computed(() => beforeAttending(purchase))

// Same degradation as VenueAside: if the photo fails, the category color remains.
const imageFailed = ref(false)
</script>

<template>
  <!--
    lg and xl: a full-height band with the category illustration. Smaller widths:
    a card without illustration after the ticket (RF-CON-04 to 06).
  -->
  <aside class="before-attending" :class="`category-${purchase.category}`" aria-labelledby="before-attending-title">
    <div class="media">
      <img v-if="!imageFailed" :src="`/img/${purchase.category}.jpg`" alt="" @error="imageFailed = true">
    </div>
    <div class="body">
      <h2 id="before-attending-title" class="heading-md title">Antes de asistir</h2>
      <div v-for="note in notes" :key="note.label" class="note">
        <h3 class="label note-label">{{ note.label }}</h3>
        <p class="body-md note-text">{{ note.text }}</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.before-attending {
  display: flex;
  flex-direction: column;
  background: var(--white);
  border-left: var(--border);
}

.category-teatro {
  --category-subtle: var(--teatro-subtle);
}

.category-cine {
  --category-subtle: var(--cine-subtle);
}

.category-museo {
  --category-subtle: var(--museo-subtle);
}

/* 220 tall; not a design token. */
.media {
  height: 220px;
  background: var(--category-subtle);
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 28 of padding, like VenueAside. */
.body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-4) + var(--sp-1));
  padding: calc(var(--sp-5) + var(--sp-1));
}

.title {
  color: var(--ink-900);
}

.note {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
}

.note-label {
  color: var(--ink-500);
}

/* Geist 14/1.55. */
.note-text {
  line-height: 1.55;
  color: var(--ink-700);
  text-wrap: pretty;
}

/* A bordered card, without illustration, after the ticket. */
@media (width <= 1023px) {
  .before-attending {
    border: var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .media {
    display: none;
  }

  .body {
    padding: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>

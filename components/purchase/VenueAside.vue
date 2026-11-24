<script setup lang="ts">
import type { CategorySlug, Cents, Currency } from '../../types'

interface Props {
  name: string
  category: CategorySlug
  capacity: number
  available: number
  currency: Currency
  /** Service fee per ticket, in cents; cinemas only. */
  serviceFee?: Cents | null
}

const { name, category, capacity, available, currency, serviceFee = null } = defineProps<Props>()

// Same degradation as VenueCard: if the photo fails, the category color remains.
const imageFailed = ref(false)
</script>

<template>
  <!--
    A full-height band at lg and xl. md and sm: a compact card, with the image on
    the left, before the form.
  -->
  <aside class="venue-aside" :class="`category-${category}`" :aria-label="`Recinto: ${name}`">
    <div class="media">
      <img v-if="!imageFailed" :src="`/img/${category}.jpg`" alt="" @error="imageFailed = true">
    </div>
    <div class="body">
      <span class="label tag">{{ categoryTitle(category) }}</span>
      <dl class="facts">
        <div class="fact">
          <dt>Aforo</dt>
          <dd>{{ formatCount(capacity) }}</dd>
        </div>
        <div class="fact">
          <dt>Libres</dt>
          <dd>{{ formatCount(available) }}</dd>
        </div>
        <div v-if="serviceFee !== null" class="fact">
          <dt>Cargo por servicio</dt>
          <dd>{{ formatMoney(serviceFee, currency) }} / boleto</dd>
        </div>
      </dl>
    </div>
  </aside>
</template>

<style scoped>
.venue-aside {
  display: flex;
  flex-direction: column;
  background: var(--white);
  border-left: var(--border);
}

/* The category color: it stays as background if the photo fails. */
.category-teatro {
  --category-subtle: var(--teatro-subtle);
  --category-deep: var(--teatro-deep);
}

.category-cine {
  --category-subtle: var(--cine-subtle);
  --category-deep: var(--cine-deep);
}

.category-museo {
  --category-subtle: var(--museo-subtle);
  --category-deep: var(--museo-deep);
}

.media {
  height: 240px;
  background: var(--category-subtle);
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 28 of padding and 20 between label and data; not design tokens. */
.body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--sp-4) + var(--sp-1));
  padding: calc(var(--sp-5) + var(--sp-1));
}

.tag {
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-xs);
  background: var(--category-subtle);
  color: var(--category-deep);
}

.facts {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 0;
}

.fact {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-4);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--ink-100);
}

dt {
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  color: var(--ink-500);
}

/* Every figure in mono, right-aligned. */
dd {
  margin: 0;
  font: 400 var(--fs-13)/1.45 var(--font-mono);
  text-align: right;
  white-space: nowrap;
  color: var(--ink-900);
}

@media (width <= 1023px) {
  .venue-aside {
    flex-direction: row;
    gap: var(--sp-4);
    border: var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .media {
    flex: none;
    width: 200px;
    height: auto;
  }

  .body {
    flex: 1;
    min-width: 0;
    gap: calc(var(--sp-2) + 2px);
    padding: calc(var(--sp-3) + 2px) var(--sp-4) calc(var(--sp-3) + 2px) 0;
  }

  .facts {
    gap: calc(var(--sp-1) + 2px);
  }

  .fact {
    padding-bottom: 0;
    border-bottom: none;
  }
}

@media (width <= 639px) {
  .media {
    width: 104px;
  }
}
</style>

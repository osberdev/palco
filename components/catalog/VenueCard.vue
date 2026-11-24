<script setup lang="ts">
import type { CatalogVenue, CategorySlug } from '../../types'

interface Props {
  venue: CatalogVenue
  /** A radio of the selection grid: all three categories can be purchased. */
  selected?: boolean
}

const { venue, selected = false } = defineProps<Props>()

const emit = defineEmits<{ select: [venueId: string] }>()

const radioId = computed(() => `venue-${venue.id}`)

const CAPACITY_UNIT: Readonly<Record<CategorySlug, string>> = {
  teatro: 'asientos',
  cine: 'butacas',
  museo: 'visitantes por día',
}

const detail = computed(() => {
  if (venue.category === 'teatro') return `${venue.detailCount} secciones`
  if (venue.category === 'cine') return `${venue.detailCount} formatos`
  return venue.hasResidentFee ? 'Tarifa por residencia' : null
})

const subtitle = computed(() => (detail.value ? `${venue.city} · ${detail.value}` : venue.city))

// Same degradation as CategoryCard: if the photo fails, the category color remains.
const imageFailed = ref(false)
</script>

<template>
  <article class="venue-card" :class="{ selected }">
    <!--
      A native radio inside the card: keyboard and screen reader support without an
      invented role, and the <article> does not end up inside a <label>.
    -->
    <input
      :id="radioId"
      type="radio"
      name="venue"
      class="visually-hidden"
      :value="venue.id"
      :checked="selected"
      @change="emit('select', venue.id)"
    >
    <div class="media" :class="`media-${venue.category}`">
      <img
        v-if="!imageFailed"
        :src="`/img/${venue.category}.jpg`"
        :alt="venue.name"
        loading="lazy"
        @error="imageFailed = true"
      >
    </div>
    <div class="body">
      <h2 class="heading-md name">
        <label :for="radioId" class="hit-area">{{ venue.name }}</label>
      </h2>
      <p class="body-sm subtitle">{{ subtitle }}</p>
    </div>
    <div class="foot">
      <p class="price">
        <span class="label from">Desde</span>
        <span class="mono-lg amount">{{ formatMoney(venue.referencePrice, venue.currency) }}</span>
      </p>
      <span class="mono-sm capacity">{{ formatCount(venue.capacity) }} {{ CAPACITY_UNIT[venue.category] }}</span>
    </div>
  </article>
</template>

<style scoped>
.venue-card {
  /* The whole card is clickable: the label's ::after covers it. */
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  transition: border-color var(--dur-fast) var(--ease);
}

.hit-area {
  cursor: pointer;
}

.hit-area::after {
  content: '';
  position: absolute;
  inset: 0;
}

/* The hidden radio receives focus; the card reflects it. */
.venue-card:has(input:focus-visible) {
  outline: 2px solid var(--ink-900);
  outline-offset: 2px;
}

.venue-card:hover {
  border-color: var(--ink-400);
}

/* The chosen card switches its border to ink. */
.selected,
.selected:hover {
  border-color: var(--ink-900);
}

.media {
  height: 196px;
  overflow: hidden;
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

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
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: calc(var(--sp-4) + var(--sp-1)) calc(var(--sp-4) + var(--sp-1)) var(--sp-4);
}

.name {
  color: var(--ink-900);
}

.subtitle {
  color: var(--ink-500);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  /* "Desde" sits above the price: the capacity aligns with the last line, the amount's. */
  align-items: last baseline;
  gap: var(--sp-3);
  padding: var(--sp-4) calc(var(--sp-4) + var(--sp-1));
  border-top: var(--border);
}

.price {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.from,
.capacity {
  color: var(--ink-500);
}

.amount {
  color: var(--ink-900);
}

/*
 * With "Desde" and an amount like "ARS 8,000.00", a large card's footer does not
 * fit on one row. Neither the amount nor the capacity breaks internally; if they
 * do not fit together, the capacity wraps as a whole.
 */
.amount,
.capacity {
  white-space: nowrap;
}
</style>

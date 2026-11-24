<script setup lang="ts">
import type { Purchase } from '../../types'

interface Props {
  purchase: Purchase
}

const { purchase } = defineProps<Props>()

const row = computed(() => purchaseRow(purchase))

// Same degradation as VenueAside: if the photo fails, the category color remains.
const imageFailed = ref(false)
</script>

<template>
  <!--
    Wide screens: illustration, purchase, amount and arrow in one row. Narrow
    screens: a stacked card. The folio line keeps the same order at every width.
  -->
  <NuxtLink :to="`/confirmacion/${row.folio}`" class="purchase-row" :class="`category-${row.category}`">
    <div class="media">
      <img v-if="!imageFailed" :src="`/img/${row.category}.jpg`" alt="" @error="imageFailed = true">
    </div>
    <div class="summary">
      <span class="label tag">{{ categoryTitle(row.category) }}</span>
      <span class="title">{{ row.title }}</span>
      <span class="body-sm subtitle">{{ row.subtitle }}</span>
    </div>
    <div class="figures">
      <span class="amount">{{ row.amount }}</span>
      <span class="body-sm event">Evento <span class="mono">{{ row.event }}</span></span>
      <span class="tickets"><SegmentedText :segments="row.tickets" /></span>
    </div>
    <svg
      class="chevron"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m10 7 5 5-5 5" />
    </svg>
  </NuxtLink>
</template>

<style scoped>
/* 112 of illustration, the purchase, the figures and the arrow. */
.purchase-row {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) auto 20px;
  grid-template-areas: 'media summary figures chevron';
  align-items: center;
  gap: var(--sp-5);
  padding-right: calc(var(--sp-4) + var(--sp-1));
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  transition: border-color var(--dur-fast) var(--ease);
}

.purchase-row:hover {
  border-color: var(--ink-900);
}

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
  grid-area: media;
  height: 112px;
  background: var(--category-subtle);
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.summary {
  grid-area: summary;
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
  min-width: 0;
  padding: var(--sp-4) 0;
}

.tag {
  align-self: flex-start;
  padding: calc(var(--sp-1) + 1px) var(--sp-2);
  border-radius: var(--r-xs);
  background: var(--category-subtle);
  color: var(--category-deep);
}

.title {
  font: 600 var(--fs-18)/1.35 var(--font-sans);
  color: var(--ink-900);
}

.subtitle {
  color: var(--ink-500);
}

.figures {
  grid-area: figures;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: calc(var(--sp-1) + 2px);
  text-align: right;
}

/* Mono 18, outside the type scale. */
.amount {
  font: 500 var(--fs-18) var(--font-mono);
  color: var(--ink-900);
  white-space: nowrap;
}

.event {
  color: var(--ink-700);
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
}

.tickets {
  font: 400 var(--fs-12) var(--font-sans);
  color: var(--ink-500);
  white-space: nowrap;
}

.chevron {
  grid-area: chevron;
  color: var(--ink-500);
}

/*
 * sm: a 72 thumbnail with 14 of margin and the purchase; below, the event with the
 * amount and the folio line with the arrow, separated by a rule.
 */
@media (width <= 639px) {
  .purchase-row {
    grid-template-columns: calc(72px + 14px) minmax(0, 1fr) auto;
    grid-template-areas:
      'media summary summary'
      'event event amount'
      'tickets tickets tickets';
    gap: 0;
    padding: 0;
  }

  .media {
    width: 72px;
    height: 72px;
    margin: calc(var(--sp-3) + 2px) 0 var(--sp-3) calc(var(--sp-3) + 2px);
    border-radius: var(--r-sm);
    overflow: hidden;
  }

  .summary {
    gap: var(--sp-1);
    padding: calc(var(--sp-3) + 2px) calc(var(--sp-3) + 2px) var(--sp-3) calc(var(--sp-3) + 2px);
  }

  .title {
    font-size: var(--fs-16);
  }

  /* The figures are split across the two lower rows. */
  .figures {
    display: contents;
  }

  .event,
  .amount,
  .tickets {
    align-self: stretch;
    justify-self: stretch;
    padding: calc(var(--sp-2) + 2px) calc(var(--sp-3) + 2px);
    border-top: 1px solid var(--ink-100);
    text-align: left;
  }

  .event {
    grid-area: event;
  }

  .amount {
    grid-area: amount;
    text-align: right;
    font-size: var(--fs-14);
  }

  .tickets {
    grid-area: tickets;
  }

  /* The arrow shares the folio row, on the right. */
  .chevron {
    grid-area: tickets;
    align-self: center;
    justify-self: end;
    margin-right: calc(var(--sp-3) + 2px);
  }
}
</style>

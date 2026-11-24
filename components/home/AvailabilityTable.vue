<script setup lang="ts">
import type { CatalogVenue } from '../../types'

interface Props {
  venues: readonly CatalogVenue[]
}

const { venues } = defineProps<Props>()
</script>

<template>
  <section class="availability">
    <h2 class="heading-lg title">Disponibilidad</h2>

    <!-- lg and md: a tabular grid. The city is dropped at md for space. -->
    <div class="table" role="table" aria-label="Disponibilidad por recinto">
      <div class="row head" role="row">
        <span aria-hidden="true" />
        <span class="label" role="columnheader">Recinto</span>
        <span class="label city" role="columnheader">Ciudad</span>
        <span class="label num" role="columnheader">Aforo</span>
        <span class="label num" role="columnheader">Libres</span>
      </div>

      <div v-for="venue in venues" :key="venue.id" class="row" role="row">
        <span class="dot" :class="`dot-${venue.category}`" aria-hidden="true" />
        <span class="name body-md" role="cell">{{ venue.name }}</span>
        <span class="city body-md" role="cell">{{ venue.city }}</span>
        <span class="num mono-md" role="cell">{{ formatCount(venue.capacity) }}</span>
        <span class="num mono-md" role="cell">{{ formatCount(venue.available) }}</span>
      </div>
    </div>

    <!-- sm: the grid does not fit, each venue becomes a card. -->
    <ul class="stack">
      <li v-for="venue in venues" :key="venue.id" class="stack-item">
        <div class="stack-head">
          <span class="dot" :class="`dot-${venue.category}`" aria-hidden="true" />
          <span class="stack-name">{{ venue.name }}</span>
        </div>
        <div class="stack-foot">
          <span class="body-sm city-text">{{ venue.city }}</span>
          <span class="mono-sm figures">
            {{ formatCount(venue.capacity) }} · {{ formatCount(venue.available) }} libres
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.availability {
  display: flex;
  flex-direction: column;
}

.title {
  margin-bottom: var(--sp-4);
  color: var(--ink-900);
}

.table {
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 16px 1fr 1fr 120px 120px;
  gap: var(--sp-4);
  align-items: center;
  min-height: 48px;
  padding: 0 calc(var(--sp-4) + var(--sp-1));
  border-top: var(--border);
}

.row.head {
  min-height: 0;
  padding: var(--sp-3) calc(var(--sp-4) + var(--sp-1));
  background: var(--ink-100);
  border-top: none;
  color: var(--ink-500);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-xs);
}

.dot-teatro {
  background: var(--teatro);
}

.dot-cine {
  background: var(--cine);
}

.dot-museo {
  background: var(--museo);
}

.name {
  color: var(--ink-900);
}

.city {
  color: var(--ink-500);
}

/* Presentation rule: every figure in mono and right-aligned. */
.num {
  text-align: right;
  color: var(--ink-900);
}

.stack {
  display: none;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.stack-item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: calc(var(--sp-3) + 2px) var(--sp-4);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.stack-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.stack-name {
  font: 400 var(--fs-15) var(--font-sans);
  color: var(--ink-900);
}

.stack-foot {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp-3);
}

.city-text {
  color: var(--ink-500);
}

.figures {
  font-size: var(--fs-13);
  color: var(--ink-900);
  text-align: right;
}

@media (width <= 1023px) {
  .row {
    grid-template-columns: 16px 1fr 88px 88px;
    gap: var(--sp-3);
    padding: 0 var(--sp-4);
  }

  .row.head {
    padding: var(--sp-3) var(--sp-4);
  }

  .city {
    display: none;
  }
}

@media (width <= 639px) {
  .title {
    font: 600 var(--fs-18)/1.35 var(--font-sans);
    margin-bottom: var(--sp-3);
  }

  .table {
    display: none;
  }

  .stack {
    display: flex;
  }
}
</style>

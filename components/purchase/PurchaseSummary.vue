<script setup lang="ts">
import type { CategorySlug, Cents, Currency, SummaryRow } from '../../types'

interface Props {
  rows: readonly SummaryRow[]
  /** In cents. */
  total: Cents
  currency: Currency
  category: CategorySlug
}

const { rows, total, currency, category } = defineProps<Props>()
</script>

<template>
  <!--
    A full-height band at lg and xl, a card before the form at md and sm. Each
    *Checkout builds the rows: the summary does not know the composites.
  -->
  <aside class="purchase-summary" :class="`category-${category}`" aria-label="Resumen">
    <span class="label caption">Resumen</span>
    <span class="label tag">{{ categoryTitle(category) }}</span>
    <dl class="rows">
      <div v-for="row in rows" :key="row.label" class="row">
        <dt>{{ row.label }}</dt>
        <dd :class="{ mono: row.mono }">{{ row.value }}</dd>
      </div>
    </dl>
    <div class="total">
      <span class="heading-md">Total</span>
      <span class="amount">{{ formatMoney(total, currency) }}</span>
    </div>
  </aside>
</template>

<style scoped>
/* 40 and 32 of padding; only 32 is a design token. */
.purchase-summary {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-7) var(--sp-6);
  background: var(--white);
  border-left: var(--border);
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

.caption {
  color: var(--ink-500);
}

.tag {
  align-self: flex-start;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-xs);
  background: var(--category-subtle);
  color: var(--category-deep);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 0;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-4);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--ink-100);
}

dt {
  flex: none;
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  color: var(--ink-500);
}

/* The email can be long: it breaks wherever needed. */
dd {
  min-width: 0;
  margin: 0;
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  text-align: right;
  overflow-wrap: anywhere;
  color: var(--ink-900);
}

/* Every figure in mono, right-aligned and never broken. */
dd.mono {
  font-family: var(--font-mono);
  white-space: nowrap;
}

.total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp-4);
  color: var(--ink-900);
}

/* Mono 22 for the total; outside the type scale. */
.amount {
  font: 500 var(--fs-22) var(--font-mono);
  white-space: nowrap;
}

/* A bordered card with 20 of padding before the form. */
@media (width <= 1023px) {
  .purchase-summary {
    padding: calc(var(--sp-4) + var(--sp-1));
    border: var(--border);
    border-radius: var(--r-md);
  }
}
</style>

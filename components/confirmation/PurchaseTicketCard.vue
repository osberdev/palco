<script setup lang="ts">
import type { IssuedTicketView, Purchase } from '../../types'

interface Props {
  purchase: Purchase
  tickets: readonly IssuedTicketView[]
}

const { purchase, tickets } = defineProps<Props>()

const cells = computed(() => purchaseDetailCells(purchase))
const breakdown = computed(() => purchaseBreakdown(purchase))
const payment = computed(() => paymentLines(purchase.payment))
const purchasedOn = computed(() => purchasedOnLabel(purchase))
</script>

<template>
  <!--
    The ticket with its QR: event data next to the visible ticket, perforation,
    folio with the breakdown and the payment strip.
  -->
  <article class="ticket" :class="`category-${purchase.category}`" aria-label="Compra">
    <div class="event">
      <div class="details">
        <div class="venue">
          <span class="label tag">{{ categoryTitle(purchase.category) }}</span>
          <span class="body-sm venue-line">{{ purchaseVenueLine(purchase) }}</span>
        </div>
        <dl class="cells">
          <div v-for="cell in cells" :key="cell.label" class="cell" :class="{ wide: cell.wide }">
            <dt class="label cell-label">{{ cell.label }}</dt>
            <dd class="cell-value" :class="{ mono: cell.mono }">{{ cell.value }}</dd>
            <dd v-if="cell.note" class="body-sm cell-note"><SegmentedText :segments="cell.note" /></dd>
          </div>
        </dl>
      </div>
      <TicketQrViewer :tickets="tickets" />
    </div>

    <!-- The ticket perforation: decorative. -->
    <div class="perforation" aria-hidden="true" />

    <div class="settlement">
      <div class="folio">
        <span class="label cell-label">Folio</span>
        <span class="folio-number">{{ purchase.folio }}</span>
        <span class="body-sm muted">También lo encuentras en Mis boletos.</span>
      </div>
      <div class="breakdown">
        <div v-for="(line, index) in breakdown.lines" :key="index" class="line">
          <span class="body-md line-label"><SegmentedText :segments="line.label" /></span>
          <span class="mono-md line-amount">{{ line.amount }}</span>
        </div>
        <div class="total">
          <span class="heading-md">Total pagado</span>
          <span class="total-amount">{{ breakdown.total }}</span>
        </div>
      </div>
    </div>

    <div class="payment">
      <div class="payment-lines">
        <span class="body-md">{{ payment[0] }}</span>
        <span class="payment-detail"><SegmentedText :segments="payment[1]" /></span>
      </div>
      <span class="body-sm muted purchased-on"><SegmentedText :segments="purchasedOn" /></span>
    </div>
  </article>
</template>

<style scoped>
.ticket {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
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

.event {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-6);
  padding: var(--sp-6);
}

.details {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: calc(var(--sp-4) + var(--sp-1));
  min-width: 0;
}

/* The label above the venue line. */
.venue {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
}

/* 5 and 8 of padding, like the VenueAside tag. */
.tag {
  flex: none;
  padding: calc(var(--sp-1) + 1px) var(--sp-2);
  border-radius: var(--r-xs);
  background: var(--category-subtle);
  color: var(--category-deep);
}

.venue-line {
  min-width: 0;
  color: var(--ink-500);
}

/* Two columns next to the QR. */
.cells {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-5);
  margin: 0;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

/* The event date spans two columns. */
.cell.wide {
  grid-column: span 2;
}

.cell-label {
  color: var(--ink-500);
}

dd {
  margin: 0;
}

/* Geist 16/1.4 at 500; figures in mono and never broken. */
.cell-value {
  font: 500 var(--fs-16)/1.4 var(--font-sans);
  color: var(--ink-900);
}

.cell-value.mono {
  font-family: var(--font-mono);
  white-space: nowrap;
}

.cell-note,
.muted {
  color: var(--ink-500);
}

/* A dotted line with two half moons in the page color. */
.perforation {
  position: relative;
  height: 0;
  border-top: 1px dashed var(--ink-300);
}

.perforation::before,
.perforation::after {
  content: '';
  position: absolute;
  top: -12px;
  width: 22px;
  height: 22px;
  border: var(--border);
  border-radius: var(--r-full);
  background: var(--ink-50);
}

.perforation::before {
  left: -12px;
}

.perforation::after {
  right: -12px;
}

.settlement {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: var(--sp-7);
  padding: var(--sp-6);
}

.folio {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
  min-width: 0;
}

/* Mono 30, outside the type scale: the folio is the value people look for. */
.folio-number {
  font: 500 var(--fs-30)/1.2 var(--font-mono);
  letter-spacing: 0.02em;
  color: var(--ink-900);
  white-space: nowrap;
}

.breakdown {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
  min-width: 0;
}

.line,
.total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp-4);
}

.line {
  color: var(--ink-700);
}

.line-label {
  flex: 1;
  min-width: 0;
}

.line-amount {
  white-space: nowrap;
}

.total {
  padding-top: var(--sp-3);
  border-top: var(--border);
  color: var(--ink-900);
}

.total .heading-md {
  white-space: nowrap;
}

/* Mono 22, like the PurchaseSummary total. */
.total-amount {
  font: 500 var(--fs-22) var(--font-mono);
  white-space: nowrap;
}

.payment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: calc(var(--sp-4) + var(--sp-1)) var(--sp-6);
  border-top: var(--border);
  background: var(--ink-50);
}

.payment-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--ink-900);
}

/* Geist Mono 13; the PayPal email can be long. */
.payment-detail {
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  color: var(--ink-700);
  overflow-wrap: anywhere;
}

.purchased-on {
  white-space: nowrap;
}

/* At 768 the folio and the breakdown are still side by side. */
@media (width <= 639px) {
  /* The QR first, full width, and the data below. */
  .event {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: calc(var(--sp-4) + var(--sp-1));
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .cells {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(var(--sp-4) + var(--sp-1)) var(--sp-4);
  }

  .settlement {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .folio-number {
    font-size: var(--fs-24);
  }

  .payment {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4) calc(var(--sp-4) + var(--sp-1));
  }
}
</style>

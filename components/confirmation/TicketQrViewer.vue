<script setup lang="ts">
import type { IssuedTicketView } from '../../types'

interface Props {
  tickets: readonly IssuedTicketView[]
}

const { tickets } = defineProps<Props>()

// The visible ticket is page state, not URL state.
const index = shallowRef(0)
const current = computed(() => tickets[Math.min(index.value, tickets.length - 1)])
const total = computed(() => tickets.length)
const many = computed(() => total.value > 1)
// With a single ticket the QR name has no count either, like the label. The PDF
// does say "Boleto 1 de 1": each page is printed on its own (RN-BOL-04).
const qrLabel = computed(() =>
  many.value && current.value ? `Código QR del boleto ${current.value.number} de ${total.value}` : 'Código QR del boleto',
)

function show(next: number): void {
  index.value = Math.max(0, Math.min(next, total.value - 1))
}
</script>

<template>
  <!-- One ticket at a time, with its QR and its short code. -->
  <div v-if="current" class="viewer">
    <div class="navigator">
      <button
        v-if="many"
        type="button"
        class="arrow"
        aria-label="Boleto anterior"
        :disabled="current.number === 1"
        @click="show(index - 1)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m14 7-5 5 5 5" />
        </svg>
      </button>
      <!-- With a single ticket the label is singular and has no count. -->
      <span class="position" aria-live="polite">
        <template v-if="many">Boleto <span class="mono">{{ current.number }}</span> de <span class="mono">{{ total }}</span></template>
        <template v-else>Boleto</template>
      </span>
      <button
        v-if="many"
        type="button"
        class="arrow"
        aria-label="Boleto siguiente"
        :disabled="current.number === total"
        @click="show(index + 1)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m10 7 5 5-5 5" />
        </svg>
      </button>
    </div>

    <div class="frame">
      <TicketQrCode :payload="current.qrPayload" :label="qrLabel" />
    </div>
    <span class="short-code">{{ current.shortCode }}</span>
    <span v-if="current.seat !== null" class="body-md seat">Asiento <span class="mono">{{ current.seat }}</span></span>
  </div>
</template>

<style scoped>
/* A 220-wide column next to the event data. */
.viewer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
  width: 220px;
}

.navigator {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.position {
  flex: 1;
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--ink-900);
  text-align: center;
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
}

.arrow {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: var(--border);
  border-radius: var(--r-sm);
  background: var(--white);
  color: var(--ink-900);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease);
}

.arrow:hover:not(:disabled) {
  border-color: var(--ink-400);
}

.arrow:disabled {
  background: var(--ink-50);
  color: var(--ink-300);
  cursor: not-allowed;
}

.frame {
  align-self: center;
  width: 200px;
  overflow: hidden;
  border: var(--border);
  border-radius: var(--r-sm);
  background: var(--white);
}

.short-code {
  font: 500 var(--fs-13) var(--font-mono);
  color: var(--ink-900);
  text-align: center;
  white-space: nowrap;
}

.seat {
  color: var(--ink-700);
  text-align: center;
}

/* The QR takes the card's full width. */
@media (width <= 639px) {
  .viewer {
    width: auto;
  }

  .frame {
    align-self: stretch;
    width: auto;
  }
}
</style>

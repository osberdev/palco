<script setup lang="ts">
import { CINEMA_FORMAT_IDS } from '../../server/domain/cinema'
import type { CinemaFormat, Currency } from '../../types'
import { CINEMA_FORMAT_NAMES } from '../../utils/cinema'

interface Props {
  /** The formats the chain operates, in list order. */
  formats: readonly CinemaFormat[]
  chain: string
  currency: Currency
  /** The domain message for a format that is not operated, or null. */
  error: string | null
}

const { formats, chain, currency, error } = defineProps<Props>()

const model = defineModel<string>({ required: true })

// All 18 formats are shown: the ones not operated are chips that, when chosen,
// produce the rejection (RF-CAT-07).
const unavailable = computed(() =>
  CINEMA_FORMAT_IDS.filter((id) => !formats.some((format) => format.id === id)),
)
</script>

<template>
  <!--
    A single group of native radios with cards and chips, so the arrow keys go
    through all 18.
  -->
  <fieldset class="format-picker" aria-describedby="format-help format-error">
    <legend class="label legend">Formato</legend>
    <p id="format-help" class="body-sm help">
      {{ chain }} opera <span class="figure">{{ formats.length }}</span> de los
      <span class="figure">{{ CINEMA_FORMAT_IDS.length }}</span> formatos. Los de borde punteado no están
      disponibles en este establecimiento.
    </p>

    <div class="cards">
      <label v-for="format in formats" :key="format.id" class="card" :class="{ selected: model === format.id }">
        <input v-model="model" type="radio" name="format" class="visually-hidden" :value="format.id">
        <span class="card-name">{{ CINEMA_FORMAT_NAMES[format.id] }}</span>
        <span class="card-meta">
          <span>{{ formatMoney(format.price, currency) }}</span><span class="separator"> · </span><span>{{ formatCount(format.seats) }} butacas</span>
        </span>
      </label>
    </div>

    <span class="label subtitle">Sin servicio en {{ chain }}</span>
    <div class="chips">
      <label v-for="id in unavailable" :key="id" class="chip" :class="{ selected: model === id }">
        <input v-model="model" type="radio" name="format" class="visually-hidden" :value="id">
        {{ CINEMA_FORMAT_NAMES[id] }}
      </label>
    </div>
    <span v-if="error" id="format-error" class="body-sm error" role="alert">{{ error }}</span>
  </fieldset>
</template>

<style scoped>
.format-picker {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.legend {
  padding: 0;
  margin-bottom: calc(var(--sp-2) + 2px);
  color: var(--ink-500);
}

.help,
.subtitle {
  color: var(--ink-500);
}

.figure {
  font-family: var(--font-mono);
}

.subtitle {
  margin-top: var(--sp-1);
}

.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}

/* 10 × 12 of padding; not design tokens. */
.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: calc(var(--sp-2) + 2px) var(--sp-3);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease);
}

.card:hover {
  border-color: var(--ink-400);
}

/* The selected one in inverted ink. */
.card.selected {
  background: var(--ink-900);
  border-color: var(--ink-900);
}

.card-name {
  font: 500 var(--fs-14)/1.4 var(--font-sans);
  color: var(--ink-900);
}

.card-meta {
  font: 400 var(--fs-12)/1.45 var(--font-mono);
  color: var(--ink-500);
}

.selected .card-name {
  color: var(--white);
}

.selected .card-meta {
  color: var(--ink-200);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp-1) + 2px);
}

/* A dotted border for what the chain does not operate. */
.chip {
  padding: calc(var(--sp-2) - 1px) calc(var(--sp-2) + 2px);
  background: var(--ink-50);
  border: 1px dashed var(--ink-300);
  border-radius: var(--r-sm);
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  white-space: nowrap;
  color: var(--ink-500);
  cursor: pointer;
}

.chip.selected {
  background: var(--error-subtle);
  border-color: var(--error);
  font-weight: 500;
  color: var(--error);
}

/* The radio is hidden: focus is drawn on the card or the chip. */
.card:has(input:focus-visible),
.chip:has(input:focus-visible) {
  outline: 2px solid var(--ink-900);
  outline-offset: 2px;
}

.error {
  color: var(--error);
}

/* sm: two columns, with price and seats on two lines. */
@media (width <= 639px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .card-meta > span:not(.separator) {
    display: block;
  }

  .separator {
    display: none;
  }
}
</style>

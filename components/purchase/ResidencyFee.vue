<script setup lang="ts">
import { museumFee } from '../../server/domain/booking'
import type { MuseumVenue } from '../../types'

interface Props {
  museum: MuseumVenue
}

const { museum } = defineProps<Props>()

const isResident = defineModel<boolean>({ required: true })

// The fee comes from the domain, like the summary's: it is not derived again here.
const applicableFee = computed(() => museumFee(museum, isResident.value))
</script>

<template>
  <!-- Fees, question and applicable fee. -->
  <div v-if="museum.hasDifferentiatedFee && museum.residencyQuestion" class="residency-fee">
    <span class="label caption">Residencia</span>
    <!--
      Labels for their radio: they do not take focus, but a click marks No on the
      general fee and Sí on the resident one. The applicable one has an ink border.
    -->
    <div class="fees">
      <label class="fee" for="residency-no" :class="{ applies: !isResident }">
        <span class="fee-name">Tarifa general</span>
        <span class="fee-amount">{{ formatMoney(museum.generalFee, museum.currency) }}</span>
      </label>
      <label class="fee" for="residency-yes" :class="{ applies: isResident }">
        <span class="fee-name">Tarifa residente</span>
        <span class="fee-amount">{{ formatMoney(museum.residentFee, museum.currency) }}</span>
      </label>
    </div>

    <ResidencyRadioGroup v-model="isResident" :question="museum.residencyQuestion" />

    <p class="applicable" aria-live="polite">
      <span>Tarifa aplicable · {{ isResident ? 'Residente' : 'General' }}</span>
      <span class="mono-md">{{ formatMoney(applicableFee, museum.currency) }}</span>
    </p>
  </div>

  <!-- Without a differentiated fee the question is not asked (RN-COM-13). -->
  <div v-else class="residency-fee single">
    <span class="label caption">Tarifa</span>
    <p class="applicable">
      <span>Tarifa única</span>
      <span class="mono-md">{{ formatMoney(museum.generalFee, museum.currency) }}</span>
    </p>
    <p class="body-sm note">Este museo no tiene tarifa diferenciada por residencia.</p>
  </div>
</template>

<style scoped>
.residency-fee {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.single {
  gap: var(--sp-2);
}

.caption,
.note {
  color: var(--ink-500);
}

/* The two cards stay side by side at sm too. */
.fees {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
}

/* 14 of horizontal padding; not a design token. */
.fee {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  padding: var(--sp-3) calc(var(--sp-3) + 2px);
  border: var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease);
}

/* Like the cinema cards; the applicable one keeps its ink border. */
.fee:not(.applies):hover {
  border-color: var(--ink-400);
}

.fee.applies {
  border-color: var(--ink-900);
}

.fee-name {
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  color: var(--ink-500);
}

.fee-amount {
  font: 500 var(--fs-16) var(--font-mono);
  white-space: nowrap;
  color: var(--ink-900);
}

.applicable {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) calc(var(--sp-3) + 2px);
  border-radius: var(--r-sm);
  background: var(--ink-50);
  font: 400 var(--fs-14)/1.5 var(--font-sans);
  color: var(--ink-700);
}

.applicable .mono-md {
  font-weight: 500;
  white-space: nowrap;
  color: var(--ink-900);
}
</style>

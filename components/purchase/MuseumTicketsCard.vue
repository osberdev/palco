<script setup lang="ts">
import type { MuseumPurchaseState } from '../../composables/useMuseumPurchase'

interface Props {
  purchase: MuseumPurchaseState
}

const { purchase } = defineProps<Props>()

const emit = defineEmits<{ continue: [] }>()

// The composable's refs are lifted to the top level so the template unwraps them
// and `v-model` writes into the purchase state.
const { schedule, museum, detail, isResident, quantity, quantityError, selection } = purchase
</script>

<template>
  <section class="tickets-card" aria-label="Boletos">
    <ResidencyFee v-model="isResident" :museum="museum" />

    <EventScheduleFields :schedule="schedule" />

    <QuantityField
      v-model="quantity"
      :user-limit="detail.userLimit"
      :available="detail.available"
      :error="quantityError"
    />

    <!--
      The strip says "Tarifa única" and the summary "Tarifa general": without a
      differentiated fee, the general fee is charged.
    -->
    <OrderSummary
      v-if="selection.ok"
      :quantity="selection.quote.quantity"
      :unit-name="selection.quote.feeKind === 'resident' ? 'Tarifa residente' : 'Tarifa general'"
      :subtotal="selection.quote.amount"
      :total="selection.quote.amount"
      :currency="museum.currency"
    />
    <p v-else class="body-md pending">El total aparece cuando todos los campos son válidos.</p>

    <!-- Disabled until the composite returns OK. -->
    <BaseButton block :disabled="!selection.ok" @click="emit('continue')">Continuar al pago</BaseButton>
  </section>
</template>

<style scoped>
.tickets-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

/* The same separator as the summary, so the total appears in its place. */
.pending {
  padding-top: calc(var(--sp-4) + var(--sp-1));
  border-top: var(--border);
  color: var(--ink-500);
}

/* sm: 20 of padding on the card. */
@media (width <= 639px) {
  .tickets-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>

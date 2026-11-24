<script setup lang="ts">
interface Props {
  userLimit: number
  available: number
  /** The domain message, or null. */
  error: string | null
}

const { userLimit, available, error } = defineProps<Props>()

const model = defineModel<string>({ required: true })

// Sold out: the counter is 0 and not editable, and the sold-out notice replaces
// the quantity error. `ERR_QUANTITY_NOT_POSITIVE` would be true, but it would not
// say why.
const soldOut = computed(() => available === 0)

const describedBy = computed(() => {
  if (soldOut.value) return 'quantity-sold-out quantity-limit'
  return error ? 'quantity-error quantity-limit' : 'quantity-limit'
})
</script>

<template>
  <!-- Quantity, shared by the three purchases. -->
  <div class="quantity">
    <label class="label quantity-label" for="quantity">Cantidad</label>
    <!--
      "Máximo N por usuario y fecha" stays next to the counter. The limit accumulates
      per user, venue and date (RN-CAN-07), not per purchase.
    -->
    <div class="quantity-row">
      <TicketQuantityStepper
        id="quantity"
        v-model="model"
        :user-limit="userLimit"
        :available="available"
        :invalid="!soldOut && error !== null"
        :sold-out="soldOut"
        :described-by="describedBy"
      />
      <span id="quantity-limit" class="body-sm limit">
        Máximo <span class="limit-number">{{ userLimit }}</span> por usuario y fecha
      </span>
    </div>
    <!--
      The sold-out notice, when nothing is available. Its text lives only here: it is
      not a ResultCode.
    -->
    <BaseAlert
      v-if="soldOut"
      id="quantity-sold-out"
      class="quantity-alert"
      variant="error"
      title="No quedan localidades disponibles para este recinto"
    />
    <!-- The quantity error goes below the counter. -->
    <BaseAlert v-else-if="error" id="quantity-error" class="quantity-alert" variant="error">
      {{ error }}
    </BaseAlert>
  </div>
</template>

<style scoped>
.quantity {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.quantity-label {
  color: var(--ink-500);
}

.quantity-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-4);
}

.limit {
  color: var(--ink-500);
}

.limit-number {
  font-family: var(--font-mono);
}

.quantity-alert {
  margin-top: var(--sp-2);
}
</style>

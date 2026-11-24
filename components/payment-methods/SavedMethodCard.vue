<script setup lang="ts">
import type { SavedPaymentMethod } from '../../types'

interface Props {
  method: SavedPaymentMethod
  expired: boolean
  /** The delete confirmation, inside the card itself (RN-MET-09). */
  confirming: boolean
  deleting: boolean
  /** An earlier attempt failed: "Eliminar" becomes "Reintentar". */
  retry: boolean
}

const { method, expired, confirming, deleting, retry } = defineProps<Props>()

const emit = defineEmits<{ requestDelete: [], cancelDelete: [], confirmDelete: [] }>()
</script>

<template>
  <article class="method-card" :class="{ confirming }">
    <template v-if="confirming">
      <SavedMethodLines :method="method" number-only />
      <p class="question">¿Eliminar este método? No se puede deshacer.</p>
      <div class="actions">
        <BaseButton variant="secondary" class="danger" :loading="deleting" loading-label="Eliminando método" @click="emit('confirmDelete')">
          {{ retry ? 'Reintentar' : 'Eliminar' }}
        </BaseButton>
        <BaseButton variant="secondary" :disabled="deleting" @click="emit('cancelDelete')">Cancelar</BaseButton>
      </div>
    </template>
    <template v-else>
      <SavedMethodLines :method="method" :expired="expired" />
      <p v-if="expired" class="note">Edita la expiración o elimínala para volver a usarla.</p>
      <div class="links">
        <NuxtLink :to="`/metodos-de-pago/${method.id}`" class="text-button">Editar</NuxtLink>
        <button type="button" class="text-button" @click="emit('requestDelete')">Eliminar</button>
      </div>
    </template>
  </article>
</template>

<style scoped>
.method-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: calc(var(--sp-4) + var(--sp-1));
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.method-card.confirming {
  border-color: var(--ink-900);
}

.note,
.question {
  margin: 0;
}

.note {
  font: 400 var(--fs-13)/1.45 var(--font-sans);
  color: var(--ink-500);
}

.question {
  margin-top: var(--sp-2);
  font: 500 var(--fs-14)/1.5 var(--font-sans);
  color: var(--ink-900);
}

.links,
.actions {
  display: flex;
  flex-wrap: wrap;
  margin-top: auto;
}

.links {
  gap: var(--sp-4);
  padding-top: var(--sp-1);
}

.actions {
  gap: var(--sp-2);
  padding-top: var(--sp-2);
}

.text-button {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 var(--sp-1);
  border: none;
  background: none;
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--ink-900);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

/* "Eliminar" in the error red, over the secondary button. */
.danger {
  color: var(--error);
}
</style>

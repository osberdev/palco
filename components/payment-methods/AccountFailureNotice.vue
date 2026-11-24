<script setup lang="ts">
import type { AccountAlert } from '../../composables/useAccountRequest'

interface Props {
  alert: AccountAlert
  /** The failure title: "No pudimos guardar el método" or "No pudimos eliminar el método". */
  failureTitle: string
  /** The ended-session paragraph: it says what could not be changed. */
  unauthorizedMessage?: string
}

const {
  alert,
  failureTitle,
  unauthorizedMessage = 'Inicia sesión de nuevo para cambiar tus métodos de pago. No se guardó ningún cambio.',
} = defineProps<Props>()
</script>

<template>
  <!-- A rejection of the whole request, with the MESSAGES text. -->
  <BaseAlert v-if="alert.kind === 'rejected'" variant="error" :title="alert.message" />
  <!-- No response from the server. -->
  <BaseAlert v-else-if="alert.kind === 'offline'" variant="error" :title="failureTitle">
    <span class="trace">sin conexión · {{ alert.time }}</span>
  </BaseAlert>
  <BaseAlert v-else-if="alert.kind === 'failed'" variant="error" :title="failureTitle">
    <span class="trace">error {{ alert.status }} · {{ alert.time }}</span>
  </BaseAlert>
  <!-- The ended session. -->
  <BaseAlert v-else variant="error" title="Tu sesión terminó">
    {{ unauthorizedMessage }}
  </BaseAlert>
</template>

<style scoped>
/* Mono 12, in the alert color. */
.trace {
  display: block;
  margin-top: 2px;
  font: 400 var(--fs-12) var(--font-mono);
}
</style>

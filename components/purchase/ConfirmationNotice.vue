<script setup lang="ts">
import type { ConfirmationAlert } from '../../composables/usePurchaseConfirmation'

interface Props {
  alert: ConfirmationAlert
}

const { alert } = defineProps<Props>()
</script>

<template>
  <!--
    "Confirmar compra" alerts. "No se registró ningún cargo" only when the server
    answered with a rejection: without a response, or with a server error, it is
    unknown, and the texts point to RN-CON-07.
  -->
  <BaseAlert
    v-if="alert.kind === 'rejected' && alert.step === 'tickets'"
    variant="info"
    title="No pudimos confirmar la compra"
  >
    Te regresamos a Boletos: revisa el campo marcado. No se registró ningún cargo.
  </BaseAlert>
  <!--
    A saved method has no field to mark; the reason goes in the alert itself, with
    the server's message.
  -->
  <BaseAlert
    v-else-if="alert.kind === 'rejected' && alert.field === 'savedMethod'"
    variant="info"
    title="No pudimos confirmar la compra"
  >
    {{ alert.message }}
  </BaseAlert>
  <BaseAlert v-else-if="alert.kind === 'rejected'" variant="info" title="No pudimos confirmar la compra">
    Revisa el campo marcado. No se registró ningún cargo.
  </BaseAlert>
  <BaseAlert v-else-if="alert.kind === 'offline'" variant="error" title="No pudimos conectar con el servidor">
    Tus datos se conservan. Si la compra alcanzó a registrarse, reintentar no la duplica.
    <span class="trace">sin conexión · {{ alert.time }}</span>
  </BaseAlert>
  <BaseAlert v-else-if="alert.kind === 'failed'" variant="error" title="El servidor no pudo confirmar la compra">
    Tus datos se conservan. Si la compra alcanzó a registrarse, reintentar no la duplica.
    <span class="trace">error {{ alert.status }} · {{ alert.time }}</span>
  </BaseAlert>
  <BaseAlert v-else variant="error" title="Tu sesión terminó">
    Inicia sesión de nuevo para confirmar la compra. No se registró ningún cargo; al volver tendrás que capturar los
    boletos otra vez.
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

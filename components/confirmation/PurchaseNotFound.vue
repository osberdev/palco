<script setup lang="ts">
// The error state illustration, inlined as in ErrorState.
import errorIllustration from '~/assets/img/estado-error.jpg?inline'
</script>

<template>
  <!--
    The same text for a malformed, missing or foreign folio, without repeating the
    one in the URL, which is arbitrary text (RN-CON-06).
  -->
  <EmptyState
    title="No encontramos esta compra"
    text="No hay ninguna compra con ese folio en tu cuenta."
    :illustration="errorIllustration"
  >
    <template #action>
      <NuxtLink to="/boletos" class="tickets-link">Ir a Mis boletos</NuxtLink>
    </template>
  </EmptyState>
</template>

<style scoped>
/* Primary button, 48 tall like BaseButton: it is a link because it navigates. */
.tickets-link {
  display: inline-flex;
  align-items: center;
  height: 48px;
  padding: 0 var(--sp-5);
  border-radius: var(--r-sm);
  background: var(--ink-900);
  color: var(--white);
  font: 500 var(--fs-15) var(--font-sans);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease);
}

.tickets-link:hover {
  background: var(--ink-700);
}
</style>

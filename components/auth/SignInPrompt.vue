<script setup lang="ts">
// The registration screen's "¿Ya tienes cuenta? Iniciar sesión". While submitting,
// the link is disabled.
interface Props {
  disabled: boolean
}

const { disabled } = defineProps<Props>()
</script>

<template>
  <p class="sign-in body-md">
    <span class="question">¿Ya tienes cuenta?</span>
    <span v-if="disabled" class="sign-in-link disabled" aria-disabled="true">Iniciar sesión</span>
    <NuxtLink v-else to="/login" class="sign-in-link">Iniciar sesión</NuxtLink>
  </p>
</template>

<style scoped>
.sign-in {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: var(--sp-2);
}

.question {
  color: var(--ink-500);
}

.sign-in-link {
  font-weight: 500;
  color: var(--ink-900);
  text-underline-offset: 3px;
}

.sign-in-link.disabled {
  color: var(--ink-300);
  text-decoration: underline;
  cursor: not-allowed;
}
</style>

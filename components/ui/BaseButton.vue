<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary'
  type?: 'button' | 'submit'
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
  block?: boolean
  /** With a target it is a link that looks like a button: "Registrar" changes route. */
  to?: string
  /**
   * The target is not a page: the router does not intercept it. "Imprimir boletos"
   * opens the PDF from an endpoint.
   */
  external?: boolean
}

const {
  variant = 'primary',
  type = 'button',
  disabled = false,
  loading = false,
  loadingLabel = 'Verificando',
  block = false,
  to,
  external = false,
} = defineProps<Props>()
</script>

<template>
  <NuxtLink v-if="to" :to="to" :external="external" class="link-button" :class="[`variant-${variant}`, { block }]">
    <span><slot /></span>
  </NuxtLink>
  <button
    v-else
    :type="type"
    :class="[`variant-${variant}`, { block, loading }]"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <svg
      v-if="loading"
      class="spinner"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke-width="1.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" class="track" />
      <path d="M21 12a9 9 0 0 0-9-9" class="head" />
    </svg>
    <span v-if="loading">{{ loadingLabel }}</span>
    <span v-else><slot /></span>
  </button>
</template>

<style scoped>
/*
 * `button` keeps its specificity: the classes components pass from outside still
 * beat it.
 */
button,
.link-button {
  height: 48px;
  padding: 0 var(--sp-5);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  font: 500 var(--fs-15) var(--font-sans);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.link-button {
  text-decoration: none;
}

.block {
  width: 100%;
}

.variant-primary {
  background: var(--ink-900);
  color: var(--white);
}

.variant-primary:hover:not(:disabled) {
  background: var(--ink-700);
}

.variant-secondary {
  background: var(--white);
  border-color: var(--ink-200);
  color: var(--ink-900);
}

.variant-secondary:hover:not(:disabled) {
  border-color: var(--ink-400);
}

button:disabled {
  background: var(--ink-200);
  border-color: transparent;
  color: var(--ink-400);
  cursor: not-allowed;
}

.loading {
  cursor: progress;
}

.spinner {
  animation: spin 900ms linear infinite;
}

.spinner .track {
  stroke: color-mix(in srgb, var(--white) 30%, transparent);
}

.spinner .head {
  stroke: currentcolor;
}

/*
 * An infinite rotation without a token (RNF-11): the loading state is still
 * announced by `aria-busy`, the disabled button and `loadingLabel`.
 */
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

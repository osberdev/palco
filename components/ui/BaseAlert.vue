<script setup lang="ts">
interface Props {
  variant: 'error' | 'success' | 'info'
  /** A bold title above the body. */
  title?: string
}

const { variant, title } = defineProps<Props>()

// An error is announced by interrupting; a confirmation or a notice waits its
// turn (RNF-10).
const live = computed(() => (variant === 'error' ? 'assertive' : 'polite'))
</script>

<template>
  <div class="alert" :class="[`variant-${variant}`, { titled: title }]" role="status" :aria-live="live">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <template v-if="variant === 'error'">
        <path d="M12 7.5v5.5" />
        <path d="M12 16.4v.2" />
      </template>
      <template v-else-if="variant === 'info'">
        <path d="M12 11v5.5" />
        <path d="M12 7.6v.2" />
      </template>
      <path v-else d="m8.2 12.3 2.6 2.6 5-5.4" />
    </svg>
    <div class="content">
      <strong v-if="title" class="title">{{ title }}</strong>
      <div v-if="$slots.default" :class="title ? 'body-sm' : 'body-md'"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.alert {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: calc(var(--sp-3) + 2px) var(--sp-4);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  border-left: 3px solid currentcolor;
}

/* With a title, the icon aligns with the first line. */
.alert.titled {
  align-items: flex-start;
}

.alert svg {
  flex: none;
}

.alert.titled svg {
  margin-top: 1px;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

/* Geist 14/1.5 at 500; body-md with the label weight. */
.title {
  font: 500 var(--fs-14)/1.5 var(--font-sans);
}

.variant-error {
  background: var(--error-subtle);
  color: var(--error);
}

.variant-success {
  background: var(--success-subtle);
  color: var(--success);
}

.variant-info {
  background: var(--info-subtle);
  color: var(--info);
}
</style>

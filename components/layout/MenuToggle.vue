<script setup lang="ts">
interface Props {
  /** Id of the panel the button opens and closes. */
  controls: string
  open: boolean
}

const { controls, open } = defineProps<Props>()

const emit = defineEmits<{ toggle: [] }>()

const button = useTemplateRef<HTMLButtonElement>('button')

defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <!-- A hamburger at rest, a cross with a background while the menu is open. -->
  <button
    ref="button"
    type="button"
    class="menu-toggle"
    :class="{ open }"
    :aria-controls="controls"
    :aria-expanded="open"
    :aria-label="open ? 'Cerrar menú' : 'Abrir menú'"
    @click="emit('toggle')"
  >
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
      <template v-if="open">
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </template>
      <template v-else>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.menu-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-700);
  transition: background var(--dur-fast) var(--ease);
}

.menu-toggle.open {
  background: var(--ink-100);
  color: var(--ink-900);
}
</style>

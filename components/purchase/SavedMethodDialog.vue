<script setup lang="ts">
import { isSavedMethodExpired } from '../../server/domain/saved-payment'
import type { CalendarDate, SavedPaymentMethod } from '../../types'

interface Props {
  methods: readonly SavedPaymentMethod[]
  today: CalendarDate
}

const { methods, today } = defineProps<Props>()

const emit = defineEmits<{ accept: [method: SavedPaymentMethod] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const chosen = ref<string | null>(null)
let opener: HTMLElement | null = null

/**
 * A native `<dialog>` with `showModal()`: it traps focus, Escape closes it and the
 * background becomes inert without custom code. There is no default method: it
 * opens with nothing chosen (RN-MET-07).
 */
function open(): void {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  chosen.value = null
  dialog.value?.showModal()
}

function close(): void {
  dialog.value?.close()
}

// Closing in any way changes nothing and returns focus to whoever opened it.
function onClose(): void {
  opener?.focus()
  opener = null
}

// Clicking outside: the click lands on the `<dialog>` itself, whose backdrop is the veil.
function onClick(event: MouseEvent): void {
  if (event.target === dialog.value) close()
}

function accept(): void {
  const method = methods.find((candidate) => candidate.id === chosen.value)
  if (!method) return
  close()
  emit('accept', method)
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="saved-dialog" aria-labelledby="saved-dialog-title" @close="onClose" @click="onClick">
    <div class="sheet">
      <header class="header">
        <h2 id="saved-dialog-title" class="heading-lg">Métodos de pago guardados</h2>
        <p class="body-md subtitle">Elige uno para esta compra.</p>
      </header>

      <!-- Native radios; the expired one disabled (RN-MET-08). -->
      <fieldset class="options">
        <legend class="visually-hidden">Métodos de pago guardados</legend>
        <label
          v-for="method in methods"
          :key="method.id"
          class="option"
          :class="{ selected: chosen === method.id, disabled: isSavedMethodExpired(method, today) }"
        >
          <input
            v-model="chosen"
            type="radio"
            class="radio"
            name="saved-method"
            :value="method.id"
            :disabled="isSavedMethodExpired(method, today)"
          >
          <span class="lines">
            <SavedMethodLines :method="method" :expired="isSavedMethodExpired(method, today)" :dimmed="isSavedMethodExpired(method, today)" />
          </span>
        </label>
      </fieldset>

      <div class="actions">
        <BaseButton variant="secondary" class="action" @click="close">Cancelar</BaseButton>
        <BaseButton class="action" :disabled="chosen === null" @click="accept">Aceptar</BaseButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* The only element with a shadow (border before shadow). */
.saved-dialog {
  width: min(560px, calc(100% - 2 * var(--sp-5)));
  max-width: none;
  padding: 0;
  border: none;
  border-radius: var(--r-lg);
  background: var(--white);
  box-shadow: var(--sh-lg);
  color: var(--ink-900);
}

/* The veil, --ink-900 at 40 %, without a literal. */
.saved-dialog::backdrop {
  background: color-mix(in srgb, var(--ink-900) 40%, transparent);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-4) + var(--sp-1));
  padding: calc(var(--sp-5) + var(--sp-1));
}

.header {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
}

.heading-lg,
.subtitle {
  margin: 0;
}

.subtitle {
  color: var(--ink-500);
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.option {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--sp-3) + 2px);
  padding: calc(var(--sp-3) + 2px) var(--sp-4);
  border: var(--border);
  border-radius: var(--r-md);
  background: var(--white);
  cursor: pointer;
}

.option.selected {
  border-color: var(--ink-900);
}

.option.disabled {
  background: var(--ink-50);
  cursor: not-allowed;
}

.option:has(.radio:focus-visible) {
  outline: 2px solid var(--ink-900);
  outline-offset: 2px;
}

.radio {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--ink-900);
}

.lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-3);
}


/* sm: a full-width sheet attached to the bottom. */
@media (width <= 639px) {
  .saved-dialog {
    width: 100%;
    margin: auto 0 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }

  .sheet {
    padding: var(--sp-5) calc(var(--sp-4) + var(--sp-1)) calc(var(--sp-5) + var(--sp-1));
  }

  .actions .action {
    flex: 1;
  }
}
</style>

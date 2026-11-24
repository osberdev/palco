<script setup lang="ts">
import type { WhatsappView } from '../../types'
import { countryOptions, spanishRegionName, type CountryOption } from '../../utils/whatsapp'

interface Props {
  /** "Guardar" from the profile; "Guardar y enviar" from the confirmation. */
  submitLabel: string
  clock: () => Date
}

const { submitLabel, clock } = defineProps<Props>()

const emit = defineEmits<{ saved: [whatsapp: WhatsappView] }>()

const form = useWhatsappForm(clock)
const { country, number, consent, numberError, countryError, consentError, canSave, pending, alert } = form

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const options = shallowRef<readonly CountryOption[]>([])
let opener: HTMLElement | null = null

// The dialog only mounts on the client: country names depend on the ICU version,
// and the server and the browser might not agree.
onMounted(async () => {
  const domain = await form.load()
  options.value = countryOptions(
    domain.WHATSAPP_COUNTRIES,
    domain.WHATSAPP_DEFAULT_COUNTRY,
    domain.whatsappCallingCode,
    spanishRegionName(),
  )
})

/** A native `<dialog>`, like SavedMethodDialog: it traps focus and Escape closes it. */
async function open(): Promise<void> {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await form.load()
  form.reset()
  dialog.value?.showModal()
  document.getElementById('whatsapp-number')?.focus()
}

function close(): void {
  dialog.value?.close()
}

// Closing in any way returns focus to whoever opened it, if it is still there.
function onClose(): void {
  if (opener?.isConnected) opener.focus()
  opener = null
}

// The country format is only applied with the cursor at the end: in the middle, it
// would move the cursor while the user corrects.
function onNumberInput(value: string): void {
  const element = document.getElementById('whatsapp-number')
  const atEnd = !(element instanceof HTMLInputElement) || element.selectionStart === value.length
  form.input(value, atEnd)
}

async function save(): Promise<void> {
  const saved = await form.save()
  if (!saved) return
  close()
  emit('saved', saved)
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="whatsapp-dialog" aria-labelledby="whatsapp-dialog-title" @close="onClose">
    <form class="sheet" @submit.prevent="save">
      <h2 id="whatsapp-dialog-title" class="heading-lg">Recibe tus boletos en WhatsApp</h2>

      <div class="fields">
        <FormField id="whatsapp-country" label="País" :error="countryError">
          <template #default="{ describedBy, invalid }">
            <CountrySelect
              id="whatsapp-country"
              v-model="country"
              :options="options"
              :disabled="pending"
              :invalid="invalid"
              :described-by="describedBy"
            />
          </template>
        </FormField>
        <FormField
          id="whatsapp-number"
          label="Número de WhatsApp"
          help="Un celular con WhatsApp. Aquí te enviaremos tus boletos."
          :error="numberError"
        >
          <template #default="{ describedBy, invalid }">
            <!-- No maxlength: the length rejection must be reachable. -->
            <BaseInput
              id="whatsapp-number"
              :model-value="number"
              mono
              inputmode="numeric"
              autocomplete="tel-national"
              :readonly="pending"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="onNumberInput"
              @focusout="form.touched.value = true"
            />
          </template>
        </FormField>
      </div>

      <div class="consent">
        <label class="consent-row">
          <input v-model="consent" type="checkbox" class="checkbox" :disabled="pending" :aria-invalid="consentError !== null">
          <span class="body-md">Acepto recibir mis boletos por WhatsApp</span>
        </label>
        <p v-if="consentError" class="body-sm error" role="alert">{{ consentError }}</p>
      </div>

      <AccountFailureNotice
        v-if="alert"
        :alert="alert"
        failure-title="No pudimos guardar tu WhatsApp"
        unauthorized-message="Inicia sesión de nuevo para guardar tu WhatsApp. No se guardó ningún cambio."
      />

      <div class="actions">
        <BaseButton variant="secondary" class="action" :disabled="pending" @click="close">Cancelar</BaseButton>
        <BaseButton v-if="alert?.kind === 'unauthorized'" class="action" @click="form.signInAgain()">Iniciar sesión</BaseButton>
        <BaseButton v-else type="submit" class="action" :disabled="!canSave" :loading="pending" loading-label="Guardando">
          {{ submitLabel }}
        </BaseButton>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
/* 520 wide; the only element with a shadow, like SavedMethodDialog. */
.whatsapp-dialog {
  width: min(520px, calc(100% - 2 * var(--sp-5)));
  max-width: none;
  padding: 0;
  border: none;
  border-radius: var(--r-lg);
  background: var(--white);
  box-shadow: var(--sh-lg);
  color: var(--ink-900);
}

.whatsapp-dialog::backdrop {
  background: color-mix(in srgb, var(--ink-900) 40%, transparent);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: calc(var(--sp-5) + var(--sp-1));
}

.heading-lg {
  margin: 0;
}

/* The 176 country field and the number next to it. */
.fields {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: var(--sp-4);
  align-items: start;
}

.consent {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.consent-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 44px;
  cursor: pointer;
}

.checkbox {
  flex: none;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--ink-900);
}

.error {
  margin: 0;
  color: var(--error);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-3);
}

/* sm: a full-width sheet attached to the bottom, one field per row. */
@media (width <= 639px) {
  .whatsapp-dialog {
    width: 100%;
    margin: auto 0 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }

  .sheet {
    padding: var(--sp-5) calc(var(--sp-4) + var(--sp-1)) calc(var(--sp-5) + var(--sp-1));
  }

  .fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .actions .action {
    flex: 1;
  }
}
</style>

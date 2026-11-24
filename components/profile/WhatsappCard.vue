<script setup lang="ts">
import type { WhatsappStatus, WhatsappView } from '../../types'
import { deletedSuccess } from '../../utils/account-outcome'

interface Props {
  clock: () => Date
}

const { clock } = defineProps<Props>()

const { data, error, refresh } = await useFetch<WhatsappStatus>('/api/profile/whatsapp', { key: 'profile-whatsapp' })
const whatsapp = computed(() => data.value?.whatsapp ?? null)

const confirming = shallowRef(false)
const { pending: deleting, alert, send, signInAgain } = useAccountRequest(clock)

const dialog = useTemplateRef<{ open: () => Promise<void> }>('dialog')
const addButton = useTemplateRef<{ $el: HTMLElement }>('add')
const changeButton = useTemplateRef<{ $el: HTMLElement }>('change')

async function saved(view: WhatsappView): Promise<void> {
  data.value = { whatsapp: view }
  await nextTick()
  changeButton.value?.$el.focus()
}

async function remove(): Promise<void> {
  const outcome = await send(
    () => $fetch.raw<unknown>('/api/profile/whatsapp', { method: 'DELETE', ignoreResponseError: true }),
    deletedSuccess,
  )
  if (outcome?.kind !== 'saved') return
  data.value = { whatsapp: null }
  confirming.value = false
  // After removing the number, focus goes to "Agregar WhatsApp".
  await nextTick()
  addButton.value?.$el.focus()
}
</script>

<template>
  <!-- The WhatsApp number for tickets, below the photo and the account data. -->
  <section class="whatsapp-card" :class="{ confirming }" aria-labelledby="whatsapp-title">
    <h2 id="whatsapp-title" class="heading-md">WhatsApp para tus boletos</h2>

    <BaseAlert v-if="error" variant="error" title="No pudimos cargar tu WhatsApp">
      <button type="button" class="text-button" @click="refresh()">Reintentar</button>
    </BaseAlert>

    <template v-else-if="whatsapp === null">
      <p class="text">Agrega tu WhatsApp para recibir tus boletos al confirmar cada compra.</p>
      <div class="actions">
        <BaseButton ref="add" variant="secondary" @click="dialog?.open()">Agregar WhatsApp</BaseButton>
      </div>
    </template>

    <template v-else>
      <span class="number">{{ whatsapp.masked }}</span>
      <p v-if="confirming" class="question">¿Quitar tu WhatsApp? Dejarás de recibir tus boletos al confirmar.</p>
      <p v-else class="text">Tus boletos llegan aquí al confirmar cada compra.</p>

      <AccountFailureNotice
        v-if="alert"
        :alert="alert"
        failure-title="No pudimos quitar tu WhatsApp"
        unauthorized-message="Inicia sesión de nuevo para quitar tu WhatsApp. No se guardó ningún cambio."
      />

      <div v-if="confirming" class="actions">
        <BaseButton variant="secondary" :disabled="deleting" @click="confirming = false">Cancelar</BaseButton>
        <BaseButton v-if="alert?.kind === 'unauthorized'" @click="signInAgain()">Iniciar sesión</BaseButton>
        <BaseButton v-else variant="secondary" class="danger" :loading="deleting" loading-label="Quitando WhatsApp" @click="remove">
          Quitar WhatsApp
        </BaseButton>
      </div>
      <div v-else class="actions">
        <BaseButton ref="change" variant="secondary" @click="dialog?.open()">Cambiar</BaseButton>
        <BaseButton variant="secondary" @click="confirming = true">Quitar</BaseButton>
      </div>
    </template>

    <ClientOnly>
      <WhatsappDialog ref="dialog" submit-label="Guardar" :clock="clock" @saved="saved" />
    </ClientOnly>
  </section>
</template>

<style scoped>
/* A card with 32 of margin; while confirming, with the ink border. */
.whatsapp-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.whatsapp-card.confirming {
  border-color: var(--ink-900);
}

.heading-md,
.text,
.question {
  margin: 0;
}

/* Mono 18 at 500: the masked number is a figure. */
.number {
  font: 500 var(--fs-18) var(--font-mono);
  color: var(--ink-900);
}

.text {
  font: 400 var(--fs-15)/1.55 var(--font-sans);
  color: var(--ink-700);
  text-wrap: pretty;
}

.question {
  font: 500 var(--fs-15)/1.55 var(--font-sans);
  color: var(--ink-900);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

/* "Quitar WhatsApp" in the error red, like "Eliminar" on saved methods. */
.danger {
  color: var(--error);
}

.text-button {
  padding: 0;
  border: none;
  background: none;
  font: 500 var(--fs-14) var(--font-sans);
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

/* sm: buttons stacked at full width. */
@media (width <= 639px) {
  .whatsapp-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .actions {
    flex-direction: column;
  }
}
</style>

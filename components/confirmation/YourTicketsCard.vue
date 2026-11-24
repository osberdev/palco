<script setup lang="ts">
interface Props {
  folio: string
  clock: () => Date
}

const { folio, clock } = defineProps<Props>()

const { view, posting, send } = useTicketsSend(() => folio, clock)

const card = useTemplateRef<HTMLElement>('card')
const dialog = useTemplateRef<{ open: () => Promise<void> }>('dialog')

/** "Enviar", "Reenviar" or "Reintentar"; without a number, the WhatsApp dialog. */
async function sendTickets(): Promise<void> {
  if ((await send()) === 'notRegistered') await dialog.value?.open()
}

/**
 * "Guardar y enviar": the dialog already saved and closed; now it sends. Focus
 * returns to the card: the button that opened the dialog stays disabled while
 * sending.
 */
async function savedAndSend(): Promise<void> {
  await send()
  await nextTick()
  card.value?.focus()
}
</script>

<template>
  <!-- The "Tus boletos" card. -->
  <section ref="card" class="your-tickets" aria-labelledby="your-tickets-title" tabindex="-1">
    <h2 id="your-tickets-title" class="heading-md">Tus boletos</h2>

    <template v-if="view">
      <p v-if="view.paragraph" class="paragraph">{{ view.paragraph }}</p>
      <div v-if="view.sendingText" class="sending" role="status">
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" class="track" />
          <path d="M21 12a9 9 0 0 0-9-9" class="head" />
        </svg>
        <span>{{ view.sendingText }}</span>
      </div>
      <BaseAlert v-if="view.alert" :variant="view.alert.variant" :title="view.alert.title">
        <span v-if="view.alert.trace" class="trace">{{ view.alert.trace }}</span>
      </BaseAlert>

      <TicketsSendActions
        :folio="folio"
        :actions="view.actions"
        :busy="posting"
        @send="sendTickets"
        @change-number="dialog?.open()"
      />
      <p v-if="view.confirmed" class="confirmed">Tu compra está confirmada.</p>
    </template>
    <!-- Before the send status is known, printing already works. -->
    <div v-else class="actions">
      <PrintTicketsLink :folio="folio" />
    </div>

    <ClientOnly>
      <WhatsappDialog ref="dialog" submit-label="Guardar y enviar" :clock="clock" @saved="savedAndSend" />
    </ClientOnly>
  </section>
</template>

<style scoped>
/* 24 of margin and 16 between blocks. */
.your-tickets {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5);
  border: var(--border);
  border-radius: var(--r-md);
  background: var(--white);
}

.your-tickets:focus {
  outline: none;
}

.heading-md,
.paragraph,
.confirmed {
  margin: 0;
}

.paragraph {
  font: 400 var(--fs-15)/1.55 var(--font-sans);
  color: var(--ink-700);
  text-wrap: pretty;
}

.sending {
  display: flex;
  align-items: center;
  gap: calc(var(--sp-2) + 2px);
  font: 400 var(--fs-15)/1.5 var(--font-sans);
  color: var(--ink-700);
}

.spinner {
  flex: none;
  animation: spin 900ms linear infinite;
}

.spinner .track {
  stroke: var(--ink-200);
}

.spinner .head {
  stroke: var(--ink-900);
}

/* Mono 12, in the alert color. */
.trace {
  display: block;
  margin-top: 2px;
  font: 400 var(--fs-12) var(--font-mono);
}

.confirmed {
  font: 500 var(--fs-14)/1.5 var(--font-sans);
  color: var(--ink-900);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

/* An infinite rotation without a token (RNF-11): the text still announces the send. */
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

@media (width <= 639px) {
  .your-tickets {
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .actions {
    flex-direction: column;
  }
}
</style>

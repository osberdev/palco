<script setup lang="ts">
import type { SendAction } from '../../utils/tickets-send-view'

interface Props {
  folio: string
  actions: readonly { readonly action: SendAction; readonly disabled: boolean }[]
  /** The POST in progress: the send button announces the wait. */
  busy?: boolean
}

const { folio, actions, busy = false } = defineProps<Props>()

const emit = defineEmits<{ send: [], changeNumber: [] }>()

const SEND_LABELS: Partial<Record<SendAction, string>> = {
  send: 'Enviar a WhatsApp',
  resend: 'Reenviar a WhatsApp',
  retry: 'Reintentar',
}
</script>

<template>
  <!-- The buttons for each send state, in order. -->
  <div class="send-actions">
    <template v-for="item in actions" :key="item.action">
      <PrintTicketsLink v-if="item.action === 'print'" :folio="folio" />
      <BaseButton
        v-else-if="item.action === 'download'"
        variant="secondary"
        :to="`/api/purchases/${encodeURIComponent(folio)}/tickets`"
        external
        :download="`PALCO-${folio}.pdf`"
      >
        Descargar PDF
      </BaseButton>
      <ShareTicketsButton v-else-if="item.action === 'share'" :folio="folio" />
      <BaseButton v-else-if="item.action === 'changeNumber'" variant="secondary" @click="emit('changeNumber')">
        Cambiar número
      </BaseButton>
      <BaseButton
        v-else
        variant="secondary"
        :disabled="item.disabled"
        :loading="busy"
        loading-label="Enviando"
        @click="emit('send')"
      >
        <span class="content">
          <svg
            v-if="item.action !== 'retry'"
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
            <path d="M21 3 10 14" />
            <path d="m21 3-7 18-4-7-7-4 18-7Z" />
          </svg>
          {{ SEND_LABELS[item.action] }}
        </span>
      </BaseButton>
    </template>
  </div>
</template>

<style scoped>
.send-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.content {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  white-space: nowrap;
}

/* sm: the buttons stacked at full width. */
@media (width <= 639px) {
  .send-actions {
    flex-direction: column;
  }
}
</style>

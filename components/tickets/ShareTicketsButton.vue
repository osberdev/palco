<script setup lang="ts">
interface Props {
  folio: string
  compact?: boolean
}

const { folio, compact = false } = defineProps<Props>()

// Only shown if the browser can share a PDF; checked on mount, on the client, so
// hydration does not break.
const supported = shallowRef(false)
const busy = shallowRef(false)

onMounted(() => {
  try {
    const probe = new File([new Uint8Array([37, 80, 68, 70])], `PALCO-${folio}.pdf`, { type: 'application/pdf' })
    supported.value = typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
  }
  catch {
    supported.value = false
  }
})

async function share(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const response = await fetch(`/api/purchases/${encodeURIComponent(folio)}/tickets`)
    if (!response.ok) return
    const file = new File([await response.blob()], `PALCO-${folio}.pdf`, { type: 'application/pdf' })
    await navigator.share({ files: [file], title: `Boletos ${folio}` })
  }
  catch {
    // Cancelling the share dialog (AbortError) is not an error.
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseButton v-if="supported" variant="secondary" :class="{ compact }" :loading="busy" loading-label="Preparando" @click="share">
    Compartir
  </BaseButton>
</template>

<style scoped>
.compact {
  height: 44px;
  padding: 0 calc(var(--sp-3) + 2px);
  font-size: var(--fs-14);
}
</style>

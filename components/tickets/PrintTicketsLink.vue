<script setup lang="ts">
interface Props {
  folio: string
  /**
   * In "Mis boletos" there is an identical link per row: the accessible name
   * includes the folio.
   */
  namedByFolio?: boolean
  /** 44 tall with 14 px text, like the row actions. */
  compact?: boolean
}

const { folio, namedByFolio = false, compact = false } = defineProps<Props>()

const accessibleName = computed(() => (namedByFolio ? `Imprimir boletos de ${folio}` : undefined))
</script>

<template>
  <!--
    A link to the PDF rather than a JavaScript button (RF-ENV-02): it works before
    hydration and the browser opens it in its viewer.
  -->
  <BaseButton
    class="print-link"
    :class="{ compact }"
    variant="secondary"
    :to="`/api/purchases/${encodeURIComponent(folio)}/tickets`"
    external
    target="_blank"
    rel="noopener"
    :aria-label="accessibleName"
  >
    <span class="content">
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
        <path d="M7 9V4h10v5" />
        <rect x="4" y="9" width="16" height="8" rx="1.5" />
        <path d="M7 14h10v6H7z" />
      </svg>
      Imprimir boletos
    </span>
  </BaseButton>
</template>

<style scoped>
.content {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  white-space: nowrap;
}

.print-link.compact {
  height: 44px;
  padding: 0 calc(var(--sp-3) + 2px);
  font-size: var(--fs-14);
}
</style>

<script setup lang="ts">
interface Props {
  pending: boolean
  /** Sends the code; when done, the field is cleared and keeps focus for the next one. */
  validate: (code: string) => Promise<unknown>
}

const { pending, validate } = defineProps<Props>()

const code = ref('')

async function submit(): Promise<void> {
  const text = code.value.trim()
  // Empty is not sent: the server would reject it for its shape, saying nothing useful.
  if (text === '' || pending) return
  await validate(text)
  code.value = ''
  await nextTick()
  document.getElementById('gate-code')?.focus()
}
</script>

<template>
  <form class="gate-code" novalidate @submit.prevent="submit">
    <FormField id="gate-code" label="Código corto">
      <div class="code-row">
        <!-- No maxlength: a mistyped code must reach the rejection of its shape. -->
        <BaseInput
          id="gate-code"
          v-model="code"
          class="code-input"
          mono
          autocomplete="off"
          :readonly="pending"
        />
        <BaseButton type="submit" :disabled="code.trim() === ''" :loading="pending" loading-label="Validando">Validar</BaseButton>
      </div>
    </FormField>
  </form>
</template>

<style scoped>
.code-row {
  display: flex;
  gap: var(--sp-3);
}

.code-input {
  flex: 1;
  min-width: 0;
}
</style>

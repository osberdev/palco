<script setup lang="ts">
import { useSessionStore } from '../../stores/session'

interface Props {
  /** The time of failures comes from the page clock. */
  clock: () => Date
}

const { clock } = defineProps<Props>()

const store = useSessionStore()
const { pending, error, alert, saving, choose, startRemoval, cancel, confirm, signInAgain } = useProfilePhoto({ clock })

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const hasPhoto = computed(() => Boolean(store.user?.photoVersion))

// With no pending change the circle shows what is saved; with one, the preview of
// the new photo or the initials.
const preview = computed<string | null | undefined>(() => {
  if (pending.value === null) return undefined
  return pending.value.kind === 'upload' ? pending.value.url : null
})

const signedOut = computed(() => alert.value?.kind === 'unauthorized')
const retrying = computed(() => alert.value?.kind === 'offline' || alert.value?.kind === 'failed')

const primaryLabel = computed(() => {
  if (signedOut.value) return 'Iniciar sesión'
  return retrying.value ? 'Reintentar' : 'Confirmar'
})

const failureTitle = computed(() =>
  alert.value && 'action' in alert.value && alert.value.action === 'remove'
    ? 'No pudimos quitar la foto'
    : 'No pudimos guardar la foto',
)

function pickFile(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared so that choosing the same file again fires the change again.
  input.value = ''
  if (file) await choose(file)
}

function onPrimary(): void {
  if (signedOut.value) void signInAgain()
  else void confirm()
}
</script>

<template>
  <section class="photo-card" aria-labelledby="photo-title">
    <h2 id="photo-title" class="heading-md">Foto de perfil</h2>

    <BaseAlert v-if="alert?.kind === 'saved'" variant="success" :title="alert.action === 'upload' ? 'Foto actualizada' : 'Foto quitada'" />
    <BaseAlert v-else-if="alert?.kind === 'offline'" variant="error" :title="failureTitle">
      <span class="trace">sin conexión · {{ alert.time }}</span>
    </BaseAlert>
    <BaseAlert v-else-if="alert?.kind === 'failed'" variant="error" :title="failureTitle">
      <span class="trace">error {{ alert.status }} · {{ alert.time }}</span>
    </BaseAlert>
    <!-- The ended session, with the same texts as the other account screens. -->
    <BaseAlert v-else-if="alert?.kind === 'unauthorized'" variant="error" title="Tu sesión terminó">
      Inicia sesión de nuevo para cambiar tu foto. No se guardó ningún cambio.
    </BaseAlert>

    <div class="photo-row">
      <UserAvatar class="photo-avatar" :link="false" :preview="preview" />

      <div class="photo-controls">
        <span v-if="pending" class="label unsaved">Sin guardar</span>
        <p class="body-sm help">JPEG, PNG o WebP · hasta 2 MB · <span class="nowrap">mínimo 128 × 128 px</span></p>
        <p v-if="error" class="body-sm photo-error" role="alert">{{ error }}</p>

        <!--
          No `accept`: the system dialog would filter the files and ERR_PHOTO_FORMAT
          would become unreachable.
        -->
        <input ref="fileInput" type="file" class="file-input" tabindex="-1" aria-hidden="true" @change="onFileChange">

        <div class="actions">
          <template v-if="pending">
            <!--
              "Guardando foto" with aria-busy; a second click sends nothing because the
              button is busy.
            -->
            <BaseButton class="primary" :loading="saving" loading-label="Guardando foto" @click="onPrimary">
              {{ primaryLabel }}
            </BaseButton>
            <BaseButton variant="secondary" :disabled="saving" @click="cancel">Cancelar</BaseButton>
          </template>
          <template v-else>
            <BaseButton variant="secondary" @click="pickFile">Subir foto</BaseButton>
            <button v-if="hasPhoto" type="button" class="text-button" @click="startRemoval">Quitar foto</button>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.photo-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-4) + var(--sp-1));
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
  min-width: 0;
}

.heading-md {
  margin: 0;
}

.photo-row {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}

.photo-avatar {
  --avatar-size: 144px;
  --avatar-font: var(--fs-43);
}

.photo-controls {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.unsaved {
  align-self: flex-start;
  padding: calc(var(--sp-1) + 1px) var(--sp-2);
  border-radius: var(--r-xs);
  background: var(--ink-100);
  color: var(--ink-700);
}

.help,
.photo-error {
  margin: 0;
}

.help {
  color: var(--ink-500);
}

.photo-error {
  color: var(--error);
}

/* Measurements never break across lines. */
.nowrap {
  white-space: nowrap;
}

.file-input {
  display: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

/* While saving, the button keeps its ink color. */
.primary.loading {
  background: var(--ink-900);
  color: var(--white);
}

.text-button {
  height: 44px;
  padding: 0 var(--sp-1);
  border: none;
  background: none;
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--ink-900);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

/* Mono 12, in the alert color. */
.trace {
  display: block;
  margin-top: 2px;
  font: 400 var(--fs-12) var(--font-mono);
}

@media (width <= 639px) {
  .photo-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .photo-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .photo-avatar {
    --avatar-size: 112px;
    --avatar-font: var(--fs-34);
  }
}
</style>

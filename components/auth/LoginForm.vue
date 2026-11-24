<script setup lang="ts">
import {
  usePasswordValidation,
  useUsernameValidation,
} from '../../composables/useCredentialValidation'
import type { ResultCode } from '../../server/domain/result'

type Phase = 'editing' | 'submitting' | 'granted'

const { login } = useAuth()

const username = ref('')
const password = ref('')
const phase = ref<Phase>('editing')
const serverMessage = ref('')
const serverCode = ref<ResultCode | null>(null)

const usernameState = useUsernameValidation(username)
const passwordState = usePasswordValidation(password)

const passwordFocused = ref(false)

const isReadonly = computed(() => phase.value !== 'editing')

// The position hint accompanies typing and stays while the format is still
// invalid, which is when it explains the rejection.
const showRuleHint = computed(
  () => !isReadonly.value
    && (passwordFocused.value || (password.value.length > 0 && !passwordState.result.value.ok)),
)

const canSubmit = computed(
  () => usernameState.result.value.ok && passwordState.result.value.ok,
)

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || isReadonly.value) return

  phase.value = 'submitting'
  serverMessage.value = ''
  serverCode.value = null

  const response = await login(username.value, password.value)

  if (response.ok) {
    phase.value = 'granted'
    await navigateTo('/')
    return
  }

  serverCode.value = response.code
  serverMessage.value = response.message
  // RF-AUT-15: the field is cleared after a failed attempt so the second attempt
  // does not resend the same password out of inertia.
  password.value = ''
  phase.value = 'editing'
}
</script>

<template>
  <form class="login-form" novalidate @submit.prevent="onSubmit">
    <header class="heading">
      <h1 class="display-lg">Iniciar sesión</h1>
      <p class="body-md subtitle">Ingresa tus credenciales para continuar</p>
    </header>

    <div class="fields">
      <CredentialField
        id="username"
        v-model="username"
        label="CURP"
        rule="18 de CURP más 2 de entidad · solo mayúsculas y números"
        rule-short="20 · mayúsculas y números"
        readonly-hint="Solo lectura"
        autocomplete="username"
        :state="usernameState"
        :readonly="isReadonly"
      />

      <div class="password-block">
        <CredentialField
          id="password"
          v-model="password"
          label="Contraseña"
          type="password"
          rule="8 caracteres · mayúscula, minúscula, número y símbolo"
          rule-short="8 · mayúscula, minúscula, número y símbolo"
          readonly-hint="Solo lectura"
          autocomplete="current-password"
          revealable
          :state="passwordState"
          :readonly="isReadonly"
          @focus-change="passwordFocused = $event"
        />

        <PasswordRuleHint v-if="showRuleHint" :value="password" />
      </div>

      <!--
        The code travels as an attribute so the smoke test can assert the rejection
        reason and not just the displayed text.
      -->
      <BaseAlert v-if="serverMessage" variant="error" :data-code="serverCode">
        {{ serverMessage }}
      </BaseAlert>
      <BaseAlert v-if="phase === 'granted'" variant="success">
        Acceso concedido. Redirigiendo…
      </BaseAlert>

      <!--
        The mousedown does not take focus away from the password: if it did, the
        requirements hint would hide, its height change would shift the button in the
        middle of the click and the mouseup would land outside it.
      -->
      <BaseButton
        type="submit"
        block
        :disabled="!canSubmit"
        :loading="phase === 'submitting'"
        @mousedown.prevent
      >
        Ingresar
      </BaseButton>

      <!-- "Registrar" leads to another route, so it is a link. -->
      <div class="register">
        <p class="body-md question">¿Aún no tienes cuenta?</p>
        <BaseButton to="/registro" variant="secondary" block>Registrar</BaseButton>
      </div>
    </div>
  </form>
</template>

<style scoped>
.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.heading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.subtitle {
  color: var(--ink-500);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-4) + var(--sp-1));
}

.register {
  margin-top: var(--sp-1);
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
}

.question {
  margin: 0;
  text-align: center;
  color: var(--ink-500);
}

.password-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

@media (width <= 639px) {
  .login-form {
    gap: calc(var(--sp-5) + var(--sp-1));
  }

  .heading h1 {
    font-size: var(--fs-36);
  }
}

@media (width <= 1023px) and (width >= 640px) {
  .heading h1 {
    font-size: var(--fs-40);
  }
}
</style>

<script setup lang="ts">
import type { RegistrationState } from '../../composables/useRegistration'
import { nameLength } from '../../server/domain/registration'

interface Props {
  registration: RegistrationState
}

const { registration } = defineProps<Props>()

const {
  username,
  displayName,
  email,
  password,
  passwordConfirmation,
  usernameState,
  displayNameState,
  emailState,
  passwordState,
  confirmationState,
  canSubmit,
  serverErrors,
  pending,
  alert,
  created,
  submit,
} = registration

const isReadonly = computed(() => pending.value || created.value)

// The requirements hint follows the sign-in criterion: it accompanies typing and
// stays while the password is still invalid.
const passwordFocused = ref(false)
const showRuleHint = computed(
  () => !isReadonly.value
    && (passwordFocused.value || (password.value.length > 0 && !passwordState.result.value.ok)),
)
</script>

<template>
  <form class="registration-form" novalidate @submit.prevent="submit">
    <header class="heading">
      <h1 class="display-lg">Crear cuenta</h1>
      <p class="body-md subtitle">Regístrate con tu CURP</p>
    </header>

    <div class="fields">
      <CredentialField
        id="registration-username"
        v-model="username"
        label="CURP"
        rule="18 de CURP más 2 de entidad · solo mayúsculas y números"
        rule-short="20 · mayúsculas y números"
        autocomplete="username"
        :state="usernameState"
        readonly-hint="Solo lectura"
        :readonly="isReadonly"
        :server-error="serverErrors.fieldError('username')"
      />

      <CredentialField
        id="registration-name"
        v-model="displayName"
        label="Nombre"
        rule="Letras, espacios, apóstrofos y guiones · hasta 60"
        autocomplete="name"
        :state="displayNameState"
        :measure="nameLength"
        :enforce-limit="false"
        readonly-hint="Solo lectura"
        :readonly="isReadonly"
        :server-error="serverErrors.fieldError('displayName')"
      />

      <!-- No maxlength (ERR_EMAIL_TOO_LONG must be reachable) and no counter. -->
      <CredentialField
        id="registration-email"
        v-model="email"
        label="Correo (opcional)"
        rule="Ejemplo: nombre@dominio.com · no sirve para iniciar sesión"
        autocomplete="email"
        :state="emailState"
        :enforce-limit="false"
        :counter="false"
        readonly-hint="Solo lectura"
        :readonly="isReadonly"
        :server-error="serverErrors.fieldError('email')"
      />

      <div class="password-block">
        <CredentialField
          id="registration-password"
          v-model="password"
          label="Contraseña"
          type="password"
          rule="8 caracteres · mayúscula, minúscula, número y símbolo"
          rule-short="8 · mayúscula, minúscula, número y símbolo"
          autocomplete="new-password"
          revealable
          :state="passwordState"
          readonly-hint="Solo lectura"
        :readonly="isReadonly"
          :server-error="serverErrors.fieldError('password')"
          @focus-change="passwordFocused = $event"
        />

        <PasswordRuleHint v-if="showRuleHint" :value="password" />
      </div>

      <CredentialField
        id="registration-confirmation"
        v-model="passwordConfirmation"
        label="Confirmar contraseña"
        type="password"
        rule="Escríbela de nuevo"
        autocomplete="new-password"
        revealable
        :counter="false"
        :valid-hint="null"
        :state="confirmationState"
        readonly-hint="Solo lectura"
        :readonly="isReadonly"
        :server-error="serverErrors.fieldError('passwordConfirmation')"
      />

      <AccountFailureNotice v-if="alert" :alert="alert" failure-title="No pudimos crear la cuenta" />
      <BaseAlert v-if="created" variant="success">Cuenta creada. Entrando…</BaseAlert>

      <!-- The mousedown does not take focus away from the field, as in "Ingresar". -->
      <BaseButton
        type="submit"
        block
        :disabled="!canSubmit || created"
        :loading="pending"
        loading-label="Crear cuenta"
        @mousedown.prevent
      >
        Crear cuenta
      </BaseButton>

      <SignInPrompt :disabled="pending" />
    </div>
  </form>
</template>

<style scoped>
.registration-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-5) + var(--sp-1));
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
  gap: calc(var(--sp-4) + 2px);
}

.password-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

@media (width <= 639px) {
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

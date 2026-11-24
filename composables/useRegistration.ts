import type { Ref } from 'vue'
import { PASSWORD_LENGTH } from '../server/domain/credentials'
import { USERNAME_LENGTH } from '../server/domain/curp'
import { EMAIL_MAX_LENGTH } from '../server/domain/payment'
import {
  evaluateDisplayName,
  evaluatePasswordConfirmation,
  evaluateRegistration,
  evaluateRegistrationCurp,
  evaluateRegistrationEmail,
  NAME_MAX_LENGTH,
  type RegistrationInput,
} from '../server/domain/registration'
import { useSessionStore } from '../stores/session'
import { isSessionUser } from '../utils/account-outcome'
import type { CalendarDate } from '../types'
import { useFieldValidation, usePasswordValidation } from './useCredentialValidation'

/**
 * Registration state. The rules are the domain's; this only orchestrates the five
 * fields, with the optional email, the submission and the response. The page
 * provides `today` and `clock`: it is the only one that reads the clock.
 */
export function useRegistration(today: Ref<CalendarDate>, clock: () => Date) {
  const username = ref('')
  const displayName = ref('')
  // The optional email: when empty, the user has no email.
  const email = ref('')
  const password = ref('')
  const passwordConfirmation = ref('')

  // The age comes from the CURP, so an age rejection is marked on it.
  const usernameState = useFieldValidation(username, (text) => evaluateRegistrationCurp(text, today.value), USERNAME_LENGTH)
  const displayNameState = useFieldValidation(displayName, evaluateDisplayName, NAME_MAX_LENGTH)
  // Empty stays "pristine": there is nothing to confirm and the hint stays.
  const emailState = useFieldValidation(email, evaluateRegistrationEmail, EMAIL_MAX_LENGTH)
  const passwordState = usePasswordValidation(password)
  // Reads the password inside the computation: changing it re-evaluates the confirmation.
  const confirmationState = useFieldValidation(
    passwordConfirmation,
    (text) => evaluatePasswordConfirmation(password.value, text),
    PASSWORD_LENGTH,
  )

  const input = computed<RegistrationInput>(() => ({
    username: username.value,
    displayName: displayName.value,
    email: email.value,
    password: password.value,
    passwordConfirmation: passwordConfirmation.value,
  }))
  const canSubmit = computed(() => evaluateRegistration(input.value, today.value).ok)

  const serverErrors = useServerFieldErrors()
  serverErrors.clearOnChange('username', username)
  serverErrors.clearOnChange('displayName', displayName)
  serverErrors.clearOnChange('email', email)
  serverErrors.clearOnChange('password', password)
  serverErrors.clearOnChange('passwordConfirmation', passwordConfirmation)

  const { pending, alert, send, dismiss } = useAccountRequest(clock)
  const created = ref(false)

  // The already-registered CURP alert disappears as soon as the CURP changes.
  watch(username, () => {
    if (alert.value?.kind === 'rejected') dismiss()
  })

  async function submit(): Promise<void> {
    if (!canSubmit.value || pending.value || created.value) return
    serverErrors.clearAll()
    const outcome = await send(
      () => $fetch.raw<unknown>('/api/auth/register', { method: 'POST', body: input.value, ignoreResponseError: true }),
      (body) => (isSessionUser(body.user) ? body.user : null),
    )
    if (outcome?.kind === 'rejected' && outcome.field !== null) {
      // After reading `today` again, so the field and the client agree.
      today.value = toCalendarDate(clock())
      serverErrors.record(outcome.field, null, outcome.message)
    }
    if (outcome?.kind !== 'saved') return
    // RN-REG-05: the server already started the session. Nothing that was entered is cleared.
    created.value = true
    useSessionStore().setUser(outcome.value)
    await navigateTo('/')
  }

  return {
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
  }
}

export type RegistrationState = ReturnType<typeof useRegistration>

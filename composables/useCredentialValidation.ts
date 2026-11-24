import type { Ref } from 'vue'
import { PASSWORD_LENGTH, validatePassword } from '../server/domain/credentials'
import { USERNAME_LENGTH, validateUsername } from '../server/domain/curp'
import type { Result } from '../server/domain/result'

export type FieldStatus = 'pristine' | 'valid' | 'invalid'

export interface CredentialFieldState {
  readonly result: Ref<Result>
  readonly status: Ref<FieldStatus>
  readonly maxLength: number
}

/**
 * A reactive wrapper around the domain. It decides nothing: it turns the pure
 * function's `Result` into a state the UI knows how to render. The whole rule
 * lives in `server/domain/curp.ts` and `server/domain/credentials.ts`.
 */
export function useFieldValidation(
  value: Ref<string>,
  validate: (input: string) => Result,
  maxLength: number,
): CredentialFieldState {
  const result = computed(() => validate(value.value))

  const status = computed<FieldStatus>(() => {
    // An untouched field shows no error: the rule is communicated before the error
    // through the hint text, not by flagging in red what has not been typed yet.
    if (value.value.length === 0) return 'pristine'
    return result.value.ok ? 'valid' : 'invalid'
  })

  return { result, status, maxLength }
}

export function useUsernameValidation(value: Ref<string>): CredentialFieldState {
  return useFieldValidation(value, validateUsername, USERNAME_LENGTH)
}

export function usePasswordValidation(value: Ref<string>): CredentialFieldState {
  return useFieldValidation(value, validatePassword, PASSWORD_LENGTH)
}

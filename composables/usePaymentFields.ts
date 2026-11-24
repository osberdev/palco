import type { MaybeRefOrGetter } from 'vue'
import {
  CARD_LENGTH,
  evaluateCardNumber,
  evaluateEmail,
  evaluateExpiry,
  evaluateHolderName,
  identifyBrand,
} from '../server/domain/payment'
import type { Result } from '../server/domain/result'
import type { CalendarDate, PaymentMethod } from '../types'
import { useServerFieldErrors, type ServerFieldErrors } from './useServerFieldErrors'

/** The rejection message, only after the first blur, as in step 1. */
export function touchedError(touched: boolean, result: Result): string | null {
  return touched && !result.ok ? result.message : null
}

/**
 * Method, card and email, without the security code: what the payment step and
 * adding a saved method share. Adding a method does not ask for the code because
 * it is never stored (RN-MET-04). Every result comes from the domain.
 */
export function usePaymentFields(
  todaySource: MaybeRefOrGetter<CalendarDate>,
  serverErrors: ServerFieldErrors = useServerFieldErrors(),
) {
  const today = computed(() => toValue(todaySource))

  // Credit is the resting method. Switching methods keeps the values: going back to
  // the card does not require typing it again.
  const method = ref<PaymentMethod>('credit')
  const cardNumber = ref('')
  const holder = ref('')
  const expiry = ref('')
  const email = ref('')

  const cardNumberTouched = ref(false)
  const holderTouched = ref(false)
  const expiryTouched = ref(false)
  const emailTouched = ref(false)

  // The brand tag shows as soon as the prefix is recognized, even if digits are
  // missing or Luhn fails.
  const brand = computed(() => identifyBrand(cardNumber.value))
  const cardCounter = computed(() => `${cardNumber.value.length}/${CARD_LENGTH}`)

  const cardNumberCheck = computed(() => evaluateCardNumber(cardNumber.value))
  // For each field, the client error and, if there is none, the server's after a
  // rejection.
  const cardNumberError = computed(() =>
    (cardNumberTouched.value && !cardNumberCheck.value.ok ? cardNumberCheck.value.result.message : null)
    ?? serverErrors.fieldError('cardNumber'),
  )
  const holderError = computed(() =>
    touchedError(holderTouched.value, evaluateHolderName(holder.value)) ?? serverErrors.fieldError('holder'),
  )
  const expiryError = computed(() =>
    touchedError(expiryTouched.value, evaluateExpiry(expiry.value, today.value)) ?? serverErrors.fieldError('expiry'),
  )
  const emailError = computed(() =>
    touchedError(emailTouched.value, evaluateEmail(email.value)) ?? serverErrors.fieldError('email'),
  )

  serverErrors.clearOnChange('method', method)
  serverErrors.clearOnChange('cardNumber', cardNumber)
  serverErrors.clearOnChange('holder', holder)
  serverErrors.clearOnChange('expiry', expiry)
  serverErrors.clearOnChange('email', email)

  return {
    method,
    cardNumber,
    holder,
    expiry,
    email,
    cardNumberTouched,
    holderTouched,
    expiryTouched,
    emailTouched,
    brand,
    cardCounter,
    cardNumberError,
    holderError,
    expiryError,
    emailError,
  }
}

export type PaymentFieldsState = ReturnType<typeof usePaymentFields>

import type { MaybeRefOrGetter } from 'vue'
import { evaluateSecurityCode, type PaymentInput } from '../server/domain/payment'
import { evaluatePaymentRequest, isSavedMethodExpired, type PaymentRequest } from '../server/domain/saved-payment'
import type { CalendarDate, PaymentMethodsResponse, SavedPaymentMethod } from '../types'
import { touchedError, usePaymentFields } from './usePaymentFields'
import { useServerFieldErrors, type ServerFieldErrors } from './useServerFieldErrors'

/** Payment with a saved method, as it travels in the purchase body. */
export interface SavedPaymentBody {
  readonly savedMethodId: string
  readonly securityCode: string
}

/**
 * Payment step state. Like the rest of the purchase, it decides nothing: every
 * result comes from `server/domain/payment.ts`. Fields are evaluated separately to
 * show every error at once, and the composite decides whether the summary has a
 * payment row; INV9 and INV10 guarantee they do not diverge.
 *
 * The payment can also use a saved method (RN-MET-07): one is chosen and, for a
 * card, only the security code is asked for.
 */
export function usePayment(
  todaySource: MaybeRefOrGetter<CalendarDate>,
  serverErrors: ServerFieldErrors = useServerFieldErrors(),
) {
  const today = computed(() => toValue(todaySource))
  const fields = usePaymentFields(todaySource, serverErrors)

  const securityCode = ref('')
  const securityCodeTouched = ref(false)
  const securityCodeError = computed(() =>
    touchedError(securityCodeTouched.value, evaluateSecurityCode(securityCode.value)) ?? serverErrors.fieldError('securityCode'),
  )
  serverErrors.clearOnChange('securityCode', securityCode)

  // The composite's input is the same that travels in the confirmation body: client
  // and server evaluate exactly the same thing.
  const input = computed<PaymentInput>(() => ({
    method: fields.method.value,
    cardNumber: fields.cardNumber.value,
    holder: fields.holder.value,
    expiry: fields.expiry.value,
    securityCode: securityCode.value,
    email: fields.email.value,
  }))

  // ── Saved method ──────────────────────────────────────────────────────────
  const savedMethods = ref<readonly SavedPaymentMethod[]>([])
  const selectedMethod = ref<SavedPaymentMethod | null>(null)
  const savedSecurityCode = ref('')
  const savedSecurityCodeTouched = ref(false)
  const savedSecurityCodeError = computed(() =>
    touchedError(savedSecurityCodeTouched.value, evaluateSecurityCode(savedSecurityCode.value)) ?? serverErrors.fieldError('securityCode'),
  )
  serverErrors.clearOnChange('securityCode', savedSecurityCode)
  /** The server's rejection code for the chosen method, or null. */
  const savedMethodRejection = ref<string | null>(null)

  /** Only unexpired methods are offered (RN-MET-08); with none, there is no button. */
  const selectableMethods = computed(() => savedMethods.value.filter((method) => !isSavedMethodExpired(method, today.value)))

  /**
   * Requested on the client when the purchase mounts. If the request fails there is
   * no button and no alert: typing the payment still works.
   */
  async function loadSavedMethods(): Promise<void> {
    try {
      const response = await $fetch<PaymentMethodsResponse>('/api/payment-methods')
      savedMethods.value = response.methods
    }
    catch {
      // The previous list is kept.
    }
  }
  onMounted(loadSavedMethods)

  function chooseSavedMethod(method: SavedPaymentMethod): void {
    selectedMethod.value = method
    savedSecurityCode.value = ''
    savedSecurityCodeTouched.value = false
    savedMethodRejection.value = null
  }

  /** "Ingresar otro método": back to empty fields (RN-MET-07). */
  function enterOtherMethod(): void {
    selectedMethod.value = null
    savedMethodRejection.value = null
    savedSecurityCode.value = ''
    savedSecurityCodeTouched.value = false
    fields.method.value = 'credit'
    for (const text of [fields.cardNumber, fields.holder, fields.expiry, fields.email, securityCode]) text.value = ''
    for (const touched of [fields.cardNumberTouched, fields.holderTouched, fields.expiryTouched, fields.emailTouched, securityCodeTouched]) {
      touched.value = false
    }
  }

  /**
   * A server rejection of the chosen method: it is marked, confirmation is blocked
   * while it stays chosen and the list is requested again, so the dialog no longer
   * offers a deleted or expired method.
   */
  function rejectSavedMethod(code: string): void {
    savedMethodRejection.value = code
    void loadSavedMethods()
  }

  const request = computed<PaymentRequest>(() =>
    selectedMethod.value
      ? { kind: 'saved', saved: selectedMethod.value, securityCode: savedSecurityCode.value }
      : input.value,
  )

  const payment = computed(() => evaluatePaymentRequest(request.value, today.value))

  /** What travels in the purchase body: the typed input or the saved method. */
  const body = computed<PaymentInput | SavedPaymentBody>(() =>
    selectedMethod.value
      ? { savedMethodId: selectedMethod.value.id, securityCode: savedSecurityCode.value }
      : input.value,
  )

  /** With a current rejection of the chosen method, confirming is not possible. */
  const canConfirm = computed(() => payment.value.ok && savedMethodRejection.value === null)

  return {
    ...fields,
    today,
    securityCode,
    securityCodeTouched,
    securityCodeError,
    input,
    payment,
    body,
    canConfirm,
    savedMethods,
    selectableMethods,
    selectedMethod,
    savedSecurityCode,
    savedSecurityCodeTouched,
    savedSecurityCodeError,
    savedMethodRejection,
    loadSavedMethods,
    chooseSavedMethod,
    enterOtherMethod,
    rejectSavedMethod,
  }
}

export type PaymentState = ReturnType<typeof usePayment>

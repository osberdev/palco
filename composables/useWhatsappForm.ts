import type { WhatsappField } from '../server/domain/whatsapp'
import type { WhatsappView } from '../types'
import { isWhatsappView } from '../utils/whatsapp'
import { useAccountRequest } from './useAccountRequest'

type WhatsappDomain = typeof import('../server/domain/whatsapp')

/**
 * The WhatsApp form (RN-WSP-01 to 04). The `libphonenumber-js/max` metadata weigh
 * about 156 KB: the domain is loaded with `import()` when the dialog mounts, not in
 * every page's bundle.
 */
export function useWhatsappForm(clock: () => Date) {
  const domain = shallowRef<WhatsappDomain | null>(null)
  const country = shallowRef('MX')
  const number = shallowRef('')
  const consent = shallowRef(false)
  const touched = shallowRef(false)
  const serverErrors = ref<Partial<Record<WhatsappField, string>>>({})
  const { pending, alert, send, dismiss, signInAgain } = useAccountRequest(clock)

  async function load(): Promise<WhatsappDomain> {
    domain.value ??= await import('../server/domain/whatsapp')
    return domain.value
  }

  /** The checkbox starts unchecked every time (RN-WSP-04). */
  function reset(): void {
    country.value = domain.value?.WHATSAPP_DEFAULT_COUNTRY ?? 'MX'
    number.value = ''
    consent.value = false
    touched.value = false
    serverErrors.value = {}
    dismiss()
  }

  const evaluation = computed(() => domain.value?.evaluateWhatsappNumber(country.value, number.value) ?? null)

  // The server message lasts until its field changes, as in the purchase.
  watch(country, () => {
    delete serverErrors.value.country
    delete serverErrors.value.number
  })
  watch(number, () => delete serverErrors.value.number)
  watch(consent, () => delete serverErrors.value.consent)

  const numberError = computed(() => {
    const result = evaluation.value
    if (touched.value && result && !result.ok && result.result.code !== 'ERR_WHATSAPP_COUNTRY') return result.result.message
    return serverErrors.value.number ?? null
  })
  const countryError = computed(() => serverErrors.value.country ?? null)
  const consentError = computed(() => serverErrors.value.consent ?? null)

  const canSave = computed(() => evaluation.value?.ok === true && consent.value && !pending.value)

  /** The country format while typing, only with the cursor at the end. */
  function input(value: string, cursorAtEnd: boolean): void {
    number.value = cursorAtEnd && domain.value ? domain.value.formatWhatsappAsYouType(country.value, value) : value
  }

  async function save(): Promise<WhatsappView | null> {
    touched.value = true
    if (!canSave.value) return null
    const outcome = await send(
      () => $fetch.raw<unknown>('/api/profile/whatsapp', {
        method: 'PUT',
        body: { country: country.value, number: number.value, consent: consent.value },
        ignoreResponseError: true,
      }),
      (body) => (isWhatsappView(body.whatsapp) ? body.whatsapp : null),
    )
    if (outcome?.kind === 'rejected' && outcome.field !== null) {
      serverErrors.value = { ...serverErrors.value, [outcome.field]: outcome.message }
    }
    return outcome?.kind === 'saved' ? outcome.value : null
  }

  return {
    domain,
    country,
    number,
    consent,
    touched,
    numberError,
    countryError,
    consentError,
    canSave,
    pending,
    alert,
    load,
    reset,
    input,
    save,
    signInAgain,
  }
}

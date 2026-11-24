import type { CardBrand, PaymentMethod } from '../types'

/**
 * Payment presentation, like `utils/cinema.ts`: the names are UI text and the
 * domain only knows the identifiers.
 */

/** Display names of the payment methods. */
export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = Object.freeze({
  debit: 'Tarjeta de débito',
  credit: 'Tarjeta de crédito',
  paypal: 'PayPal',
})

export const CARD_BRAND_LABELS: Readonly<Record<CardBrand, string>> = Object.freeze({
  visa: 'Visa',
  mastercard: 'Mastercard',
})

/** '************1111 (Visa)', as in the summary. */
export function formatCardSummary(masked: string, brand: CardBrand): string {
  return `${masked} (${CARD_BRAND_LABELS[brand]})`
}

export type PaymentHelp = Readonly<Record<'email' | 'cardNumber' | 'holder' | 'expiry' | 'securityCode', string>>

/** Each field's resting hint. RNF-12 requires one for the email too. */
export const PAYMENT_HELP: PaymentHelp = Object.freeze({
  email: 'Ejemplo: nombre@dominio.com',
  cardNumber: '16 dígitos, sin espacios',
  holder: 'Letras, espacios, apóstrofos y guiones',
  expiry: 'Formato MM/AA',
  securityCode: '3 dígitos',
})

/** While confirming; shorter for expiry and code. */
export const LOCKED_PAYMENT_HELP: PaymentHelp = Object.freeze({
  email: 'Solo lectura mientras se confirma',
  cardNumber: 'Solo lectura mientras se confirma',
  holder: 'Solo lectura mientras se confirma',
  expiry: 'Solo lectura',
  securityCode: 'Solo lectura',
})

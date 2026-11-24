export type ResultCode =
  | 'OK'
  | 'ERR_USERNAME_EMPTY'
  | 'ERR_CURP_LENGTH'
  | 'ERR_CURP_HAS_SPACE'
  | 'ERR_CURP_NOT_UPPERCASE'
  | 'ERR_CURP_SPECIAL_CHAR'
  | 'ERR_CURP_FORMAT_INITIALS'
  | 'ERR_CURP_FORMAT_CONSONANTS'
  | 'ERR_CURP_INVALID_DATE'
  | 'ERR_CURP_INVALID_SEX'
  | 'ERR_CURP_INVALID_STATE'
  | 'ERR_CURP_CHECKSUM'
  | 'ERR_CURP_STATE_MISMATCH'
  | 'ERR_PASSWORD_EMPTY'
  | 'ERR_PASSWORD_HAS_SPACE'
  | 'ERR_PASSWORD_LENGTH'
  | 'ERR_PASSWORD_NO_UPPERCASE'
  | 'ERR_PASSWORD_NO_LOWERCASE'
  | 'ERR_PASSWORD_NO_DIGIT'
  | 'ERR_PASSWORD_NO_SPECIAL'
  | 'ERR_CREDENTIALS_INVALID'
  | 'ERR_DATE_INVALID'
  | 'ERR_DATE_PAST'
  | 'ERR_DAY_CLOSED'
  | 'ERR_DAY_HOLIDAY'
  | 'ERR_OUTSIDE_HOURS'
  | 'ERR_QUANTITY_NOT_POSITIVE'
  | 'ERR_EXCEEDS_USER_LIMIT'
  | 'ERR_EXCEEDS_AVAILABILITY'
  | 'ERR_INPUT_INVALID'
  | 'ERR_PLAY_INVALID'
  | 'ERR_SECTION_INVALID'
  | 'ERR_DATE_FORMAT'
  | 'ERR_TIME_FORMAT'
  | 'ERR_TIME_OUT_OF_RANGE'
  | 'ERR_INTEGER_EXPECTED'
  | 'ERR_FILM_INVALID'
  | 'ERR_FORMAT_UNAVAILABLE'
  | 'ERR_SEAT_INVALID'
  | 'ERR_SEAT_REPEATED'
  | 'ERR_AGE_INSUFFICIENT'
  | 'ERR_AGE_OUT_OF_RANGE'
  | 'ERR_CARD_NOT_NUMERIC'
  | 'ERR_CARD_LENGTH'
  | 'ERR_CARD_BRAND_REJECTED'
  | 'ERR_CARD_LUHN'
  | 'ERR_HOLDER_EMPTY'
  | 'ERR_HOLDER_NOT_ALPHABETIC'
  | 'ERR_EXPIRY_FORMAT'
  | 'ERR_CARD_EXPIRED'
  | 'ERR_SECURITY_CODE_INVALID'
  // Profile photo
  | 'ERR_PHOTO_TOO_LARGE'
  | 'ERR_PHOTO_FORMAT'
  | 'ERR_PHOTO_TOO_SMALL'
  // Saved payment methods
  | 'ERR_SAVED_METHOD_DUPLICATE'
  | 'ERR_SAVED_METHODS_LIMIT'
  | 'ERR_SAVED_METHOD_UNAVAILABLE'
  // Registration
  | 'ERR_NAME_EMPTY'
  | 'ERR_NAME_TOO_LONG'
  | 'ERR_NAME_INVALID_CHARS'
  | 'ERR_PASSWORD_MISMATCH'
  | 'ERR_REGISTRATION_UNDERAGE'
  | 'ERR_CURP_ALREADY_REGISTERED'
  // Account rules
  | 'ERR_REGISTRATION_RATE_LIMITED'
  | 'ERR_SAVED_METHOD_DAILY_LIMIT'
  // Request origin
  | 'ERR_CROSS_ORIGIN_REQUEST'
  // Email, one code per reason (RN-PAG-11)
  | 'ERR_EMAIL_EMPTY'
  | 'ERR_EMAIL_HAS_SPACE'
  | 'ERR_EMAIL_NOT_ASCII'
  | 'ERR_EMAIL_TOO_LONG'
  | 'ERR_EMAIL_AT_SIGN'
  | 'ERR_EMAIL_LOCAL_PART'
  | 'ERR_EMAIL_DOMAIN'
  | 'ERR_EMAIL_TLD'
  // The user's WhatsApp number
  | 'ERR_WHATSAPP_EMPTY'
  | 'ERR_WHATSAPP_COUNTRY'
  | 'ERR_WHATSAPP_CHARS'
  | 'ERR_WHATSAPP_LENGTH'
  | 'ERR_WHATSAPP_INVALID'
  | 'ERR_WHATSAPP_NOT_MOBILE'
  | 'ERR_WHATSAPP_CONSENT'
  // Sending to WhatsApp
  | 'ERR_WHATSAPP_UNAVAILABLE'
  | 'ERR_WHATSAPP_NOT_REGISTERED'
  | 'ERR_WHATSAPP_SEND_LIMIT'
  | 'ERR_WHATSAPP_UNREACHABLE'
  | 'ERR_WHATSAPP_SEND_FAILED'
  // The purchase transaction
  | 'ERR_PURCHASE_NOT_RECORDED'
  // The gate (RN-ACC-01 and 02)
  | 'ERR_GATE_UNAVAILABLE'
  | 'ERR_GATE_PIN_INVALID'
  | 'ERR_GATE_RATE_LIMITED'
  | 'ERR_GATE_CLOSED'
  // Admission (RN-ACC-03 and 04)
  | 'ERR_TICKET_CODE_FORMAT'
  | 'ERR_TICKET_NOT_AUTHENTIC'
  | 'ERR_TICKET_NOT_FOUND'
  | 'ERR_TICKET_OTHER_VENUE'
  | 'ERR_TICKET_WRONG_DATE'
  | 'ERR_GATE_OUTSIDE_HOURS'
  | 'ERR_TICKET_ALREADY_USED'

export interface Result {
  readonly ok: boolean
  readonly code: ResultCode
  readonly message: string
}

/**
 * Canonical message catalog. It lives here rather than next to each validation
 * because the texts are test oracles: a second copy would let the UI and the
 * documentation drift apart.
 */
export const MESSAGES: Readonly<Record<ResultCode, string>> = {
  OK: '',
  ERR_USERNAME_EMPTY: 'El usuario es obligatorio',
  ERR_CURP_LENGTH: 'El usuario debe tener exactamente 20 caracteres',
  ERR_CURP_HAS_SPACE: 'El usuario no admite espacios',
  ERR_CURP_NOT_UPPERCASE: 'El usuario debe estar en mayúsculas',
  ERR_CURP_SPECIAL_CHAR: 'El usuario no admite caracteres especiales',
  ERR_CURP_FORMAT_INITIALS: 'Las primeras 4 posiciones deben ser letras',
  ERR_CURP_FORMAT_CONSONANTS: 'Las posiciones 14 a 16 deben ser letras',
  ERR_CURP_INVALID_DATE: 'La fecha de nacimiento no existe en el calendario',
  ERR_CURP_INVALID_SEX: 'La posición 11 debe ser H, M o X',
  ERR_CURP_INVALID_STATE: 'El código de entidad no es válido',
  ERR_CURP_CHECKSUM: 'El dígito verificador no corresponde',
  ERR_CURP_STATE_MISMATCH: 'Las letras finales no coinciden con la entidad de nacimiento',
  ERR_PASSWORD_EMPTY: 'La contraseña es obligatoria',
  ERR_PASSWORD_HAS_SPACE: 'La contraseña no admite espacios',
  ERR_PASSWORD_LENGTH: 'La contraseña debe tener exactamente 8 caracteres',
  ERR_PASSWORD_NO_UPPERCASE: 'La contraseña debe incluir al menos una mayúscula',
  ERR_PASSWORD_NO_LOWERCASE: 'La contraseña debe incluir al menos una minúscula',
  ERR_PASSWORD_NO_DIGIT: 'La contraseña debe incluir al menos un número',
  ERR_PASSWORD_NO_SPECIAL: 'La contraseña debe incluir al menos un carácter especial',
  ERR_CREDENTIALS_INVALID: 'Usuario o contraseña incorrectos',
  // Rule engine: the legacy console implementation's texts, with spelling restored.
  ERR_DATE_INVALID: 'La fecha no existe en el calendario',
  ERR_DATE_PAST: 'No es posible comprar para una fecha pasada',
  ERR_DAY_CLOSED: 'El recinto no opera ese día de la semana',
  ERR_DAY_HOLIDAY: 'El recinto permanece cerrado en esa fecha',
  ERR_OUTSIDE_HOURS: 'La hora solicitada está fuera del horario de servicio',
  ERR_QUANTITY_NOT_POSITIVE: 'La cantidad de boletos debe ser mayor que cero',
  ERR_EXCEEDS_USER_LIMIT: 'La cantidad excede el máximo permitido por usuario',
  ERR_EXCEEDS_AVAILABILITY: 'No hay suficientes boletos disponibles',
  ERR_INPUT_INVALID: 'Entrada inválida',
  // Purchase flow: the legacy console implementation's texts, with spelling restored
  // and without the trailing period.
  ERR_PLAY_INVALID: 'La obra seleccionada no existe',
  ERR_SECTION_INVALID: 'La sección seleccionada no existe',
  ERR_DATE_FORMAT: 'Formato inválido. Use DD/MM/AAAA (ejemplo: 25/12/2026)',
  ERR_TIME_FORMAT: 'Formato inválido. Use HH:MM (ejemplo: 19:30)',
  ERR_TIME_OUT_OF_RANGE: 'Hora fuera de rango. Horas 0-23, minutos 0-59',
  ERR_INTEGER_EXPECTED: 'Entrada inválida: se esperaba un número entero',
  // Cinema purchase: the legacy console implementation's texts, with spelling restored.
  ERR_FILM_INVALID: 'La película seleccionada no existe',
  ERR_FORMAT_UNAVAILABLE: 'El establecimiento no cuenta con ese tipo de servicio',
  ERR_SEAT_INVALID: 'El número de asiento está fuera del rango de la sala',
  ERR_SEAT_REPEATED: 'El asiento ya fue asignado en esta transacción',
  ERR_AGE_INSUFFICIENT: 'La edad no cumple la clasificación de la película',
  ERR_AGE_OUT_OF_RANGE: 'Edad fuera de rango. Debe estar entre 0 y 130',
  // Payment: the legacy console implementation's texts, with spelling restored. The
  // holder message differs: it names apostrophes and hyphens because the rule
  // accepts them.
  ERR_CARD_NOT_NUMERIC: 'El número de tarjeta debe contener solo dígitos',
  ERR_CARD_LENGTH: 'La longitud del número de tarjeta es incorrecta',
  ERR_CARD_BRAND_REJECTED: 'Solo se aceptan tarjetas Visa y Mastercard',
  ERR_CARD_LUHN: 'El número de tarjeta no supera la verificación Luhn',
  ERR_HOLDER_EMPTY: 'El nombre del titular no puede estar vacío',
  ERR_HOLDER_NOT_ALPHABETIC: 'El nombre solo admite letras, espacios, apóstrofos y guiones',
  ERR_EXPIRY_FORMAT: 'La fecha de expiración tiene formato inválido',
  ERR_CARD_EXPIRED: 'La tarjeta está vencida',
  ERR_SECURITY_CODE_INVALID: 'El código de seguridad debe tener 3 dígitos',
  // Profile photo. No trailing period. The «×» is U+00D7.
  ERR_PHOTO_TOO_LARGE: 'La foto no puede pesar más de 2 MB',
  ERR_PHOTO_FORMAT: 'La foto debe ser JPEG, PNG o WebP',
  ERR_PHOTO_TOO_SMALL: 'La foto debe medir al menos 128 \u00D7 128 píxeles',
  // Saved payment methods. No trailing period.
  ERR_SAVED_METHOD_DUPLICATE: 'Ya tienes guardado este método de pago',
  ERR_SAVED_METHODS_LIMIT: 'Ya tienes 3 métodos guardados. Elimina uno para agregar otro',
  ERR_SAVED_METHOD_UNAVAILABLE: 'El método guardado ya no está disponible',
  // Registration. No trailing period.
  ERR_NAME_EMPTY: 'El nombre es obligatorio',
  ERR_NAME_TOO_LONG: 'El nombre admite hasta 60 caracteres',
  ERR_NAME_INVALID_CHARS: 'El nombre solo admite letras, espacios, apóstrofos y guiones',
  ERR_PASSWORD_MISMATCH: 'Las contraseñas no coinciden',
  ERR_REGISTRATION_UNDERAGE: 'Debes tener al menos 18 años para registrarte',
  ERR_CURP_ALREADY_REGISTERED: 'Esta CURP ya está registrada. Inicia sesión con ella',
  // Account rules. It does not say how long to wait because the window is
  // configurable: the wait travels in `Retry-After` (RN-REG-07).
  ERR_REGISTRATION_RATE_LIMITED: 'Demasiados intentos de registro. Espera unos minutos e inténtalo de nuevo',
  // Pins the 5 in the text, as ERR_SAVED_METHODS_LIMIT pins the 3: RN-MET-10 is not
  // configurable.
  ERR_SAVED_METHOD_DAILY_LIMIT: 'Ya agregaste 5 métodos de pago hoy. Podrás agregar otro mañana',
  // Request origin (RN-SEG-03). PALCO never shows it: its own requests are
  // same-origin.
  ERR_CROSS_ORIGIN_REQUEST: 'La petición no proviene de PALCO',
  // Email, one code per rule of RN-PAG-11.
  ERR_EMAIL_EMPTY: 'El correo es obligatorio',
  ERR_EMAIL_HAS_SPACE: 'El correo no admite espacios',
  ERR_EMAIL_NOT_ASCII: 'El correo no admite acentos, la ñ ni otros caracteres fuera del alfabeto inglés',
  ERR_EMAIL_TOO_LONG: 'El correo admite hasta 254 caracteres',
  ERR_EMAIL_AT_SIGN: 'El correo debe tener exactamente un @',
  ERR_EMAIL_LOCAL_PART: 'Antes del @ van de 1 a 64 letras, números o símbolos permitidos, sin puntos al inicio, al final ni seguidos',
  ERR_EMAIL_DOMAIN: 'Después del @ van letras, números y guiones separados por puntos, sin puntos ni guiones en los extremos',
  ERR_EMAIL_TLD: 'El correo debe terminar en un dominio de 2 a 63 letras, como .com o .mx',
  // The user's WhatsApp number (RN-WSP-01 to 04).
  ERR_WHATSAPP_EMPTY: 'El número es obligatorio',
  ERR_WHATSAPP_COUNTRY: 'Elige un país de la lista',
  ERR_WHATSAPP_CHARS: 'El número solo admite dígitos, sin el código de país',
  ERR_WHATSAPP_LENGTH: 'La longitud del número no corresponde al país',
  ERR_WHATSAPP_INVALID: 'El número no existe en el país elegido',
  ERR_WHATSAPP_NOT_MOBILE: 'El número debe ser de un celular',
  ERR_WHATSAPP_CONSENT: 'Acepta recibir tus boletos por WhatsApp para guardar el número',
  // Sending to WhatsApp (RN-ENV-01 to 05).
  ERR_WHATSAPP_UNAVAILABLE: 'El envío por WhatsApp no está disponible en este momento. Puedes imprimir o compartir tus boletos',
  ERR_WHATSAPP_NOT_REGISTERED: 'Agrega tu WhatsApp para recibir tus boletos',
  ERR_WHATSAPP_SEND_LIMIT: 'Ya enviaste estos boletos 3 veces en la última hora. Podrás reenviarlos más tarde',
  ERR_WHATSAPP_UNREACHABLE: 'Este número aún no puede recibir mensajes de PALCO. Tu compra está confirmada',
  ERR_WHATSAPP_SEND_FAILED: 'No pudimos enviar tus boletos a WhatsApp',
  ERR_PURCHASE_NOT_RECORDED: 'No se pudo registrar la compra',
  // The gate.
  ERR_GATE_UNAVAILABLE: 'La taquilla no está configurada en este servidor',
  ERR_GATE_PIN_INVALID: 'La clave de taquilla es incorrecta',
  ERR_GATE_RATE_LIMITED: 'Demasiados intentos de clave. Espera unos minutos e inténtalo de nuevo',
  ERR_GATE_CLOSED: 'La taquilla se cerró. Vuelve a abrirla',
  // Admission.
  ERR_TICKET_CODE_FORMAT: 'El código no tiene el formato de un boleto de PALCO',
  ERR_TICKET_NOT_AUTHENTIC: 'El boleto no es auténtico',
  ERR_TICKET_NOT_FOUND: 'No hay ningún boleto con este código',
  ERR_TICKET_OTHER_VENUE: 'El boleto es de otro recinto',
  ERR_TICKET_WRONG_DATE: 'El boleto es para otra fecha',
  ERR_GATE_OUTSIDE_HOURS: 'El recinto está fuera de su horario',
  ERR_TICKET_ALREADY_USED: 'Este boleto ya se usó',
}

export const ok = (): Result => ({ ok: true, code: 'OK', message: '' })

export const err = (code: ResultCode, message: string = MESSAGES[code]): Result => ({
  ok: false,
  code,
  message,
})

/**
 * An input that produces a value or a rejection. The rejection carries the full
 * `Result` so the caller reports the same code as the rule.
 */
export type Checked<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly result: Result }

export const accept = <T>(value: T): Checked<T> => ({ ok: true, value })

export const reject = <T>(result: Result): Checked<T> => ({ ok: false, result })

import { describe, expect, it } from 'vitest'
import {
  TOKEN_EXPIRY_WARNING_SECONDS,
  checkExitCode,
  classifyPhoneCheck,
  classifyRecipientCheck,
  classifyTemplateCheck,
  classifyTokenCheck,
  metaErrorText,
  parseCheckArguments,
} from '../server/utils/whatsapp-check'

// The pre-flight send check. Each case carries its identifier in its name.

const NOW = 1_792_300_000
const DAY = 86_400
const SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management']
const token = (data: Record<string, unknown>): unknown => ({ data: { is_valid: true, scopes: SCOPES, expires_at: 0, ...data } })

const BODY = 'Tu compra {{1}} está confirmada. Te enviamos {{2}} para {{3}}, el {{4}}. Imprime cada página o muéstrala en la entrada; cada boleto admite un solo ingreso.'
const BODY_V2 = 'Hola {{1}}, tu compra {{2}} está confirmada. Te enviamos {{3}} para {{4}}, el {{5}}. Total pagado: {{6}}. Imprime cada página o muéstrala en la entrada; cada boleto admite un solo ingreso.'
const template = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'palco_boletos',
  language: 'es_MX',
  status: 'APPROVED',
  category: 'UTILITY',
  components: [
    { type: 'HEADER', format: 'DOCUMENT' },
    { type: 'BODY', text: BODY },
    { type: 'FOOTER', text: 'PALCO' },
  ],
  ...overrides,
})
const templates = (...data: Record<string, unknown>[]): unknown => ({ data })
const checkTemplate = (...data: Record<string, unknown>[]) => classifyTemplateCheck(200, templates(...data), 'palco_boletos', 'es_MX')
const MASK = '+52 ··· ··· 5678'

describe('revisión del token', () => {
  it('CK1: sin vencimiento, el de un usuario de sistema', () => {
    expect(classifyTokenCheck(200, token({}), NOW)).toEqual({ level: 'ok', message: 'Token: válido, sin vencimiento' })
  })

  it('CK2: aviso si vence en menos de 14 días; a los 14, bien', () => {
    expect(TOKEN_EXPIRY_WARNING_SECONDS).toBe(14 * DAY)
    expect(classifyTokenCheck(200, token({ expires_at: NOW + 13 * DAY }), NOW)).toMatchObject({
      level: 'warn',
      message: expect.stringContaining('en 13 días'),
    })
    expect(classifyTokenCheck(200, token({ expires_at: NOW + 14 * DAY - 1 }), NOW).level).toBe('warn')
    expect(classifyTokenCheck(200, token({ expires_at: NOW + 14 * DAY }), NOW).level).toBe('ok')
  })

  it('CK3: vencido, falla', () => {
    expect(classifyTokenCheck(200, token({ expires_at: NOW }), NOW)).toMatchObject({ level: 'fail', message: expect.stringContaining('venció') })
  })

  it('CK4: alterado, no válido o sin permisos, falla con el motivo', () => {
    expect(classifyTokenCheck(400, { error: { code: 190, message: 'Invalid OAuth access token' } }, NOW)).toEqual({
      level: 'fail',
      message: 'Token: no se pudo revisar (HTTP 400, código 190: Invalid OAuth access token)',
    })
    expect(classifyTokenCheck(200, token({ is_valid: false }), NOW).level).toBe('fail')
    expect(classifyTokenCheck(200, token({ scopes: ['whatsapp_business_messaging'] }), NOW)).toEqual({
      level: 'fail',
      message: 'Token: le faltan los permisos whatsapp_business_management',
    })
  })
})

describe('revisión de la plantilla', () => {
  const checkV2 = (body = BODY_V2) => classifyTemplateCheck(200, templates(template({
    name: 'palco_boletos_v2',
    components: [{ type: 'HEADER', format: 'DOCUMENT' }, { type: 'BODY', text: body }],
  })), 'palco_boletos_v2', 'es_MX')

  it('CK16: la v2 aprobada exige seis variables, y la original conserva cuatro', () => {
    expect(checkV2()).toEqual({ level: 'ok', message: 'Plantilla palco_boletos_v2 (es_MX): aprobada, de utilidad, con documento y 6 variables' })
    expect(checkV2(BODY)).toMatchObject({ level: 'fail', message: expect.stringContaining('tiene 4 variables y PALCO envía 6') })
    expect(checkTemplate(template({ components: [{ type: 'HEADER', format: 'DOCUMENT' }, { type: 'BODY', text: BODY_V2 }] })).level).toBe('fail')
  })

  it('CK17: seis variables con un índice cambiado no cumplen el contrato de Meta', () => {
    expect(checkV2(BODY_V2.replace('{{6}}', '{{7}}'))).toMatchObject({ level: 'fail', message: expect.stringContaining('sin saltos') })
    expect(checkV2(`${BODY_V2} {{1}}`).level).toBe('ok')
  })

  it('CK18: una plantilla aprobada sin constructor no pasa la revisión', () => {
    expect(classifyTemplateCheck(200, templates(template({ name: 'otra' })), 'otra', 'es_MX')).toMatchObject({ level: 'fail', message: expect.stringContaining('no tiene implementada') })
  })

  it('CK5: aprobada, de utilidad, con documento y cuatro variables', () => {
    expect(checkTemplate(template())).toEqual({
      level: 'ok',
      message: 'Plantilla palco_boletos (es_MX): aprobada, de utilidad, con documento y 4 variables',
    })
  })

  it('CK6: inexistente (al enviar, 132001)', () => {
    expect(classifyTemplateCheck(200, templates(), 'no_existe', 'es_MX')).toEqual({
      level: 'fail',
      message: 'Plantilla no_existe (es_MX): no existe',
    })
  })

  it('CK7: en revisión (al enviar, el mismo 132001)', () => {
    expect(checkTemplate(template({ status: 'PENDING' }))).toEqual({
      level: 'fail',
      message: 'Plantilla palco_boletos (es_MX): en revisión',
    })
  })

  it('CK8: rechazada, con rejected_reason (al enviar, el mismo 132001)', () => {
    expect(checkTemplate(template({ status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' }))).toEqual({
      level: 'fail',
      message: 'Plantilla palco_boletos (es_MX): rechazada, motivo INVALID_FORMAT',
    })
  })
})

describe('revisión del número de envío y del destino', () => {
  it('CK9: el número de envío en la Cloud API, con solo sus cuatro últimos dígitos; en otra plataforma o inexistente, falla', () => {
    const line = classifyPhoneCheck(200, { display_phone_number: '+1 555-012-3456', verified_name: 'Test Number', quality_rating: 'GREEN', platform_type: 'CLOUD_API' })
    expect(line).toEqual({ level: 'ok', message: 'Número de envío: terminado en 3456 «Test Number», calidad GREEN' })
    expect(line.message).not.toContain('555')
    expect(classifyPhoneCheck(200, { display_phone_number: '15550123456', platform_type: 'ON_PREMISE' }).level).toBe('fail')
    expect(classifyPhoneCheck(400, { error: { code: 100 } }).message).toContain('código 100')
  })

  it('CK10: el destino de --send-test, solo con la máscara: aceptado, fuera de la lista (131030) u otro error', () => {
    expect(classifyRecipientCheck(200, { messages: [{ id: 'wamid.X' }] }, MASK)).toEqual({
      level: 'ok',
      message: `Destino ${MASK}: Meta aceptó hello_world; confirma que llegó al teléfono`,
    })
    expect(classifyRecipientCheck(400, { error: { code: 131030 } }, MASK)).toEqual({
      level: 'fail',
      message: `Destino ${MASK}: no está en la lista de destinatarios permitidos del número de prueba (131030)`,
    })
    expect(classifyRecipientCheck(500, { error: { code: 1, message: 'An unknown error has occurred' } }, MASK).message).toBe(
      `Destino ${MASK}: no se pudo enviar (HTTP 500, código 1: An unknown error has occurred)`,
    )
  })
})

describe('casos de más', () => {
  it('CK11: nombre e idioma exactos; Meta filtra por nombre de forma aproximada', () => {
    expect(checkTemplate(template({ name: 'palco_boletos_v2' }), template({ language: 'es' }))).toEqual({
      level: 'fail',
      message: 'Plantilla palco_boletos (es_MX): no existe; existe en es',
    })
  })

  it('CK12: aprobada pero distinta de la que PALCO envía', () => {
    expect(checkTemplate(template({ category: 'MARKETING' })).message).toContain('MARKETING')
    expect(checkTemplate(template({ components: [{ type: 'HEADER', format: 'TEXT' }, { type: 'BODY', text: BODY }] })).message).toContain('no es DOCUMENT')
    expect(checkTemplate(template({ components: [{ type: 'HEADER', format: 'DOCUMENT' }, { type: 'BODY', text: 'Folio {{1}} y {{1}}' }] })).message).toContain(
      'tiene 1 variables y PALCO envía 4',
    )
  })

  it('CK13: argumentos; sin --send-test no se envía nada; cualquier otro, rechazado', () => {
    expect(parseCheckArguments([])).toEqual({ ok: true, sendTest: null })
    expect(parseCheckArguments(['--send-test', 'RIVA030315MJCSLNA2JC'])).toEqual({ ok: true, sendTest: 'RIVA030315MJCSLNA2JC' })
    for (const argv of [['--send-test'], ['--send-test', '--x'], ['--to=+523312345678'], ['--send-test', 'A', 'B']]) {
      expect(parseCheckArguments(argv).ok).toBe(false)
    }
  })

  it('CK14: una falla da salida 1; un aviso no la cambia', () => {
    expect(checkExitCode([{ level: 'ok', message: '' }, { level: 'warn', message: '' }])).toBe(0)
    expect(checkExitCode([{ level: 'ok', message: '' }, { level: 'fail', message: '' }])).toBe(1)
    expect(metaErrorText(0, null)).toBe('sin respuesta de Meta')
    expect(metaErrorText(502, null)).toBe('HTTP 502')
  })

  it('CK15: Meta repite el token en el error; nunca se escribe', () => {
    const fake = `EAA${'Zk9x'.repeat(40)}`
    const body = { error: { code: 190, message: `Malformed access token ${fake}` } }
    expect(metaErrorText(401, body)).toBe('HTTP 401, código 190: Malformed access token [token oculto]')
    expect(classifyTokenCheck(401, body, NOW).message).not.toContain('EAA')
    expect(metaErrorText(400, { error: { code: 100, message: `Invalid value ${'a1B2'.repeat(12)}` } })).toBe(
      'HTTP 400, código 100: Invalid value [token oculto]',
    )
  })
})

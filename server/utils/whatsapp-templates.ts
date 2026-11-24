/** Contracts of the approved templates; shared by the send and its check in Node. */
const TEMPLATE_VARIABLES = {
  palco_boletos: [1, 2, 3, 4],
  palco_boletos_v2: [1, 2, 3, 4, 5, 6],
} as const

export type TicketTemplateName = keyof typeof TEMPLATE_VARIABLES

export function isTicketTemplateName(name: string): name is TicketTemplateName {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_VARIABLES, name)
}

export function ticketTemplateVariables(name: string): readonly number[] | null {
  return isTicketTemplateName(name) ? TEMPLATE_VARIABLES[name] : null
}

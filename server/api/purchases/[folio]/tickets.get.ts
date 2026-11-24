/**
 * The PDF of one of the user's purchases, one page per ticket (RF-ENV-01). A
 * malformed, missing or foreign folio gives the same 404 (RN-ENV-05, RN-CON-06).
 * Each QR is a bearer credential: the response is never cached.
 */
export default defineEventHandler(async (event): Promise<Buffer> => {
  const session = await usePalcoSession(event)
  const userId = session.data.userId
  if (typeof userId !== 'number') {
    throw createError({ statusCode: 401, message: 'Sesión requerida' })
  }

  const built = await buildPurchasePdf(userId, getRouterParam(event, 'folio') ?? '', new Date())
  if (!built.ok) throw createError({ statusCode: built.statusCode, message: built.message })

  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="PALCO-${built.purchase.folio}.pdf"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  return built.pdf
})

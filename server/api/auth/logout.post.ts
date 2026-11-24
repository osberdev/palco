export default defineEventHandler(async (event) => {
  const session = await usePalcoSession(event)
  await session.clear()

  return { ok: true as const }
})

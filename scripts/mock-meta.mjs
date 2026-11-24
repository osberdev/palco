#!/usr/bin/env node
// A local server that imitates Meta's WhatsApp Business platform, to show the send
// states without Meta and without spending real sends. It is independent: the
// application neither imports it nor has a "fake mode". Use it by starting the
// application with NUXT_WHATSAPP_API_BASE=http://127.0.0.1:{port}.
//
//   node scripts/mock-meta.mjs <scenario> [--port 3901]
//
// Scenarios: ok, unreachable, permanent, transient-then-ok, slow. The logic lives
// in mock-meta-server.ts, which the integration tests also use. It writes one line
// per request with the method, the path and the status; never the token, the
// recipient number or the PDF.

import { MOCK_META_SCENARIOS, createMockMetaServer, formatRequestLine, isMockMetaScenario } from './mock-meta-server.ts'

const scenario = process.argv[2] ?? ''
const portFlag = process.argv.indexOf('--port')
const port = portFlag === -1 ? 3901 : Number(process.argv[portFlag + 1])

if (!isMockMetaScenario(scenario) || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Uso: node scripts/mock-meta.mjs <escenario> [--port 3901]')
  for (const [name, description] of Object.entries(MOCK_META_SCENARIOS)) console.error(`  ${name.padEnd(18)} ${description}`)
  process.exit(2)
}

const server = createMockMetaServer({
  scenario,
  onRequest: (entry) => console.info(formatRequestLine(entry, new Date())),
})

server.listen(port, '127.0.0.1', () => {
  const { port: listening } = server.address()
  console.info(`Meta simulado · escenario ${scenario}: ${MOCK_META_SCENARIOS[scenario]}`)
  console.info(`Escuchando en http://127.0.0.1:${listening}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))

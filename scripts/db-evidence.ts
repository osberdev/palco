import { describeVenueProblems } from '../server/db/venue-rows.ts'
import { loadVenues } from '../server/db/venues.repository.ts'
import { connectWith, describeTarget } from './db-connection.ts'
import { evidenceExitCode, evidenceReport } from './evidence-report.ts'

/**
 * `bun run db:evidence`: prints the database verification report, connected as
 * `palco_lector`, which can neither write nor read the WhatsApp number. Exits with
 * 1 if any consistency check fails, so it also works as a pre-flight check.
 */

const database = await connectWith('NUXT_DATABASE_READER_URL', { requireSchema: true })
try {
  // The venues, from the database, as the server reads them.
  const venues = await loadVenues(database)
  if (!venues.ok) {
    console.error(`Los recintos de la base no son válidos:\n${describeVenueProblems(venues.problems)}`)
    process.exit(1)
  }
  const report = await evidenceReport(database, venues.venues, process.env.NUXT_AVAILABILITY_OVERRIDES ?? '')
  console.info(`Base: ${describeTarget('NUXT_DATABASE_READER_URL')}`)
  console.info(report.text)
  process.exitCode = evidenceExitCode(report)
}
finally {
  await database.close()
}

import { connectWith } from './db-connection.ts'

// Dropping the schema resets the sales, and also takes what the users saved. The
// database itself is not dropped: that would fail with the server connected, and it
// is not needed. `schema.sql` grants the privileges on the new schema again.
const database = await connectWith('NUXT_DATABASE_ADMIN_URL')
await database.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
await database.close()

console.info('Base de datos reiniciada: compras, boletos, usuarios registrados, fotos, métodos de pago y el WhatsApp registrado. Recreando…')

await import('./db-seed.ts')

console.info('Sin compras. Para las de demostración, bun run db:seed:demo.')
console.info('Conviene detener el servidor antes de un reinicio: los folios vuelven a 1, y la bandeja de envíos sigue en memoria, así que un envío anterior con el mismo folio contaría para el límite. También conserva la disponibilidad de la base anterior.')

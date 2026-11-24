import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteWhatsapp, findWhatsapp, saveWhatsapp } from '../server/db/whatsapp.repository'
import { createTestDatabase, resetTestDatabase, type TestDatabase } from './support/database'

// The WhatsApp number in the database, on PGlite with the current schema. Each case
// carries its identifier in its name.

let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
})

beforeEach(() => resetTestDatabase(database))

afterAll(() => database.close())

describe('WhatsApp en la base', () => {
  it('WS1: guardar, leer, reemplazar y borrar', async () => {
    expect(await findWhatsapp(1, database)).toBeNull()
    await saveWhatsapp(1, '+523312345678', database)
    expect(await findWhatsapp(1, database)).toMatchObject({ e164: '+523312345678', verified: false })
    await saveWhatsapp(1, '+34612345678', database)
    expect((await findWhatsapp(1, database))?.e164).toBe('+34612345678')
    expect(await findWhatsapp(2, database)).toBeNull()
    await deleteWhatsapp(1, database)
    expect(await findWhatsapp(1, database)).toBeNull()
    await deleteWhatsapp(1, database)
  })

  it('WS2: reemplazar deja verified en falso y la fecha del consentimiento nueva', async () => {
    await saveWhatsapp(1, '+523312345678', database)
    await database.asOwner(() => database.query("UPDATE whatsapp_numbers SET verified = true, consented_at = '2026-01-01 00:00:00+00' WHERE user_id = 1"))
    const old = (await database.query<{ consented_at: string }>('SELECT consented_at FROM whatsapp_numbers WHERE user_id = 1')).rows[0]!.consented_at
    await saveWhatsapp(1, '+34612345678', database)
    const row = (await database.query<{ verified: boolean, consented_at: string }>('SELECT verified, consented_at FROM whatsapp_numbers WHERE user_id = 1')).rows[0]!
    expect(row.verified).toBe(false)
    expect(row.consented_at).not.toBe(old)
  })

  it('WS3: borrar al usuario borra su número', async () => {
    await saveWhatsapp(1, '+523312345678', database)
    await database.asOwner(() => database.query('DELETE FROM users WHERE id = 1'))
    expect((await database.query('SELECT count(*) AS n FROM whatsapp_numbers')).rows[0]).toEqual({ n: 0 })
  })

  it('WS4: el CHECK exige E.164', async () => {
    await expect(saveWhatsapp(1, '523312345678', database)).rejects.toMatchObject({ code: '23514' })
    await expect(saveWhatsapp(1, '+52331234567a', database)).rejects.toMatchObject({ code: '23514' })
    await expect(saveWhatsapp(1, '+0523312345678', database)).rejects.toMatchObject({ code: '23514' })
    expect(await findWhatsapp(1, database)).toBeNull()
  })
})

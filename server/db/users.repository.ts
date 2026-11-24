import { randomUUID } from 'node:crypto'
import type { PhotoFormat } from '../domain/photo'
import type { SessionUser } from '../../types'
import { getDatabase } from './client.ts'

interface UserRow {
  readonly id: number
  readonly username: string
  readonly password_hash: string
  readonly display_name: string
  readonly photo_version: string | null
}

export interface ProfilePhotoRow {
  readonly format: PhotoFormat
  readonly data: Buffer
  readonly version: string
}

// The photo version travels with the user: the top bar needs it on every screen
// to request `/api/profile/photo?v=…` without a separate query.
const USER_COLUMNS = `
  SELECT u.id, u.username, u.password_hash, u.display_name, p.version AS photo_version
  FROM users u
  LEFT JOIN profile_photos p ON p.user_id = u.id`

const toSessionUser = (row: UserRow): SessionUser => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  photoVersion: row.photo_version,
})

/** The full row, hash included. Only credential verification uses it. */
export async function findUserRowByUsername(username: string): Promise<UserRow | null> {
  const { rows } = await getDatabase().query<UserRow>(`${USER_COLUMNS} WHERE u.username = $1`, [username])
  return rows[0] ?? null
}

export async function findSessionUserById(id: number): Promise<SessionUser | null> {
  const { rows } = await getDatabase().query<UserRow>(`${USER_COLUMNS} WHERE u.id = $1`, [id])
  return rows[0] ? toSessionUser(rows[0]) : null
}

export function toPublicUser(row: UserRow): SessionUser {
  return toSessionUser(row)
}

/**
 * Inserts a registered user with an optional email: `null` without one, or the one
 * the domain already normalized. Returns it as a `SessionUser`, which carries no
 * email; null if the CURP already exists. Two concurrent registrations both pass
 * the endpoint's pre-check: the database `UNIQUE` decides, and the 23505 is caught
 * here, outside any transaction, so the second one gets the same rejection as a
 * duplicate and never a 500 (RN-REG-02).
 */
export async function insertRegisteredUser(
  username: string,
  passwordHash: string,
  displayName: string,
  email: string | null,
): Promise<SessionUser | null> {
  try {
    const { rows } = await getDatabase().query<{ readonly id: number }>(
      'INSERT INTO users (username, password_hash, display_name, email) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, passwordHash, displayName, email],
    )
    return await findSessionUserById(rows[0]!.id)
  }
  catch (error) {
    if (isUniqueViolation(error)) return null
    throw error
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === '23505'
    && 'constraint' in error && error.constraint === 'users_username_key'
}

export async function findProfilePhoto(userId: number): Promise<ProfilePhotoRow | null> {
  const { rows } = await getDatabase().query<ProfilePhotoRow>('SELECT format, data, version FROM profile_photos WHERE user_id = $1', [userId])
  const row = rows[0]
  // `pg` returns a `Buffer` and PGlite a `Uint8Array`.
  return row ? { format: row.format, data: Buffer.from(row.data), version: row.version } : null
}

/**
 * Saves or replaces the photo and returns the new version. The version is a
 * random token, not a counter: removing the photo and uploading another would
 * reset a counter, and the browser cache would serve the old one under the same URL.
 */
export async function saveProfilePhoto(userId: number, format: PhotoFormat, data: Uint8Array): Promise<string> {
  const version = randomUUID()
  await getDatabase().query(
    `INSERT INTO profile_photos (user_id, format, data, version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       format     = excluded.format,
       data       = excluded.data,
       version    = excluded.version,
       updated_at = now()`,
    [userId, format, Buffer.from(data.buffer, data.byteOffset, data.byteLength), version],
  )
  return version
}

/** Idempotent: without a photo there is nothing to delete, and that is not an error. */
export async function deleteProfilePhoto(userId: number): Promise<void> {
  await getDatabase().query('DELETE FROM profile_photos WHERE user_id = $1', [userId])
}

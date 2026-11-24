import bcrypt from 'bcrypt'
import { findUserRowByUsername, toPublicUser } from '../../db/users.repository'
import { validatePassword } from '../../domain/credentials'
import { validateUsername } from '../../domain/curp'
import { MESSAGES } from '../../domain/result'
import type { LoginResponse } from '../../../types'

interface LoginBody {
  username?: unknown
  password?: unknown
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

export default defineEventHandler(async (event): Promise<LoginResponse> => {
  // A POST without a body gives `undefined`, and answers with the empty-username rule.
  const body = await readBody<LoginBody | undefined>(event)
  const username = asString(body?.username)
  const password = asString(body?.password)

  // The format is validated again here even if the client already did: client-side
  // validation is feedback, this one is authoritative.
  const usernameResult = validateUsername(username)
  if (!usernameResult.ok) {
    setResponseStatus(event, 400)
    return { ok: false, code: usernameResult.code, message: usernameResult.message }
  }

  const passwordResult = validatePassword(password)
  if (!passwordResult.ok) {
    setResponseStatus(event, 400)
    return { ok: false, code: passwordResult.code, message: passwordResult.message }
  }

  const row = await findUserRowByUsername(username)

  // When the user does not exist, compare against a throwaway hash so the response
  // time does not reveal which usernames are registered.
  const storedHash = row?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
  const passwordMatches = await bcrypt.compare(password, storedHash)

  if (row === null || !passwordMatches) {
    setResponseStatus(event, 401)
    return {
      ok: false,
      code: 'ERR_CREDENTIALS_INVALID',
      message: MESSAGES.ERR_CREDENTIALS_INVALID,
    }
  }

  const session = await usePalcoSession(event)
  await session.update({ userId: row.id })

  return { ok: true, user: toPublicUser(row) }
})

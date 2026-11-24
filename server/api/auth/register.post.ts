import bcrypt from 'bcrypt'
import {
  registrationAttemptsFrom,
  registrationPolicy,
  storeRegistrationAttempts,
} from '../../data/registration-attempts'
import { findUserRowByUsername, insertRegisteredUser } from '../../db/users.repository'
import { evaluateRateLimit } from '../../domain/rate-limit'
import { evaluateRegistration, type RegistrationField } from '../../domain/registration'
import { err, type Result } from '../../domain/result'
import { parseRegistrationBody } from '../../utils/registration-request'
import { toCalendarDate } from '../../../utils/date'
import type { RegisterResponse } from '../../../types'

const BCRYPT_COST = 10

const failure = (field: RegistrationField | null, result: Result): RegisterResponse =>
  ({ ok: false, field, code: result.code, message: result.message })

/**
 * Registration (RN-REG-01 to 06). Fixed order, the first one that applies wins:
 * attempt limit per IP (RN-REG-07), body shape, rules with the server clock (the
 * authoritative one, as in RN-CON-01), hash, uniqueness and insertion, and session.
 * It does not require being signed out: a successful registration replaces any
 * existing session, like a login.
 */
export default defineEventHandler(async (event): Promise<RegisterResponse> => {
  // Step 0, before reading the body: every attempt counts, because each one costs a
  // request and those that reach the hash cost a bcrypt at cost 10. The IP is the
  // socket's: with `xForwardedFor`, a header would choose the IP and bypass the
  // limit. There is no `await` between reading and storing the attempts, so two
  // simultaneous requests cannot both pass as the last allowed one.
  const ip = getRequestIP(event) ?? 'unknown'
  const now = Date.now()
  const decision = evaluateRateLimit(registrationAttemptsFrom(ip), now, registrationPolicy())
  if (!decision.ok) {
    // An attempt rejected by the limit is not recorded: if it counted, someone
    // retrying non-stop would never leave the window.
    storeRegistrationAttempts(ip, decision.kept)
    // An invalid policy fails closed, without `Retry-After`. It is unreachable: the
    // plugin only stores policies the parser accepted.
    if (decision.result.code === 'ERR_REGISTRATION_RATE_LIMITED') {
      setResponseHeader(event, 'Retry-After', Math.ceil(decision.retryAfterMs / 1000))
    }
    setResponseStatus(event, 429)
    return failure(null, decision.result)
  }
  storeRegistrationAttempts(ip, [...decision.kept, now])

  const input = parseRegistrationBody(await readJsonBody(event))
  if (input === null) {
    setResponseStatus(event, 400)
    return failure(null, err('ERR_INPUT_INVALID'))
  }

  const decided = evaluateRegistration(input, toCalendarDate(new Date()))
  if (!decided.ok) {
    setResponseStatus(event, 400)
    return failure(decided.field, decided.result)
  }

  const { username, displayName, email, password } = decided.registration
  // The earlier lookup only saves an insert: two simultaneous registrations of the
  // same CURP both pass it, and the database `UNIQUE` decides (RN-REG-02). See
  // `insertRegisteredUser`.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

  const user = await findUserRowByUsername(username) === null
    ? await insertRegisteredUser(username, passwordHash, displayName, email)
    : null
  if (user === null) {
    setResponseStatus(event, 400)
    return failure(null, err('ERR_CURP_ALREADY_REGISTERED'))
  }

  // RN-REG-05: registering starts the session.
  const session = await usePalcoSession(event)
  await session.update({ userId: user.id })

  setResponseStatus(event, 201)
  return { ok: true, user }
})

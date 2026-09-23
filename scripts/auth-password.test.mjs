import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../modules/users/domain/password.ts'

test('password hashes use fresh salts and reject wrong credentials', async () => {
  const first = await hashPassword('a sufficiently long secret')
  const second = await hashPassword('a sufficiently long secret')
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('a sufficiently long secret', first), true)
  assert.equal(await verifyPassword('different secret', first), false)
  assert.equal(await verifyPassword('a sufficiently long secret', 'invalid'), false)
})

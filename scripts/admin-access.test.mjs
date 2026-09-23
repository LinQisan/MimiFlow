import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../modules/users/server/current-user.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText

function loadCurrentUser(user) {
  const exports = {}
  const stubs = {
    'server-only': {},
    react: { cache: callback => callback },
    'next/navigation': { redirect: () => { throw new Error('redirected to login') } },
    './auth': { getSessionUser: async () => user },
  }
  new Function('require', 'exports', compiled)(id => stubs[id], exports)
  return exports
}

test('management permission uses the session role, not a user supplied ID or email', async () => {
  const member = loadCurrentUser({ id: 'default', name: '旧用户', isAdmin: false })
  await assert.rejects(member.requireAdmin(), /没有管理权限/)
  assert.equal(await member.getCurrentUserId(), 'default')

  const admin = loadCurrentUser({ id: 'other-id', name: '管理员', isAdmin: true })
  assert.equal((await admin.requireAdmin()).id, 'other-id')
})

test('missing session cannot enter management functions', async () => {
  await assert.rejects(loadCurrentUser(null).requireAdmin(), /redirected to login/)
})

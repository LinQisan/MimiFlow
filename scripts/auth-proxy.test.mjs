import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText

const loadProxy = (authenticated, isAdmin = false) => {
  const exports = {}
  const stubs = {
    'next/server': { NextResponse: {
      next: () => ({ kind: 'next' }),
      redirect: url => ({ kind: 'redirect', url: url.pathname }),
      json: (_body, init) => ({ kind: 'json', status: init.status }),
    } },
    '@/modules/users/server/auth': {
      SESSION_COOKIE: 'mimiflow_session',
      readSessionUser: async token => token === 'valid-token' && authenticated ? { id: 'user-a', isAdmin } : null,
    },
  }
  new Function('require', 'exports', compiled)(id => stubs[id], exports)
  return exports.proxy
}

const request = (pathname, method = 'GET', token, nextAction = false) => ({
  nextUrl: { pathname }, url: `https://mimiflow.example${pathname}`, method,
  cookies: { get: name => name === 'mimiflow_session' && token ? { value: token } : null },
  headers: { has: name => name === 'next-action' && nextAction },
})

test('old user ID cookies and unauthenticated mutations cannot reach app routes', async () => {
  const proxy = loadProxy(false)
  assert.deepEqual(await proxy(request('/vocabulary')), { kind: 'redirect', url: '/login' })
  assert.deepEqual(await proxy(request('/api/practice/vocabulary-preferences', 'POST')), { kind: 'json', status: 401 })
  assert.deepEqual(await proxy(request('/vocabulary', 'POST', 'user-id-only')), { kind: 'json', status: 401 })
  assert.deepEqual(await proxy(request('/login')), { kind: 'next' })
  assert.equal((await proxy(request('/login', 'POST'))).status, 405)
})

test('valid sessions enter app and public login rejects arbitrary server actions', async () => {
  const proxy = loadProxy(true)
  assert.deepEqual(await proxy(request('/review', 'GET', 'valid-token')), { kind: 'next' })
  assert.deepEqual(await proxy(request('/login', 'GET', 'valid-token')), { kind: 'redirect', url: '/' })
  assert.deepEqual(await proxy(request('/api/auth/login', 'POST')), { kind: 'next' })
  assert.deepEqual(await proxy(request('/api/auth/request-reset', 'POST')), { kind: 'next' })
  assert.deepEqual(await proxy(request('/register', 'GET', 'valid-token')), { kind: 'redirect', url: '/' })
  assert.deepEqual(await proxy(request('/verify-email', 'GET', 'valid-token')), { kind: 'next' })
  assert.equal((await proxy(request('/api/auth/login', 'POST', undefined, true))).status, 405)
})

test('only admins can enter management pages and APIs', async () => {
  const member = loadProxy(true)
  assert.deepEqual(await member(request('/manage', 'GET', 'valid-token')), { kind: 'redirect', url: '/' })
  assert.deepEqual(await member(request('/manage/listening', 'POST', 'valid-token')), { kind: 'json', status: 403 })
  assert.deepEqual(await member(request('/api/manage/vocabulary/csv', 'GET', 'valid-token')), { kind: 'json', status: 403 })
  assert.deepEqual(await member(request('/review', 'GET', 'valid-token')), { kind: 'next' })

  const admin = loadProxy(true, true)
  assert.deepEqual(await admin(request('/manage', 'GET', 'valid-token')), { kind: 'next' })
  assert.deepEqual(await admin(request('/api/manage/vocabulary/csv', 'GET', 'valid-token')), { kind: 'next' })
})

test('self-registration is denied by default before touching user data', async () => {
  const source = await readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  let created = false
  const exports = {}
  new Function('require', 'exports', compiled)(id => ({
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
    '@/modules/users/server/auth': {},
    '@/modules/users/server/credentials': { registerAccount: async () => { created = true } },
    '@/modules/users/domain/registration': { registrationMode: () => 'disabled' },
    '@/modules/users/server/rate-limit': { allowAuthRequest: async () => true },
  })[id], exports)
  const result = await exports.POST({ json: async () => ({}) })
  assert.equal(result.status, 403)
  assert.equal(created, false)
})

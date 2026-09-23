import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient, SourceType } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
import pg from 'pg'
import { chromium } from 'playwright-core'

import { hashPassword } from '../../modules/users/domain/password.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true })

const runId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
const artifactDir = path.join(root, 'outputs', 'e2e', runId)
const manifest = {
  scenario: 'two-account memory review through the browser',
  command: 'npm test',
  runId,
  startedAt: new Date().toISOString(),
  status: 'failed',
  checks: [],
}

function command(commandName, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', code => code === 0
      ? resolve()
      : reject(new Error(`${commandName} ${args.join(' ')} exited with ${code}`)))
  })
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${child.exitCode ?? child.signalCode})`)
    }
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: 'manual', signal: AbortSignal.timeout(2_000) })
      if (response.status === 200) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('Next.js did not become ready within 90 seconds')
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const stopped = new Promise(resolve => child.once('close', resolve))
  child.kill('SIGTERM')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000)
  try { await stopped } finally { clearTimeout(timeout) }
}

async function browserPath() {
  const candidates = [
    process.env.E2E_BROWSER_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await stat(candidate)
      return candidate
    } catch {}
  }
  throw new Error('Chrome/Chromium is required; set E2E_BROWSER_PATH to its executable')
}

async function seedUser(db, label, email, passwordHash) {
  const user = await db.user.create({
    data: {
      name: `e2e-${label}-${runId.slice(-6)}`,
      credential: { create: { email, passwordHash, emailVerifiedAt: new Date() } },
    },
  })
  const word = label === 'A' ? '記憶A専用' : '記憶B専用'
  const vocabulary = await db.vocabulary.create({
    data: {
      userId: user.id,
      word,
      normalizedWord: word,
      sourceType: SourceType.QUIZ_QUESTION,
      sourceId: `e2e-${label}`,
    },
  })
  await db.vocabularyReview.create({
    data: { userId: user.id, vocabularyId: vocabulary.id, due: new Date(Date.now() - 60_000) },
  })
  return { id: user.id, label, email, word, vocabularyId: vocabulary.id }
}

async function login(page, account, password) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '邮箱' }).fill(account.email)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await page.getByLabel(new RegExp(`^当前用户：e2e-${account.label}-`)).waitFor()
}

async function run() {
  await mkdir(artifactDir, { recursive: true })
  const configuredUrl = process.env.DATABASE_URL
  assert.ok(configuredUrl, 'DATABASE_URL is required')
  const developmentUrl = new URL(configuredUrl)
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(developmentUrl.hostname), 'E2E database setup requires local PostgreSQL')
  const databaseName = `mimiflow_e2e_${process.pid}_${randomBytes(4).toString('hex')}`
  assert.notEqual(databaseName, decodeURIComponent(developmentUrl.pathname.slice(1)))

  const adminUrl = new URL(developmentUrl)
  adminUrl.pathname = '/postgres'
  adminUrl.searchParams.delete('schema')
  const testUrl = new URL(developmentUrl)
  testUrl.pathname = `/${databaseName}`
  testUrl.searchParams.delete('schema')
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), NEXT_TELEMETRY_DISABLED: '1' }
  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  let databaseCreated = false
  let db
  let server
  let browser
  let page
  let failure

  try {
    await admin.connect()
    await admin.query(`CREATE DATABASE "${databaseName}"`)
    databaseCreated = true
    const setup = new pg.Client({ connectionString: testUrl.toString() })
    try {
      await setup.connect()
      await setup.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    } finally {
      await setup.end().catch(() => {})
    }
    await command('npm', ['run', 'db:push'], env)
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl.toString() }) })

    const password = `E2e-${randomBytes(18).toString('base64url')}`
    const passwordHash = await hashPassword(password)
    const suffix = runId.slice(-6)
    const accountA = await seedUser(db, 'A', `e2e-a-${suffix}@example.test`, passwordHash)
    const accountB = await seedUser(db, 'B', `e2e-b-${suffix}@example.test`, passwordHash)

    await command('npm', ['run', 'build'], env)
    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: root, env, stdio: 'inherit',
    })
    await waitForServer(baseUrl, server)
    browser = await chromium.launch({ executablePath: await browserPath(), headless: true })
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1280, height: 900 } })
    page = await context.newPage()

    await page.goto('/review/memory')
    await page.waitForURL(/\/login(?:\?.*)?$/)
    manifest.checks.push('Unauthenticated review redirects to login')

    await login(page, accountA, password)
    await page.goto('/review/memory')
    await page.getByRole('heading', { name: accountA.word }).waitFor()
    await page.getByText('到期 1 条').waitFor()
    assert.equal(await page.getByRole('heading', { name: accountB.word }).count(), 0)
    manifest.checks.push('Account A sees only its own due vocabulary')

    await page.getByRole('button', { name: '显示答案并评分' }).click()
    await page.getByRole('button', { name: '记得' }).click()
    await page.getByRole('heading', { name: '今日记忆复习已完成' }).waitFor()
    const ratedA = await db.vocabularyReview.findUniqueOrThrow({ where: { userId_vocabularyId: { userId: accountA.id, vocabularyId: accountA.vocabularyId } } })
    assert.equal(ratedA.reps, 1)
    assert.equal(await db.reviewEvent.count({ where: { profileId: accountA.id } }), 1)
    manifest.checks.push('Browser rating persisted one review and one event for account A')

    await page.goto('/review')
    await page.getByText('单词 0 · 句子 0').waitFor()
    await page.getByLabel(/^当前用户：e2e-A-/).click()
    await page.getByRole('button', { name: '退出登录' }).click()
    await page.getByRole('heading', { name: '登录' }).waitFor()
    await page.goto('/review/memory')
    await page.waitForURL(/\/login(?:\?.*)?$/)
    manifest.checks.push('Logout invalidates access to the protected review page')

    await login(page, accountB, password)
    await page.goto('/review/memory')
    await page.getByRole('heading', { name: accountB.word }).waitFor()
    assert.equal(await page.getByRole('heading', { name: accountA.word }).count(), 0)
    assert.equal(await db.reviewEvent.count({ where: { profileId: accountB.id } }), 0)
    const unratedB = await db.vocabularyReview.findUniqueOrThrow({ where: { userId_vocabularyId: { userId: accountB.id, vocabularyId: accountB.vocabularyId } } })
    assert.equal(unratedB.reps, 0)
    manifest.checks.push('Account B still sees its own unrated card and no account A data')

    await page.screenshot({ path: path.join(artifactDir, 'account-b-review.png'), fullPage: true })
    manifest.status = 'passed'
    manifest.screenshot = 'account-b-review.png'
    manifest.gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch (error) {
    failure = error
    manifest.error = error instanceof Error ? error.message : String(error)
    if (page) {
      await page.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {})
      manifest.failureScreenshot = 'failure.png'
    }
  } finally {
    await browser?.close().catch(error => { failure ||= error })
    await stopServer(server).catch(error => { failure ||= error })
    await db?.$disconnect().catch(error => { failure ||= error })
    if (databaseCreated) {
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`).catch(error => { failure ||= error })
    }
    await admin.end().catch(() => {})
    if (failure) {
      manifest.status = 'failed'
      manifest.error ||= failure instanceof Error ? failure.message : String(failure)
    }
    manifest.finishedAt = new Date().toISOString()
    await writeFile(path.join(artifactDir, 'result.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  if (failure) throw failure
  console.log(`E2E passed. Artifact: ${path.join(artifactDir, 'result.json')}`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})

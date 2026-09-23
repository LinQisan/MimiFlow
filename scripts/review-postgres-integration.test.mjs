import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import ts from 'typescript'
import { PrismaClient, MaterialType, SourceType, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Rating, checkParameters, createEmptyCard, default_w, fsrs } from 'ts-fsrs'
import { buildAudioDialogueSourceId, parseAudioDialogueSourceId } from '../utils/audioDialogue/sourceId.ts'
import { hashPassword, verifyPassword } from '../modules/users/domain/password.ts'
import { formatTokyoDateKey } from '../utils/time/format.ts'
import { hashSecret, newSecret, validSecret } from '../modules/users/domain/registration.ts'
import { wordbookEntryWhere } from '../modules/knowledge/wordbooks/entry-query.ts'
import { vocabularyGroupPageSql } from '../modules/knowledge/vocabulary/server/group-page-query.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function runDbPush(databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'db:push'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`isolated db:push failed (${code}): ${output}`)))
  })
}

function readBarrier(expected) {
  let seen = 0
  let release
  const ready = new Promise(resolve => { release = resolve })
  return async row => {
    if (++seen === expected) release()
    await ready
    return row
  }
}

async function loadActions(db, userId, intercept = {}) {
  const source = await readFile(path.join(root, 'modules/review/actions/memory.ts'), 'utf8')
  const domainSource = await readFile(path.join(root, 'modules/review/domain/fsrs-card.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const compiledDomain = ts.transpileModule(domainSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const domainExports = {}
  new Function('require', 'exports', compiledDomain)(require, domainExports)
  const sentenceReview = intercept.sentenceRead
    ? new Proxy(db.sentenceReview, { get(target, key) {
      if (key === 'findFirst') return async args => intercept.sentenceRead(await target.findFirst(args))
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    } })
    : db.sentenceReview
  const vocabularyReview = intercept.vocabularyRead
    ? new Proxy(db.vocabularyReview, { get(target, key) {
      if (key === 'findUnique') return async args => intercept.vocabularyRead(await target.findUnique(args))
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    } })
    : db.vocabularyReview
  const actionDb = new Proxy(db, {
    get(target, key) {
      if (key === 'sentenceReview') return sentenceReview
      if (key === 'vocabularyReview') return vocabularyReview
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const stubs = {
    '@prisma/client': { MaterialType, Prisma },
    'ts-fsrs': { Rating, checkParameters, createEmptyCard, default_w, fsrs },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/prisma': { default: actionDb, __esModule: true },
    '@/lib/validation/schema': {
      readFiniteNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
      readString: value => typeof value === 'string' ? value : '',
    },
    '@/lib/codecs/material-payload': { decodeMaterialPayload: (_, value) => value },
    '@/modules/review/domain/fsrs-card': domainExports,
    '@/modules/users/server/current-user': { getCurrentUserId: async () => userId },
    '@/utils/audioDialogue/sourceId': { parseAudioDialogueSourceId },
    '@/utils/time/format': { formatTokyoDateKey },
  }
  const exports = {}
  const loadedModule = { exports }
  new Function('require', 'module', 'exports', compiled)(id => stubs[id] || require(id), loadedModule, exports)
  return loadedModule.exports
}

async function loadAuthentication(db) {
  let mode = 'open'
  const sent = []
  const evaluate = async (filename, stubs) => {
    const source = await readFile(path.join(root, filename), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText
    const exports = {}
    new Function('require', 'exports', compiled)(id => stubs[id] || require(id), exports)
    return exports
  }
  const auth = await evaluate('modules/users/server/auth.ts', {
    'server-only': {},
    '@/lib/prisma': { default: db, __esModule: true },
    '../domain/password': { hashPassword, verifyPassword },
    'next/headers': { cookies: async () => ({ get: () => null }) },
  })
  const credentials = await evaluate('modules/users/server/credentials.ts', {
    'server-only': {},
    '@/lib/prisma': { default: db, __esModule: true },
    './auth': auth,
    '../domain/registration': { hashSecret, newSecret, validSecret, registrationMode: () => mode },
    './mail': { assertMailConfigured: () => {}, sendAuthMail: async (email, purpose, token) => { sent.push({ email, purpose, token }) } },
  })
  return { auth, credentials, sent, setMode: value => { mode = value } }
}

async function loadInvites(db, adminId, isAdmin = true) {
  const source = await readFile(path.join(root, 'modules/users/server/invites.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const exports = {}
  const domain = await import('../modules/users/domain/registration.ts')
  new Function('require', 'exports', compiled)(id => ({
    'server-only': {},
    '@/lib/prisma': { default: db, __esModule: true },
    './current-user': { requireAdmin: async () => {
      if (!isAdmin) throw new Error('没有管理权限。')
      return { id: adminId, isAdmin: true }
    } },
    '../domain/registration': domain,
  })[id] || require(id), exports)
  return exports
}

async function loadRateLimit(db) {
  const source = await readFile(path.join(root, 'modules/users/server/rate-limit.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)(id => ({
    'server-only': {},
    '@/lib/prisma': { default: db, __esModule: true },
    '../domain/registration': { hashSecret },
    '@prisma/client': { Prisma },
  })[id] || require(id), exports)
  return exports
}

async function createUserWithProfile(db, suffix) {
  const user = await db.user.create({ data: { name: `review-test-${suffix}` } })
  await db.fSRSProfile.create({ data: {
    profileId: user.id,
    weights: JSON.stringify([...default_w]),
    lastFittedAt: new Date(),
  } })
  return user.id
}

test('isolated PostgreSQL review concurrency and account sessions', {
  skip: process.env.REVIEW_PG_INTEGRATION !== '1',
  timeout: 120_000,
}, async () => {
  dotenv.config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true })
  const baseUrl = new URL(process.env.DATABASE_URL || '')
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname), 'test database creation requires local PostgreSQL')
  const developmentDatabase = decodeURIComponent(baseUrl.pathname.slice(1))
  const name = `mimiflow_review_test_${process.pid}_${randomBytes(4).toString('hex')}`
  assert.notEqual(name, developmentDatabase)
  const adminUrl = new URL(baseUrl)
  adminUrl.pathname = '/postgres'
  adminUrl.searchParams.delete('schema')
  const testUrl = new URL(baseUrl)
  testUrl.pathname = `/${name}`
  testUrl.searchParams.delete('schema')
  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  let created = false
  let db
  try {
    await admin.connect()
    await admin.query(`CREATE DATABASE "${name}"`)
    created = true
    const setup = new pg.Client({ connectionString: testUrl.toString() })
    try {
      await setup.connect()
      await setup.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    } finally {
      await setup.end().catch(() => {})
    }
    await runDbPush(testUrl.toString())
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl.toString() }) })

    const duplicateUser = await createUserWithProfile(db, 'duplicate')
    const material = await db.material.create({ data: {
      type: MaterialType.LISTENING,
      title: 'same dialogue test',
      contentPayload: { dialogues: [{ id: 1, text: '同じ文。' }] },
    } })
    const sourceId = buildAudioDialogueSourceId(material.id, '1')
    const duplicateActions = await loadActions(db, duplicateUser)
    const additions = await Promise.all([
      duplicateActions.addSentenceToReview(sourceId),
      duplicateActions.addSentenceToReview(sourceId),
    ])
    assert.equal(additions.filter(result => result.success).length, 1)
    assert.equal(additions.filter(result => result.state === 'already_exists').length, 1)
    assert.equal(await db.sentenceReview.count({ where: { userId: duplicateUser, sourceType: SourceType.AUDIO_DIALOGUE, sourceId } }), 1)

    const sentenceUser = await createUserWithProfile(db, 'sentence')
    const sentence = await db.sentenceReview.create({ data: {
      userId: sentenceUser, sourceType: SourceType.AUDIO_DIALOGUE, sourceId, text: '同じ文。',
    } })
    const sentenceActions = await loadActions(db, sentenceUser, { sentenceRead: readBarrier(2) })
    const sentenceResults = await Promise.all([
      sentenceActions.rateSentenceFluency(sentence.id, Rating.Hard),
      sentenceActions.rateSentenceFluency(sentence.id, Rating.Good),
    ])
    assert.equal(sentenceResults.filter(result => result.success).length, 1)
    assert.equal(sentenceResults.filter(result => result.retry).length, 1)
    const savedSentence = await db.sentenceReview.findUniqueOrThrow({ where: { id: sentence.id } })
    const sentenceEvents = await db.reviewEvent.findMany({ where: { profileId: sentenceUser, reviewId: sentence.id } })
    assert.equal(sentenceEvents.length, 1)
    assert.equal(savedSentence.reps, 1)
    assert.equal(sentenceEvents[0].stateBefore, 0)
    assert.equal(sentenceEvents[0].stateAfter, savedSentence.state)
    assert.equal(sentenceEvents[0].stabilityAfter, savedSentence.stability)
    assert.equal(sentenceEvents[0].difficultyAfter, savedSentence.difficulty)

    const vocabularyUser = await createUserWithProfile(db, 'vocabulary')
    const vocabulary = await db.vocabulary.create({ data: {
      userId: vocabularyUser, word: '語彙', normalizedWord: '語彙',
      sourceType: SourceType.ARTICLE_TEXT, sourceId: 'test-source',
    } })
    await db.vocabularyReview.create({ data: { userId: vocabularyUser, vocabularyId: vocabulary.id } })
    const vocabularyActions = await loadActions(db, vocabularyUser, { vocabularyRead: readBarrier(2) })
    const vocabularyResults = await Promise.all([
      vocabularyActions.rateVocabularyMemory(vocabulary.id, Rating.Hard),
      vocabularyActions.rateVocabularyMemory(vocabulary.id, Rating.Good),
    ])
    assert.equal(vocabularyResults.filter(result => result.success).length, 1)
    assert.equal(vocabularyResults.filter(result => result.retry).length, 1)
    assert.equal(await db.vocabularyReview.count({ where: { userId: vocabularyUser, vocabularyId: vocabulary.id } }), 1)
    const savedVocabulary = await db.vocabularyReview.findUniqueOrThrow({ where: { userId_vocabularyId: { userId: vocabularyUser, vocabularyId: vocabulary.id } } })
    const vocabularyEvents = await db.reviewEvent.findMany({ where: { profileId: vocabularyUser, reviewId: savedVocabulary.id } })
    assert.equal(vocabularyEvents.length, 1)
    assert.equal(savedVocabulary.reps, 1)
    assert.equal(vocabularyEvents[0].stateAfter, savedVocabulary.state)
    assert.equal(vocabularyEvents[0].stabilityAfter, savedVocabulary.stability)

    const readerUser = await createUserWithProfile(db, 'shared-wordbook-reader')
    const series = await db.wordbookSeries.create({ data: { userId: vocabularyUser, title: 'Shared series' } })
    const book = await db.wordbook.create({ data: { userId: vocabularyUser, seriesId: series.id, title: 'Shared book' } })
    await db.wordbookVocabulary.create({ data: { wordbookId: book.id, vocabularyId: vocabulary.id } })
    assert.equal(await db.wordbookVocabulary.count({ where: wordbookEntryWhere(book.id) }), 1)
    const [readerPage] = await db.$queryRaw(vocabularyGroupPageSql(readerUser, {
      wordbookFilter: book.id, seriesFilter: '', tagFilter: 'all', keyword: '',
      groupFilter: '', posFilter: 'all', page: 1, pageSize: 20, focusId: '',
    }, [], { kana: 'ja', hangul: 'ko', han: 'zh', cyrillic: 'ru', other: 'en' }))
    assert.equal(readerPage.totalCount, 1)
    const readerActions = await loadActions(db, readerUser)
    assert.equal((await readerActions.rateVocabularyMemory(vocabulary.id, Rating.Good)).success, true)
    const readerCard = await db.vocabularyReview.findUniqueOrThrow({ where: { userId_vocabularyId: { userId: readerUser, vocabularyId: vocabulary.id } } })
    assert.equal(readerCard.reps, 1)
    assert.equal((await db.vocabularyReview.findUniqueOrThrow({ where: { id: savedVocabulary.id } })).reps, 1)
    assert.equal(await db.vocabularyReview.count({ where: { vocabularyId: vocabulary.id } }), 2)
    assert.equal(await db.reviewEvent.count({ where: { profileId: readerUser, reviewId: readerCard.id } }), 1)

    const { auth, credentials, sent, setMode } = await loadAuthentication(db)
    const accountResult = await credentials.registerAccount({
      name: `account-${randomBytes(4).toString('hex')}`,
      email: 'learner@example.test',
      password: 'a long private password',
    })
    assert.equal(accountResult, 'created')
    const account = await db.user.findFirstOrThrow({ where: { credential: { email: 'learner@example.test' } } })
    assert.equal(await credentials.registerAccount({ name: 'another', email: 'learner@example.test', password: 'another long password' }), 'duplicate')
    assert.equal(await credentials.authenticateAccount({ email: 'learner@example.test', password: 'a long private password' }), null)
    assert.equal(await credentials.consumeVerificationToken(sent[0].token), true)
    assert.equal(await credentials.consumeVerificationToken(sent[0].token), false)
    assert.equal((await credentials.authenticateAccount({ email: 'learner@example.test', password: 'a long private password' }))?.id, account.id)
    const token = await auth.createSession(account.id)
    assert.equal((await auth.readSessionUser(token))?.id, account.id)
    assert.equal((await auth.readSessionUser(token))?.isAdmin, false)
    assert.equal(await auth.readSessionUser(account.id), null)
    await db.userSession.update({ where: { tokenHash: auth.hashSessionToken(token) }, data: { expiresAt: new Date(0) } })
    assert.equal(await auth.readSessionUser(token), null)
    assert.equal(await credentials.authenticateAccount({ email: 'learner@example.test', password: 'wrong password' }), null)
    assert.equal((await db.userCredential.findUniqueOrThrow({ where: { userId: account.id } })).failedLoginAttempts, 1)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.equal(await credentials.authenticateAccount({ email: 'learner@example.test', password: 'wrong password' }), null)
    }
    assert.ok((await db.userCredential.findUniqueOrThrow({ where: { userId: account.id } })).loginLockedUntil > new Date())
    assert.equal(await credentials.authenticateAccount({ email: 'learner@example.test', password: 'a long private password' }), null)
    await db.userCredential.update({ where: { userId: account.id }, data: { loginLockedUntil: new Date(0) } })
    assert.equal((await credentials.authenticateAccount({ email: 'learner@example.test', password: 'a long private password' }))?.id, account.id)
    assert.equal((await db.userCredential.findUniqueOrThrow({ where: { userId: account.id } })).failedLoginAttempts, 0)

    const inviter = await db.user.create({ data: { name: 'inviter', isAdmin: true } })
    const limiter = await loadRateLimit(db)
    const request = { headers: { get: () => null } }
    for (let attempt = 0; attempt < 10; attempt += 1) assert.equal(await limiter.allowAuthRequest('login', request, 'limited@example.test'), true)
    assert.equal(await limiter.allowAuthRequest('login', request, 'limited@example.test'), false)
    assert.equal(await limiter.allowAuthRequest('login', request, 'other@example.test'), true)
    const invites = await loadInvites(db, inviter.id)
    const deniedInvites = await loadInvites(db, inviter.id, false)
    await assert.rejects(deniedInvites.createRegistrationInvite(new Date(Date.now() + 86400_000)), /没有管理权限/)
    const managedCode = await invites.createRegistrationInvite(new Date(Date.now() + 86400_000))
    assert.equal(await invites.validateRegistrationInvite(managedCode), true)
    const managedRow = await db.registrationInvite.findUniqueOrThrow({ where: { codeHash: hashSecret(managedCode) } })
    assert.equal(managedRow.createdById, inviter.id)
    assert.equal((await invites.listRegistrationInvites()).find(row => row.id === managedRow.id).status, '未使用')
    assert.equal(await invites.revokeRegistrationInvite(managedRow.id), true)
    assert.equal(await invites.validateRegistrationInvite(managedCode), false)
    assert.equal(await invites.revokeRegistrationInvite(managedRow.id), false)
    assert.equal((await invites.listRegistrationInvites()).find(row => row.id === managedRow.id).status, '已撤销')
    const expired = await db.registrationInvite.create({ data: { codeHash: hashSecret(newSecret()), createdById: inviter.id, expiresAt: new Date(Date.now() - 60_000) } })
    assert.equal((await invites.listRegistrationInvites()).find(row => row.id === expired.id).status, '已过期')
    const inviteCode = newSecret()
    const invite = await db.registrationInvite.create({ data: { codeHash: hashSecret(inviteCode), createdById: inviter.id, expiresAt: new Date(Date.now() + 86400_000) } })
    setMode('invite')
    const concurrent = await Promise.all([
      credentials.registerAccount({ name: 'invite-a', email: 'a@example.test', password: 'first secure password', inviteCode }),
      credentials.registerAccount({ name: 'invite-b', email: 'b@example.test', password: 'second secure password', inviteCode }),
    ])
    assert.deepEqual(concurrent.sort(), ['created', 'invite'])
    assert.equal(await db.user.count({ where: { name: { in: ['invite-a', 'invite-b'] } } }), 1)
    assert.equal((await db.registrationInvite.findUniqueOrThrow({ where: { id: invite.id } })).usedById !== null, true)
    assert.equal((await invites.listRegistrationInvites()).find(row => row.id === invite.id).status, '已使用')
    assert.equal(sent.filter(item => item.purpose === 'verify').length, 2)
    const unusedCode = newSecret()
    await db.registrationInvite.create({ data: { codeHash: hashSecret(unusedCode), createdById: inviter.id, expiresAt: new Date(Date.now() + 86400_000), revokedAt: new Date() } })
    assert.equal(await credentials.registerAccount({ name: 'invite-c', email: 'c@example.test', password: 'third secure password', inviteCode: unusedCode }), 'invite')

    await credentials.issueAuthToken('learner@example.test', 'reset')
    const reset = sent.findLast(item => item.purpose === 'reset')
    assert.ok(reset)
    const activeSession = await auth.createSession(account.id)
    assert.equal((await auth.readSessionUser(activeSession))?.id, account.id)
    assert.equal(await credentials.consumeResetToken(reset.token, 'new secure password'), true)
    assert.equal(await credentials.consumeResetToken(reset.token, 'another secure password'), false)
    assert.equal(await auth.readSessionUser(activeSession), null)
    assert.equal((await credentials.authenticateAccount({ email: 'learner@example.test', password: 'new secure password' }))?.id, account.id)
    assert.ok((await db.userCredential.findUniqueOrThrow({ where: { userId: account.id } })).emailVerifiedAt)
  } finally {
    if (db) await db.$disconnect()
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
    await admin.end().catch(() => {})
  }
})

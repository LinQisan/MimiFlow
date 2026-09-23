import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { parseAudioDialogueSourceId } from '../utils/audioDialogue/sourceId.ts'

const source = await readFile(new URL('../modules/review/actions/memory.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText

function barrier(target) {
  let arrived = 0
  let release
  const waiting = new Promise(resolve => { release = resolve })
  return async () => {
    if (++arrived === target) release()
    await waiting
  }
}

function harness(kind) {
  const initialDate = new Date('2026-01-01T00:00:00.000Z')
  let card = {
    id: 'card-1', vocabularyId: 'word-1', userId: 'user-a', sourceType: 'AUDIO_DIALOGUE',
    sourceId: 'material-a::1', due: initialDate, state: 0, stability: 0, difficulty: 0,
    elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
    updatedAt: initialDate,
  }
  const events = []
  const waitForBothReads = barrier(2)
  const readCard = async () => { await waitForBothReads(); return { ...card } }
  const updateCard = async ({ where, data }) => {
    if (where.reps !== card.reps || where.updatedAt.getTime() !== card.updatedAt.getTime()) return { count: 0 }
    card = { ...card, ...data, updatedAt: new Date(card.updatedAt.getTime() + 1) }
    return { count: 1 }
  }
  const profile = {
    profileId: 'user-a', weights: '[1]', enabled: true, requestRetention: 0.9,
    maximumInterval: 36500, lastFittedAt: new Date(), lastEngineMode: 'custom',
  }
  const db = {
    sentenceReview: { findFirst: kind === 'sentence' ? readCard : async () => null, updateMany: updateCard },
    vocabulary: { findFirst: async () => ({ id: 'word-1', sourceType: 'ARTICLE_TEXT' }) },
    vocabularyReview: { findUnique: kind === 'vocabulary' ? readCard : async () => null, updateMany: updateCard },
    fSRSProfile: { upsert: async () => profile, update: async () => profile },
    reviewEvent: { create: async ({ data }) => { events.push(data); return data } },
    $transaction: async callback => callback(db),
  }
  const engine = { repeat: (old, now) => Object.fromEntries([1, 2, 3, 4].map(rating => [rating, { card: {
    ...old, due: now, state: rating, stability: old.stability + 1,
    difficulty: old.difficulty + 1, reps: old.reps + 1, last_review: now,
  } }])) }
  const stubs = {
    '@prisma/client': { MaterialType: { LISTENING: 'LISTENING' }, Prisma: {} },
    'ts-fsrs': { Rating: { Again: 1, Hard: 2, Good: 3, Easy: 4 }, checkParameters: value => value, createEmptyCard: () => ({}), default_w: [1], fsrs: () => engine },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/prisma': { default: db, __esModule: true },
    '@/lib/validation/schema': { readFiniteNumber: value => Number(value) || 0, readString: value => String(value || '') },
    '@/lib/codecs/material-payload': { decodeMaterialPayload: (_, value) => value },
    '@/modules/review/domain/fsrs-card': { toFsrsCard: value => value, toStoredFsrsUpdate: value => ({ due: value.due, state: value.state, stability: value.stability, difficulty: value.difficulty, reps: value.reps, last_review: value.last_review }) },
    '@/modules/users/server/current-user': { getCurrentUserId: async () => 'user-a' },
    '@/utils/audioDialogue/sourceId': { parseAudioDialogueSourceId },
  }
  const exports = {}
  const loadedModule = { exports }
  new Function('require', 'module', 'exports', compiled)(id => {
    if (!(id in stubs)) throw new Error(`Unknown import: ${id}`)
    return stubs[id]
  }, loadedModule, exports)
  return { api: loadedModule.exports, events, card: () => card }
}

for (const kind of ['sentence', 'vocabulary']) {
  test(`two concurrent ${kind} ratings commit one card transition and one matching event`, async () => {
    const h = harness(kind)
    const rate = kind === 'sentence'
      ? rating => h.api.rateSentenceFluency('card-1', rating)
      : rating => h.api.rateVocabularyMemory('word-1', rating)
    const results = await Promise.all([rate(2), rate(3)])
    assert.equal(results.filter(result => result.success).length, 1)
    assert.equal(results.filter(result => result.retry).length, 1)
    assert.equal(h.events.length, 1)
    assert.equal(h.card().reps, 1)
    assert.equal(h.events[0].stateBefore, 0)
    assert.equal(h.events[0].stateAfter, h.card().state)
    assert.equal(h.events[0].stabilityAfter, h.card().stability)
    assert.equal(h.events[0].difficultyAfter, h.card().difficulty)
  })
}

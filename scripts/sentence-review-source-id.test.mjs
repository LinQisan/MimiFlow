import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { buildAudioDialogueSourceId, parseAudioDialogueSourceId } from '../utils/audioDialogue/sourceId.ts'

const source = await readFile(new URL('../modules/review/actions/memory.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
class UniqueConflict extends Error { code = 'P2002' }

function harness() {
  const materials = new Map([
    ['material-a', { dialogues: [{ id: 1, text: '一つ目の文。' }] }],
    ['material-b', { dialogues: [{ id: 1, text: '別の文。' }] }],
  ])
  const reviews = [{ id: 'legacy', userId: 'user-a', sourceType: 'AUDIO_DIALOGUE', sourceId: '1', text: '帰属不明' }]
  const materialReads = []
  const db = {
    material: { findFirst: async ({ where }) => {
      materialReads.push(where)
      return materials.has(where.id) && where.type === 'LISTENING'
        ? { contentPayload: materials.get(where.id) }
        : null
    } },
    sentenceReview: {
      findFirst: async ({ where }) => reviews.find(row => row.userId === where.userId && row.sourceType === where.sourceType && row.sourceId === where.sourceId) || null,
      create: async ({ data }) => {
        if (reviews.some(row => row.userId === data.userId && row.sourceType === data.sourceType && row.sourceId === data.sourceId)) throw new UniqueConflict()
        const row = { id: `review-${reviews.length}`, ...data }
        reviews.push(row)
        return row
      },
    },
  }
  const stubs = {
    '@prisma/client': { MaterialType: { LISTENING: 'LISTENING' }, Prisma: { PrismaClientKnownRequestError: UniqueConflict } },
    'ts-fsrs': { Rating: {}, checkParameters: () => {}, createEmptyCard: () => ({ due: new Date(), state: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null }), default_w: [], fsrs: () => ({}) },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/prisma': { default: db, __esModule: true },
    '@/lib/validation/schema': { readFiniteNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback, readString: value => typeof value === 'string' ? value : '' },
    '@/lib/codecs/material-payload': { decodeMaterialPayload: (_, value) => value },
    '@/modules/review/domain/fsrs-card': {},
    '@/modules/users/server/current-user': { getCurrentUserId: async () => 'user-a' },
    '@/utils/audioDialogue/sourceId': { parseAudioDialogueSourceId },
  }
  const exports = {}
  const loadedModule = { exports }
  new Function('require', 'module', 'exports', compiled)(id => {
    if (!(id in stubs)) throw new Error(`Unknown import: ${id}`)
    return stubs[id]
  }, loadedModule, exports)
  return { add: loadedModule.exports.addSentenceToReview, reviews, materialReads }
}

test('same dialogue number in two materials creates distinct review cards', async () => {
  const h = harness()
  const first = buildAudioDialogueSourceId('material-a', '1')
  const second = buildAudioDialogueSourceId('material-b', '1')
  assert.equal((await h.add(first)).success, true)
  assert.equal((await h.add(second)).success, true)
  assert.deepEqual(h.reviews.slice(1).map(row => [row.sourceId, row.text]), [
    [first, '一つ目の文。'], [second, '別の文。'],
  ])
  assert.deepEqual(h.materialReads.map(where => where.id), ['material-a', 'material-b'])
  assert.equal(h.reviews[0].sourceId, '1', 'ambiguous legacy data remains untouched')
})

test('duplicate check is scoped to material and dialogue, while numeric-only input is rejected', async () => {
  const h = harness()
  const first = buildAudioDialogueSourceId('material-a', '1')
  const second = buildAudioDialogueSourceId('material-b', '1')
  assert.equal((await h.add(first)).success, true)
  assert.equal((await h.add(first)).state, 'already_exists')
  assert.equal((await h.add(second)).success, true)
  assert.equal((await h.add('1')).success, false)
  assert.equal(h.reviews.length, 3)
})

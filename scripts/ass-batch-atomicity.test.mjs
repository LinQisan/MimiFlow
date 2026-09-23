import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { AUDIO_EXTENSIONS, getDatedAudioFolder, toSafeFilename } from '../modules/media/audio/domain/storage.ts'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('../modules/import/actions.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText

async function harness(failOnCreate = 0) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimiflow-ass-batch-'))
  let created = []
  let attempts = 0
  const db = {
    async $transaction(callback) {
      const snapshot = [...created]
      try {
        return await callback({
          material: { create: async ({ data }) => {
            attempts += 1
            if (attempts === failOnCreate) throw new Error('injected database failure')
            created.push(data)
          } },
        })
      } catch (error) {
        created = snapshot
        throw error
      }
    },
  }
  const MaterialType = Object.fromEntries(['LISTENING', 'MEDIA_SUBTITLE', 'READING', 'VOCAB_GRAMMAR', 'SPEAKING'].map(value => [value, value]))
  const stubs = {
    '@/modules/users/server/current-user': { requireAdmin: async () => ({ id: 'admin', isAdmin: true }) },
    '@prisma/client': { MaterialType, CollectionType: { CUSTOM_GROUP: 'CUSTOM_GROUP', PAPER: 'PAPER' } },
    '@/lib/prisma': { default: db, __esModule: true },
    '@/lib/server/public-paths': { PUBLIC_AUDIO_ROOT: root, PUBLIC_QUESTION_IMAGE_ROOT: root },
    '@/utils/files/path': { resolvePathInsideRoot: (base, rel) => path.join(base, rel) },
    '@/utils/listening/jlptIdentity': { parseJlptListeningIdentity: () => null, formatJlptListeningTitle: () => '' },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/media-subtitles/search-index': { replaceMediaSubtitleSearchIndex: async () => {} },
    '@/lib/codecs/material-payload': { encodeMaterialPayload: (_, payload) => payload },
    '@/modules/import/collection-policy': { getMaterialCollectionTypeError: () => null, isCollectionTypeAllowedForMaterial: () => true },
    '@/modules/import/audio/domain': { buildCollectionAudioFolder: () => '' },
    '@/modules/import/domain/listening-question-drafts': { parseListeningQuestionDraftPayload: () => ({ questions: [] }) },
    '@/modules/import/domain/listening-batch-assignments': { selectListeningQuestionEntriesForFile: () => [] },
    '@/lib/codecs/question-content': { encodeQuestionContent: value => value },
    '@/modules/practice/domain/question-record': { toQuestionOptionsAndAnswer: () => ({}) },
    '@/modules/questions/domain/toeic': { getToeicPartByQuestionType: () => null },
    '@/modules/practice/domain/paper-attributes': { normalizePaperAttributes: value => value },
    '@/modules/import/audio/ass': {
      parseAssToRawSubtitles: text => text === 'BAD' ? [] : [{ text, start: 0, end: 1 }],
      applyAssTimelinePadding: rows => rows,
    },
    '@/modules/practice/server/vocabulary-analytics': {
      invalidatePracticeVocabularyAnalytics: () => {},
      precomputePracticeVocabularyMaterialAnalyses: async () => {},
    },
    '@/modules/media/audio/server/upload': { saveAudioUpload: async () => { throw new Error('unused audio upload') } },
    '@/modules/media/audio/domain/storage': { AUDIO_EXTENSIONS, getDatedAudioFolder, toSafeFilename },
  }
  const exports = {}
  new Function('require', 'exports', compiled)(id => stubs[id] || require(id), exports)
  return { upload: exports.uploadAssAndSaveData, created: () => created, attempts: () => attempts, cleanup: () => rm(root, { recursive: true, force: true }) }
}

function batch(secondText) {
  const data = new FormData()
  data.set('uploadMode', 'media')
  data.set('subtitleWorkTitle', 'Fixture film')
  data.append('assFiles', new File(['GOOD'], 'one.ass'))
  data.append('assFiles', new File([secondText], 'two.ass'))
  return data
}

test('invalid later subtitle prevents every material write', async () => {
  const h = await harness()
  try {
    const result = await h.upload(batch('BAD'))
    assert.equal(result.success, false)
    assert.equal(h.attempts(), 0)
    assert.equal(h.created().length, 0)
  } finally { await h.cleanup() }
})

test('later database failure rolls back earlier materials in the same batch', async () => {
  const h = await harness(2)
  try {
    const result = await h.upload(batch('GOOD TWO'))
    assert.equal(result.success, false)
    assert.equal(h.attempts(), 2)
    assert.equal(h.created().length, 0)
  } finally { await h.cleanup() }
})

test('valid batch reports both committed material IDs', async () => {
  const h = await harness()
  try {
    const result = await h.upload(batch('GOOD TWO'))
    assert.equal(result.success, true)
    assert.equal(result.lessonIds.length, 2)
    assert.equal(h.created().length, 2)
  } finally { await h.cleanup() }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { AUDIO_EXTENSIONS, getDatedAudioFolder, toSafeFilename } from '../modules/media/audio/domain/storage.ts'

const source = await readFile(new URL('../modules/media/audio/manage-actions.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText

async function harness(failUpdate = false, failOldRemoval = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'mimiflow-audio-admin-'))
  const original = '/audios/reading.mp3'
  await writeFile(path.join(root, 'reading.mp3'), 'recording')
  let readingAudios = [{ id: 'reading-1', audioFile: original }]
  const lazy = fn => ({ then(resolve, reject) { Promise.resolve().then(fn).then(resolve, reject) } })
  const empty = { count: async () => 0, findMany: async () => [], updateMany: () => lazy(() => ({ count: 0 })) }
  const db = {
    material: empty,
    vocabularySentence: empty,
    vocabulary: empty,
    vocabularyReadingAudio: {
      count: async ({ where }) => readingAudios.filter(row => row.audioFile === where.audioFile).length,
      findMany: async ({ where }) => readingAudios.filter(row => where.audioFile.in.includes(row.audioFile)),
      updateMany: ({ where, data }) => lazy(() => {
        if (failUpdate) throw new Error('injected database failure')
        let count = 0
        readingAudios = readingAudios.map(row => {
          if (row.audioFile !== where.audioFile) return row
          count++
          return { ...row, audioFile: data.audioFile }
        })
        return { count }
      }),
    },
    async $transaction(operations) {
      const before = readingAudios.map(row => ({ ...row }))
      const outcomes = await Promise.allSettled(operations)
      const failure = outcomes.find(row => row.status === 'rejected')
      if (failure) { readingAudios = before; throw failure.reason }
      return outcomes.map(row => row.value)
    },
  }
  const resolve = (base, rel) => {
    const target = path.resolve(base, rel)
    return target.startsWith(`${path.resolve(base)}${path.sep}`) ? target : null
  }
  const stubs = {
    '@/modules/users/server/current-user': { requireAdmin: async () => ({ id: 'admin', isAdmin: true }) },
    'server-only': {},
    '@prisma/client': { MaterialType: { LISTENING: 'LISTENING', READING: 'READING', SPEAKING: 'SPEAKING', MEDIA_SUBTITLE: 'MEDIA_SUBTITLE' } },
    '@/lib/prisma': { default: db, __esModule: true },
    '@/utils/files/path': { resolvePathInsideRoot: resolve, isPathInsideRoot: (base, target) => target.startsWith(`${path.resolve(base)}${path.sep}`) },
    '@/lib/validation/schema': { readString: value => typeof value === 'string' ? value : '' },
    '@/lib/server/public-paths': { PUBLIC_AUDIO_ROOT: root },
    '@/modules/media/audio/server/upload': { MAX_AUDIO_UPLOAD_BYTES: 80 * 1024 * 1024, saveAudioUpload: async () => { throw new Error('unused upload') } },
    '@/modules/media/audio/domain/storage': { AUDIO_EXTENSIONS, getDatedAudioFolder, toSafeFilename },
    '@/lib/codecs/material-payload': { decodeMaterialPayloadRecord: (_, value) => value, patchMaterialPayload: (_, value, patch) => ({ ...value, ...patch }) },
    'next/cache': { revalidatePath: () => {} },
  }
  const exports = {}
  const loadedModule = { exports }
  const requireStub = id => id === 'node:fs/promises' && failOldRemoval
    ? { ...requireNode(id), unlink: async file => {
      if (file === path.join(root, 'reading.mp3')) throw new Error('injected unlink failure')
      return requireNode(id).unlink(file)
    } }
    : stubs[id] || (id.startsWith('node:') ? requireNode(id) : (() => { throw new Error(`Unknown import: ${id}`) })())
  new Function('require', 'module', 'exports', compiled)(requireStub, loadedModule, exports)
  return { api: loadedModule.exports, root, original, readings: () => readingAudios }
}

const nodeImports = await Promise.all(['node:fs/promises', 'node:fs', 'node:path'].map(id => import(id)))
function requireNode(id) { return nodeImports[['node:fs/promises', 'node:fs', 'node:path'].indexOf(id)] }
async function exists(file) { try { await access(file); return true } catch { return false } }

test('reading audio protects a referenced file from deletion and appears linked in listing', async () => {
  const h = await harness()
  try {
    const deleted = await h.api.deleteAudioFileAdmin(h.original)
    assert.equal(deleted.success, false)
    assert.match(deleted.message, /词汇 1 条/)
    assert.equal(await exists(path.join(h.root, 'reading.mp3')), true)
    const listing = await h.api.listAudioFilesAdmin()
    assert.equal(listing.items[0].linkedVocabularyAudio, 1)
    assert.equal(listing.summary.unlinkedFiles, 0)
  } finally { await rm(h.root, { recursive: true, force: true }) }
})

test('moving reading audio updates its reference and removes the old file', async () => {
  const h = await harness()
  try {
    const result = await h.api.moveAudioFileAdmin(h.original, 'moved')
    assert.equal(result.success, true)
    assert.equal(result.vocabularyRefUpdated, 1)
    assert.equal(h.readings()[0].audioFile, '/audios/moved/reading.mp3')
    assert.equal(await exists(path.join(h.root, 'reading.mp3')), false)
    assert.equal(await readFile(path.join(h.root, 'moved/reading.mp3'), 'utf8'), 'recording')
  } finally { await rm(h.root, { recursive: true, force: true }) }
})

test('renaming reading audio updates its reference and preserves bytes', async () => {
  const h = await harness()
  try {
    const result = await h.api.renameAudioFileAdmin(h.original, 'renamed')
    assert.equal(result.success, true)
    assert.equal(result.vocabularyRefUpdated, 1)
    assert.equal(h.readings()[0].audioFile, '/audios/renamed.mp3')
    assert.equal(await exists(path.join(h.root, 'reading.mp3')), false)
    assert.equal(await readFile(path.join(h.root, 'renamed.mp3'), 'utf8'), 'recording')
  } finally { await rm(h.root, { recursive: true, force: true }) }
})

test('failed reference update removes the copy and keeps the original path', async () => {
  const h = await harness(true)
  try {
    const result = await h.api.moveAudioFileAdmin(h.original, 'moved')
    assert.equal(result.success, false)
    assert.equal(h.readings()[0].audioFile, h.original)
    assert.equal(await exists(path.join(h.root, 'reading.mp3')), true)
    assert.equal(await exists(path.join(h.root, 'moved/reading.mp3')), false)
  } finally { await rm(h.root, { recursive: true, force: true }) }
})

test('failed removal of the old file leaves the updated reference and reports the duplicate', async () => {
  const h = await harness(false, true)
  try {
    const result = await h.api.moveAudioFileAdmin(h.original, 'moved')
    assert.equal(result.success, true)
    assert.equal(result.sourceRemoved, false)
    assert.match(result.message, /旧文件未能删除/)
    assert.equal(h.readings()[0].audioFile, '/audios/moved/reading.mp3')
    assert.equal(await exists(path.join(h.root, 'reading.mp3')), true)
    assert.equal(await exists(path.join(h.root, 'moved/reading.mp3')), true)
  } finally { await rm(h.root, { recursive: true, force: true }) }
})

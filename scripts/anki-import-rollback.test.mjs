import { persistImportedWordbookOrder } from '../modules/knowledge/wordbooks/entry-order-writer.ts'
import { splitJapaneseEtymologies } from '../modules/language/domain/etymology.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { hasJapanese } from '../modules/language/domain/text.ts'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('../modules/import/anki-actions.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText

async function harness(root, fail, rowOverride = {}) {
  const invalidations = []
  let committed = []
  let draft = []
  let transactionClient
  const model = name => new Proxy({}, { get: (_, method) => async args => {
    if (`${name}.${method}` === fail) throw new Error('injected import failure')
    if (method === 'findMany') return []
    if (method === 'findFirst' || method === 'findUnique') return null
    if (method === 'count') return 0
    draft.push({ name, method, data: args?.data })
    if (method === 'create' || method === 'upsert') return { id: `${name}-id` }
    return { count: 1 }
  } })
  transactionClient = new Proxy({}, { get: (_, name) => name === '$executeRaw' ? async query => {
    if (fail === 'entryOrder.update') throw new Error('injected ordering failure')
    assert.ok(query.values.includes('test-user'))
    assert.ok(query.values.includes('wordbook-id'))
    const ordered = JSON.parse(query.values.find(value => typeof value === 'string' && value.startsWith('[{')))
    assert.deepEqual(ordered, [{ id: 'vocabulary-id', position: 1 }])
    draft.push({ name: 'entryOrder', method: 'update' }); return 1
  } : model(name) })
  const db = new Proxy({
    $transaction: async operation => {
      draft = []
      const result = await operation(transactionClient)
      committed = [...draft]
      return result
    },
  }, { get: (target, key) => key in target ? target[key] : {
    count: async () => 0,
    findMany: async () => [],
  } })
  const list = {
    parseJsonStringList: value => value ? JSON.parse(value) : [],
    toJsonStringList: value => JSON.stringify([...new Set(value)]),
  }
  const stubs = {
    '@/modules/knowledge/wordbooks/entry-order-writer': { persistImportedWordbookOrder },
    '@/modules/language/domain/etymology': { splitJapaneseEtymologies },
    '@/lib/prisma': { default: db, __esModule: true },
    '@/modules/import/domain/anki-reading-audio': {
      changedAnkiFields: (existing, incoming) => Object.fromEntries(
        Object.entries(incoming).filter(([key, value]) => JSON.stringify(existing[key]) !== JSON.stringify(value)),
      ),
      planAnkiReadingAudio: (vocabularyId, readings, audioFile) => {
        const reading = [...new Set(readings.map(value => String(value).normalize('NFKC').trim()).filter(Boolean))].join(' / ')
        return reading && audioFile ? { vocabularyId, reading, audioFile } : null
      },
    },
    '@/modules/users/server/current-user': { getCurrentUserId: async () => 'test-user' },
    '@/modules/knowledge/vocabulary/server/repository': { VOCABULARY_GROUPS_CACHE_TAG: 'vocabulary-groups' },
    'next/cache': {
      updateTag: tag => {
        assert.ok(committed.length > 0, 'expire only after commit')
        invalidations.push(['tag', tag])
      },
      revalidatePath: (...args) => invalidations.push(['path', ...args]),
    },
    '@/utils/text/jsonList': list,
    '@/utils/text/pronunciation': { sanitizePronunciations: (_, p) => p, mergeVocabularyPronunciations: ({existing,incoming}) => [...existing,...incoming] },
    '@/utils/vocabulary/vocabularyCanonical': { buildVocabularyCanonicalKeys: w => [w] },
    '@/utils/vocabulary/audioFolder': { buildVocabularyAudioFolder: (s,w) => `${s}/${w}` },
    '@/modules/knowledge/vocabulary/domain/jlpt': { filterVocabularyTags: x => x, inferVocabularyJlpt: () => null, normalizeVocabularyJlpt: () => null },
    '@/utils/files/path': { resolvePathInsideRoot: (r,p) => path.join(r,p) },
    '@/lib/server/public-paths': { PUBLIC_AUDIO_ROOT: root },
    '@/modules/knowledge/vocabulary/server/pronunciation-service': { batchComputeVocabularyPronunciations: async () => new Map(), batchComputeSentencePronunciations: async () => new Map() },
    '@/modules/knowledge/vocabulary/domain/pronunciation': { PRONUNCIATION_VERSION: 1 },
    '@/modules/language/domain/text': { hasJapanese },
    '@/modules/import/server/anki-package': { parseAnkiPackage: async () => ({
      notes: [{ rowNo: 1, fields: { word: 'インテリア', pronunciation: 'Interior', etymology: 'interior' }, tags: [] }],
      audioFiles: [], deckNames: [],
    }) },
    '@/modules/import/domain/anki-package': { formatAnkiWordbookSource: (s,w) => `${s}/${w}`, resolveAnkiNotebookPath: () => ({seriesTitle:'Test',wordbookTitle:'Unit02',notebookName:'Test/Unit02'}) },
    '@/modules/knowledge/vocabulary/domain/normalized-word': { normalizeVocabularyWord: w => w },
    '@/modules/knowledge/vocabulary/domain/entry': { inferStructuredPartOfSpeech: () => 'other' },
    '@/modules/import/domain/anki-vocabulary': { normalizeAnkiGroupTitle: s => s.normalize('NFKC'), preferredAnkiAudio: (a,b) => a || b || null },
    '@/modules/import/server/anki-vocabulary': { ensureAnkiVocabularySenses: async (...args) => {
      assert.equal(args.at(-2), 'Unit02', 'imported definitions must use the leaf wordbook title')
      assert.equal(args.at(-1), transactionClient, 'sense writes must join the same transaction')
      return {id:'sense',order:0}
    } },
  }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, require: name => {
      if(name in stubs) return stubs[name]
      if(name.startsWith('@/')) throw new Error(`Unexpected dependency: ${name}`)
      return require(name)
    }, Buffer, File, Map, Set, console: {error() {}},
  })
  const data = new FormData()
  data.set('notebookName','Test/Unit02')
  data.set('rowsJson',JSON.stringify([{rowNo:1,word:'歩く',pronunciations:['あるく'],meanings:['走路'],sentence:'道を歩く。',sentenceTranslation:'走在路上',wordAudioName:'sample.mp3',tags:[], ...rowOverride}]))
  data.append('audioFiles',new File(['test audio bytes'],'sample.mp3'))
  const result = await exports.runAnkiImport(data)
  return {result, committed, invalidations, attempted:draft, actions: exports}
}

test('Japanese detection can execute on the server without a client hook', () => {
  assert.equal(hasJapanese('歩く'),true)
  assert.equal(hasJapanese('カタカナ'),true)
  assert.equal(hasJapanese('English 123'),false)
})
for (const failure of ['vocabulary.create','vocabularySentence.upsert','wordbookVocabulary.createMany','entryOrder.update']) {
  test(`failure at ${failure} rolls back book/word writes and removes new audio`, async () => {
    const root = await mkdtemp(path.join(tmpdir(),'anki-rollback-'))
    try {
      const {result,committed,attempted,invalidations} = await harness(root,failure)
      assert.equal(result.success,false)
      assert.ok(attempted.some(write=>write.name==='wordbook'))
      assert.deepEqual(committed,[])
      assert.deepEqual(invalidations,[])
      assert.deepEqual(await readdir(root,{recursive:true}),[])
    } finally { await rm(root,{recursive:true,force:true}) }
  })
}
test('successful import commits all associations and retains its audio',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'anki-success-'))
  try {
    const {result,committed,invalidations}=await harness(root)
    assert.equal(result.success,true)
    assert.deepEqual(invalidations, [['tag', 'vocabulary-groups'], ['path', '/vocabulary', 'layout'], ['path', '/manage/vocabulary']])
    assert.ok(committed.some(write=>write.name==='entryOrder'))
    assert.ok(committed.some(write=>write.name==='wordbookVocabulary'))
    assert.ok(committed.some(write=>write.name==='vocabularyReadingAudio'))
    assert.equal((await readFile(path.join(root,'Test/Unit02/sample.mp3'))).toString(),'test audio bytes')
  } finally {await rm(root,{recursive:true,force:true})}
})

test('new imported definitions retain the wordbook title as their source', async () => {
  const source = await readFile(new URL('../modules/import/server/anki-vocabulary.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const { planAnkiMeanings } = await import('../modules/import/domain/anki-vocabulary.ts')
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name === 'server-only') return {}
    if (name === '../domain/anki-vocabulary') return { planAnkiMeanings }
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  const definitions = []
  const tx = {
    vocabulary: { findFirst: async () => ({ senses: [] }) },
    vocabularySense: { create: async () => ({ id: 'sense', order: 0 }) },
    vocabularyDefinition: { create: async ({ data }) => definitions.push(data) },
  }
  await exports.ensureAnkiVocabularySenses('user', 'word', ['走路'], '', 'Unit02 动词A', tx)
  assert.equal(definitions.length, 1)
  assert.equal(definitions[0].dictionaryName, 'Unit02 动词A')
  assert.equal(definitions[0].definition, '走路')
})


test('Anki English source spelling is saved as etymology, never as an audio reading', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'anki-etymology-'))
  try {
    const { result, committed } = await harness(root, undefined, {
      word: 'インテリア', pronunciations: ['Interior'], etymologies: ['interior'],
    })
    assert.equal(result.success, true)
    const vocabulary = committed.find(write => write.name === 'vocabulary' && write.method === 'create').data
    assert.deepEqual(JSON.parse(vocabulary.pronunciations || '[]'), [])
    assert.deepEqual(JSON.parse(vocabulary.etymologies), ['interior'])
    assert.ok(vocabulary.wordAudio)
    assert.equal(committed.some(write => write.name === 'vocabularyReadingAudio'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})


test('TSV and APKG previews identify etymology without requiring an extra column', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'anki-preview-etymology-'))
  try {
    const { actions } = await harness(root)
    for (const file of [
      new File(['word\tpronunciation\nインテリア\tInterior'], 'words.tsv'),
      new File(['word\tpronunciation\tetymology\nインテリア\tいんてりあ\tInterior'], 'origins.tsv'),
      new File(['fixture archive'], 'words.apkg'),
    ]) {
      const form = new FormData()
      form.set('ankiFile', file)
      form.set('notebookName', 'Test/Unit02')
      const result = await actions.previewAnkiImport(form)
      assert.equal(result.success, true, result.message)
      assert.equal(result.preview.sampleRows[0].etymologies[0].toLowerCase(), 'interior')
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})


test('Anki alternate katakana headwords save their paired English origins separately', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'anki-variant-origin-'))
  try {
    const { result, committed } = await harness(root, undefined, {
      word: 'エコロジー / エコ', pronunciations: ['Ecology / Eco'],
    })
    assert.equal(result.success, true)
    const saved = committed.find(write => write.name === 'vocabulary' && write.method === 'create').data
    assert.equal(saved.word, 'エコロジー / エコ')
    assert.deepEqual(JSON.parse(saved.pronunciations || '[]'), [])
    assert.deepEqual(JSON.parse(saved.etymologies), ['Ecology / Eco'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

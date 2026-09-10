import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { selectionAttributeSchema, suggestSelectionAttribute } from '../modules/knowledge/vocabulary/domain/selection-attribute.ts'
import { executeAction } from '../lib/actions/result.ts'
import { DomainError } from '../lib/errors/domain-error.ts'
import { joinJapaneseLayoutGaps } from '../modules/language/domain/text.ts'
import { z } from 'zod'

const lexeme = (surface, dictionaryForm, pos, normalizedForm = dictionaryForm) => ({ surface, dictionaryForm, normalizedForm, partsOfSpeech: [pos] })
test('collocation restores final inflection while retaining spelling and particles', () => {
  assert.deepEqual(suggestSelectionAttribute('宝くじに当たり', { a: lexeme('宝くじ', '宝くじ', '名詞', '宝籤'), b: lexeme('に', 'に', '助詞'), c: lexeme('当たり', '当たる', '動詞') }), { expression: '宝くじに当たる', terms: ['宝くじ', '宝籤', '当たり', '当たる'] })
  assert.equal(suggestSelectionAttribute('宝くじに当たりそう', { a: lexeme('当たり', '当たる', '動詞') }).expression, '宝くじに当たりそう')
  assert.equal(suggestSelectionAttribute('宝くじに当たり', {}).expression, '宝くじに当たり')
})
const input = { text: '宝くじに当たる', type: 'collocation', targets: [{ vocabularyId: 'lottery', senseId: 'sense-lottery' }, { vocabularyId: 'hit', senseId: 'sense-hit' }], contextSentence: '宝くじに当たりでもしない限り、一生買えそうにない。', sourceType: 'QUIZ_QUESTION', sourceId: 'question' }
test('attribute validation rejects empty targets, duplicate words and unknown types', () => {
  assert.equal(selectionAttributeSchema.safeParse(input).success, true)
  assert.equal(selectionAttributeSchema.safeParse({ ...input, targets: [] }).success, false)
  assert.equal(selectionAttributeSchema.safeParse({ ...input, targets: [input.targets[0], input.targets[0]] }).success, false)
  assert.equal(selectionAttributeSchema.safeParse({ ...input, type: 'unknown' }).success, false)
})
const source = await readFile(new URL('../modules/knowledge/vocabulary/selection-attribute-actions.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
function harness({ missing = false, fail = false } = {}) {
  let state = { expressions: [], relations: [], links: [], words: (missing ? ['lottery'] : ['lottery', 'hit']).map(id => ({ id, userId: 'current-user', normalizedWord: id, word: id, pronunciationVersion: 1, senses: [{ id: `sense-${id}` }], definitions: [] })) }
  const db = { vocabulary: { findMany: async ({ where }) => { assert.equal(where.userId, 'current-user'); return state.words.filter(w => where.id.in.includes(w.id)) } }, $transaction: async operation => {
    const draft = structuredClone(state)
    const tx = {
      vocabulary: { findMany: async ({ where }) => {
        assert.equal(where.userId, 'current-user')
        return draft.words.filter(w => where.id.in.includes(w.id))
      }, findFirst: async ({ where }) => {
        assert.equal(where.userId, 'current-user')
        return draft.words.find(w => w.normalizedWord === where.normalizedWord) || null
      }, create: async ({ data }) => { const word = { ...data, id: data.word, senses: [], definitions: [] }; draft.words.push(word); return word } },
      vocabularySense: { create: async ({ data }) => { const sense = { id: `sense-${data.vocabularyId}`, order: data.order }; draft.words.find(w => w.id === data.vocabularyId).senses.push(sense); return sense } },
      vocabularyDefinition: { createMany: async ({ data }) => { for (const definition of data) draft.words.find(w => w.id === definition.vocabularyId).definitions.push(definition) } },
      vocabularyExpression: {
        findFirst: async ({ where }) => draft.expressions.find(e => e.senseId === where.senseId && e.text === where.text && e.type === where.type),
        aggregate: async () => ({ _max: { sortOrder: 4 } }),
        create: async ({ data }) => { if (fail && data.senseId === 'sense-hit') throw Error('write failed'); draft.expressions.push(data) },
      },
      vocabularyRelation: {
        findFirst: async ({ where }) => draft.relations.find(e => e.senseId === where.senseId && e.targetText === where.targetText && e.type === where.type),
        aggregate: async () => ({ _max: { sortOrder: 4 } }),
        create: async ({ data }) => draft.relations.push(data),
      },
      vocabularySentence: { upsert: async ({ create }) => ({ id: 'sentence', ...create }) },
      vocabularySentenceLink: { upsert: async ({ create }) => { if (!draft.links.some(l => l.vocabularyId === create.vocabularyId)) draft.links.push(create) } },
    }
    await operation(tx)
    state = draft
  } }
  const stubs = {
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
    'next/cache': { revalidatePath() {} }, zod: { z },
    '@/lib/prisma': { default: db, __esModule: true }, '@/lib/actions/result': { executeAction }, '@/lib/errors/domain-error': { DomainError },
    '@/modules/users/server/current-user': { getCurrentUserId: async () => 'current-user' },
    '@/utils/text/jsonList': { parseJsonStringList: value => JSON.parse(value || '[]'), toJsonStringList: value => JSON.stringify(value) },
    '@/utils/vocabulary/sentenceQuality': { normalizeVocabularySentenceTextKey: text => text },
    './server/pronunciation-service': { batchComputeVocabularyPronunciations: async words => new Map(words.map(word => [word, { segments: [{ text: word }] }])), batchComputeSentencePronunciations: async texts => new Map(texts.map(text => [text, { segments: [{ text }] }])) },
    './domain/pronunciation': { PRONUNCIATION_VERSION: 1 },
    './domain/normalized-word': { normalizeVocabularyWord: text => text.trim() },
    './domain/entry': { inferStructuredPartOfSpeech: () => 'noun' },
    './server/repository': { invalidateVocabularyGroupsCache() {}, resolveVocabularySourceMeta: async () => ({ source: 'N1', sourceUrl: '/practice/n1' }) },
    './domain/selection-attribute': { selectionAttributeSchema },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in stubs)) throw Error(name); return stubs[name] } })
  return { save: exports.saveSelectionAttribute, state: () => state }
}
test('one selection appends to both chosen senses and repeated save is idempotent', async () => {
  const h = harness()
  assert.equal((await h.save(input)).success, true)
  assert.equal((await h.save(input)).success, true)
  assert.equal(h.state().expressions.length, 2)
  assert.equal(h.state().links.length, 2)
  assert.equal(h.state().expressions[0].sortOrder, 5)
  assert.equal(h.state().expressions[1].senseId, 'sense-hit')
})
test('related expressions are relations rather than mislabeled collocations or synonyms', async () => {
  const h = harness()
  assert.equal((await h.save({ ...input, type: 'related' })).success, true)
  assert.equal(h.state().expressions.length, 0)
  assert.equal(h.state().relations[0].type, 'related')
})
test('missing ownership and mismatched senses write nothing', async () => {
  const h = harness({ missing: true })
  assert.equal((await h.save(input)).success, false)
  assert.equal(h.state().expressions.length, 0)
  const other = harness()
  assert.equal((await other.save({ ...input, targets: [{ vocabularyId: 'hit', senseId: 'sense-lottery' }, input.targets[0]] })).success, false)
  assert.equal(other.state().expressions.length, 0)
})
test('failure on second word rolls back the first word and its example', async () => {
  const h = harness({ fail: true })
  assert.equal((await h.save(input)).success, false)
  assert.equal(h.state().expressions.length, 0)
  assert.equal(h.state().links.length, 0)
})

test('Japanese layout gaps do not turn an inflected verb into a standalone noun', () => {
  assert.equal(joinJapaneseLayoutGaps('宝くじに 当たり'), '宝くじに当たり')
  assert.equal(joinJapaneseLayoutGaps('New York に 行く'), 'New York に行く')
})

test('new words and collocations commit together and a repeat reuses the same word', async () => {
  const h = harness()
  const value = { ...input, targets: [{ vocabularyId: 'new:宝くじ', senseId: null, newWord: { word: '宝くじ', reading: 'たからくじ', meaning: '彩票', partOfSpeech: '名词' } }] }
  assert.equal((await h.save(value)).success, true)
  assert.equal((await h.save(value)).success, true)
  assert.equal(h.state().words.filter(w => w.id === '宝くじ').length, 1)
  assert.equal(h.state().expressions.length, 1)
  assert.equal(h.state().words.find(w => w.id === '宝くじ').definitions[0].dictionaryName, 'N1')
})

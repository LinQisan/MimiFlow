import { splitJapaneseEtymologies } from '../modules/language/domain/etymology.ts'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

import { DomainError } from '../lib/errors/domain-error.ts'
import { hasJapanese } from '../modules/language/domain/text.ts'
import { parseVocabularyInspectorEntry } from '../modules/knowledge/vocabulary/domain/inspector-entry-validation.ts'
import { normalizeRelationMetadata } from '../modules/knowledge/vocabulary/domain/relations.ts'
import { dedupeAndRankSentences, normalizeVocabularySentenceTextKey } from '../utils/vocabulary/sentenceQuality.ts'

const source = await readFile(new URL('../modules/knowledge/vocabulary/server/inspector-entry-service.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText

function createHarness() {
  const writes = []
  const state = {
    sentence: {
      id: 'sentence-1',
      text: '先生は学生に本を読ませた。',
      translation: '老师让学生读书。',
      audioFile: null,
      source: '教材',
      sourceUrl: 'https://source.example/item#stored-copy',
      sourceType: 'ARTICLE_TEXT',
      sourceId: 'article-1',
      sourceMetadata: { __mimiflowInspectorOriginalSourceUrl: 'https://source.example/item' },
      provider: null,
      externalId: null,
      pronunciationData: null,
      pronunciationVersion: null,
      _count: { links: 1, grammarExamples: 0 },
    },
  }

  const sentenceLink = () => ({
    id: 'link-1',
    sentenceId: state.sentence.id,
    senseId: 'sense-1',
    meaningIndex: null,
    posTags: '[]',
    sentence: state.sentence,
  })

  const row = () => ({
    id: 'vocabulary-1',
    word: '学ぶ',
    normalizedWord: '学ぶ',
    pronunciations: '[]',
    partsOfSpeech: '[]',
    meanings: '[]',
    grammarPartOfSpeech: 'verb',
    transitivity: null,
    conjugationType: null,
    wordAudio: null,
    tags: [],
    definitions: [],
    senses: [{
      id: 'sense-1',
      order: 0,
      definitions: [],
      examples: [],
      patterns: [],
      expressions: [],
      relations: [],
      notes: [],
    }],
    relations: [],
    sentenceLinks: [sentenceLink()],
    wordbooks: [],
  })

  const tx = {
    vocabulary: {
      findFirst: async ({ where }) => {
        assert.equal(where.userId, 'current-user')
        return { id: 'vocabulary-1' }
      },
      update: async ({ data }) => writes.push({ model: 'vocabulary.update', data }),
      findMany: async () => [],
    },
    wordbook: { findMany: async () => [] },
    vocabularySense: {
      findMany: async () => [{ id: 'sense-1' }],
      update: async ({ where, data }) => writes.push({ model: 'vocabularySense.update', where, data }),
      deleteMany: async args => writes.push({ model: 'vocabularySense.deleteMany', args }),
    },
    vocabularyDefinition: {
      findMany: async () => [],
      deleteMany: async args => writes.push({ model: 'vocabularyDefinition.deleteMany', args }),
    },
    vocabularySentenceLink: {
      findMany: async () => [sentenceLink()],
      deleteMany: async args => writes.push({ model: 'vocabularySentenceLink.deleteMany', args }),
      update: async ({ where, data }) => writes.push({ model: 'vocabularySentenceLink.update', where, data }),
    },
    vocabularySentence: {
      findUnique: async () => null,
      update: async ({ where, data }) => {
        writes.push({ model: 'vocabularySentence.update', where, data })
        Object.assign(state.sentence, data)
      },
    },
    vocabularyPattern: {
      findMany: async () => [],
      deleteMany: async args => writes.push({ model: 'vocabularyPattern.deleteMany', args }),
    },
    vocabularyExpression: {
      findMany: async () => [],
      deleteMany: async args => writes.push({ model: 'vocabularyExpression.deleteMany', args }),
    },
    vocabularyUsageNote: {
      findMany: async () => [],
      deleteMany: async args => writes.push({ model: 'vocabularyUsageNote.deleteMany', args }),
    },
    vocabularyRelation: {
      findMany: async () => [],
      deleteMany: async args => writes.push({ model: 'vocabularyRelation.deleteMany', args }),
    },
    vocabularyTagOnVocabulary: {
      deleteMany: async args => writes.push({ model: 'vocabularyTagOnVocabulary.deleteMany', args }),
    },
    wordbookVocabulary: {
      deleteMany: async args => writes.push({ model: 'wordbookVocabulary.deleteMany', args }),
      createMany: async args => writes.push({ model: 'wordbookVocabulary.createMany', args }),
    },
  }

  const db = {
    $transaction: async operation => operation(tx),
    vocabulary: { findFirst: async () => row() },
    vocabularySentence: { deleteMany: async args => writes.push({ model: 'vocabularySentence.deleteMany', args }) },
    wordbook: { findMany: async () => [] },
  }

  const stubs = {
    '@/modules/language/domain/etymology': { splitJapaneseEtymologies },
    'server-only': {},
    '@prisma/client': { Prisma: { JsonNull: null } },
    '@/lib/prisma': { default: db, __esModule: true },
    '@/lib/errors/domain-error': { DomainError },
    '@/utils/text/jsonList': {
      parseJsonStringList: value => JSON.parse(value || '[]'),
      toJsonStringList: value => JSON.stringify(value),
    },
    '@/utils/vocabulary/sentenceQuality': { normalizeVocabularySentenceTextKey, dedupeAndRankSentences },
    '../domain/normalized-word': { normalizeVocabularyWord: value => value.normalize('NFKC').trim() },
    '../domain/relations': { normalizeRelationMetadata },
    './repository': { normalizeSentencePosTags: value => value || [] },
    '../domain/inspector-entry-validation': { parseVocabularyInspectorEntry, hasClientSenseId: id => id.startsWith('client-') },
    './pronunciation-service': {
      computeSingleVocabularyPronunciation: async () => ({ segments: [] }),
      computeSingleSentencePronunciation: async text => ({ segments: [{ text }] }),
    },
    '../domain/pronunciation': { PRONUNCIATION_VERSION: 1 },
    '@/modules/language/domain/text': { hasJapanese },
    '../domain/jlpt': { filterVocabularyTags: values => values },
  }

  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: name => {
      if (name in stubs) return stubs[name]
      throw new Error(`Unexpected dependency: ${name}`)
    },
    JSON,
    Map,
    Set,
    Promise,
    console: { error() {} },
  })
  return { update: exports.updateFullVocabularyFromInspector, state, writes, db }
}

function draft(sourceUrl, translation) {
  return {
    id: 'vocabulary-1',
    word: '学ぶ',
    pronunciations: [],
    partsOfSpeech: [],
    meanings: [],
    grammarPartOfSpeech: 'verb',
    transitivity: null,
    conjugationType: null,
    wordAudio: null,
    tags: [],
    wordbookIds: [],
    senses: [{ id: 'sense-1' }],
    definitions: [],
    sentences: [{
      id: 'link-1',
      senseId: 'sense-1',
      text: '先生は学生に本を読ませた。',
      translation,
      source: '教材',
      sourceUrl,
      audioFile: null,
      meaningIndex: null,
      posTags: [],
    }],
    patterns: [],
    expressions: [],
    relations: [],
    notes: [],
  }
}

test('unshared sentence edits retain storage URL for the same effective source and accept a changed URL', async () => {
  const sameSource = createHarness()
  await sameSource.update('current-user', draft('https://source.example/item', '更新后的翻译'))
  const retained = sameSource.writes.find(write => write.model === 'vocabularySentence.update')
  assert.equal(retained.data.sourceUrl, 'https://source.example/item#stored-copy')
  assert.equal(retained.data.translation, '更新后的翻译')

  const changedSource = createHarness()
  await changedSource.update('current-user', draft('https://new.example/item', '新的翻译'))
  const changed = changedSource.writes.find(write => write.model === 'vocabularySentence.update')
  assert.equal(changed.data.sourceUrl, 'https://new.example/item')
  assert.equal(changed.data.translation, '新的翻译')
  assert.equal(changedSource.state.sentence.sourceUrl, 'https://new.example/item')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inferStructuredPartOfSpeech,
  structuredPartOfSpeechLabel,
} from '../modules/knowledge/vocabulary/domain/entry.ts'
import {
  serializeVocabularyEntryPosTags,
  vocabularyEntryDraftSchema,
} from '../modules/knowledge/vocabulary/domain/entry-validation.ts'
import {
  normalizeRelationMetadata,
} from '../modules/knowledge/vocabulary/domain/relations.ts'

const validDraft = {
  vocabularyId: 'vocabulary-1',
  word: 'ねじれる',
  reading: 'ねじれる',
  grammarPartOfSpeech: 'verb',
  transitivity: 'intransitive',
  conjugationType: '一段',
  tags: ['抽象词汇'],
  senses: [
    {
      id: 'sense-1',
      definitions: [{ id: 'definition-1', language: 'zh', text: '物理上扭曲' }],
      examples: [],
      patterns: [{ id: 'pattern-1', text: 'Nがねじれる', meaning: '' }],
      expressions: [{ id: 'expression-1', type: 'collocation', text: '関係がねじれる' }],
      relations: [],
      notes: [],
    },
    {
      id: 'sense-2',
      definitions: [{ id: 'definition-2', language: 'zh', text: '性格或思想扭曲' }],
      examples: [],
      patterns: [],
      expressions: [],
      relations: [{ id: 'relation-1', type: 'synonym', targetVocabularyId: 'vocabulary-2', targetText: 'ひねくれる' }],
      notes: [{ id: 'note-1', type: 'restriction', text: '良いことにはあまり使わない。' }],
    },
  ],
  relations: [{ id: 'relation-2', type: 'related', targetVocabularyId: null, targetText: 'ゆがむ' }],
}

test('structured vocabulary draft keeps sense-owned content separate', () => {
  const result = vocabularyEntryDraftSchema.safeParse(validDraft)
  assert.equal(result.success, true)
  assert.equal(result.data.senses[0].definitions[0].text, '物理上扭曲')
  assert.equal(result.data.senses[1].relations[0].targetVocabularyId, 'vocabulary-2')
  assert.equal(result.data.senses[0].relations.length, 0)
})

test('relations allow an unbound targetText fallback', () => {
  const result = vocabularyEntryDraftSchema.safeParse(validDraft)
  assert.equal(result.success, true)
  assert.equal(result.data.relations[0].targetVocabularyId, null)
  assert.equal(result.data.relations[0].targetText, 'ゆがむ')
})

test('example posTags are optional, trimmed, and bounded', () => {
  const draft = structuredClone(validDraft)
  draft.senses[0].examples = [{
    id: 'example-1',
    text: 'ねじれた糸を戻す。',
    source: '手动录入',
    sourceUrl: '#',
    posTags: [' 名詞 ', 'サ変可能'],
  }]

  const result = vocabularyEntryDraftSchema.safeParse(draft)
  assert.equal(result.success, true)
  assert.deepEqual(result.data.senses[0].examples[0].posTags, ['名詞', 'サ変可能'])

  const omitted = structuredClone(draft)
  delete omitted.senses[0].examples[0].posTags
  assert.equal(vocabularyEntryDraftSchema.safeParse(omitted).success, true)

  const emptyTag = structuredClone(draft)
  emptyTag.senses[0].examples[0].posTags = ['  ']
  assert.equal(vocabularyEntryDraftSchema.safeParse(emptyTag).success, false)

  const tooMany = structuredClone(draft)
  tooMany.senses[0].examples[0].posTags = Array.from({ length: 21 }, (_, index) => `tag-${index}`)
  assert.equal(vocabularyEntryDraftSchema.safeParse(tooMany).success, false)
})

test('example posTags persistence preserves omitted values and clears explicit empties', () => {
  assert.equal(
    serializeVocabularyEntryPosTags(undefined, '[" 名詞 ", "名詞", "サ変可能"]'),
    '["名詞","サ変可能"]',
  )
  assert.equal(
    serializeVocabularyEntryPosTags([' 名詞 ', '名詞', ' サ変可能 ']),
    '["名詞","サ変可能"]',
  )
  assert.equal(serializeVocabularyEntryPosTags([], '["名詞"]'), null)
})

test('textbook relation metadata stays separate from the real vocabulary word', () => {
  const draft = structuredClone(validDraft)
  draft.senses[0].relations = [
    {
      id: 'compound-relation',
      type: 'compound',
      targetVocabularyId: null,
      targetText: '依存心',
      targetReading: 'いぞんしん',
      pattern: '～心',
    },
    {
      id: 'related-relation',
      type: 'related',
      targetVocabularyId: 'vocabulary-3',
      targetText: '頼る',
      targetReading: 'たよる',
      marker: 'が',
    },
  ]

  const result = vocabularyEntryDraftSchema.safeParse(draft)
  assert.equal(result.success, true)
  assert.equal(result.data.senses[0].relations[0].type, 'compound')
  assert.equal(result.data.senses[0].relations[0].pattern, '～心')
  assert.equal(result.data.senses[0].relations[1].targetText, '頼る')
  assert.equal(result.data.senses[0].relations[1].marker, 'が')
  assert.equal(result.data.senses[0].relations[1].targetText.includes('が'), false)
})

test('relations reject an empty target', () => {
  const invalid = structuredClone(validDraft)
  invalid.relations[0].targetText = ''
  const result = vocabularyEntryDraftSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

test('saving relations discards fields that do not belong to the relationship type', () => {
  const draft = structuredClone(validDraft)
  draft.relations = [
    { id: 'related', type: 'related', targetText: '頼る', targetReading: 'たよる', marker: ' が ', pattern: '～に頼る' },
    { id: 'compound', type: 'compound', targetText: '依存症', marker: 'が', pattern: ' ～症 ' },
    { id: 'synonym', type: 'synonym', targetText: '頼る', marker: 'が', pattern: '～症' },
  ]
  const { relations } = vocabularyEntryDraftSchema.parse(draft)
  assert.equal(relations[0].marker, 'が')
  assert.equal(relations[0].pattern, null)
  assert.equal(relations[1].pattern, '～症')
  assert.equal(relations[1].marker, null)
  assert.equal(relations[2].pattern, null)
  assert.equal(relations[2].marker, null)
})

test('changing relation type clears now-inapplicable metadata', () => {
  const related = normalizeRelationMetadata({ type: 'related', targetText: '依存心', pattern: '～心' })
  assert.equal(related.pattern, null)
  const compound = normalizeRelationMetadata({ type: 'compound', targetText: '頼る', marker: 'が' })
  assert.equal(compound.marker, null)
})

test('legacy Japanese parts of speech map to structured grammar', () => {
  assert.equal(inferStructuredPartOfSpeech(['名詞']), 'noun')
  assert.equal(inferStructuredPartOfSpeech(['自動詞']), 'verb')
  assert.equal(inferStructuredPartOfSpeech(['ナ形容詞']), 'na_adjective')
  assert.equal(structuredPartOfSpeechLabel('adnominal'), '連体詞')
})

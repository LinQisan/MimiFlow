import assert from 'node:assert/strict'
import test from 'node:test'

import { hydrateVocabularyPayload } from '../modules/knowledge/vocabulary/domain/payload.ts'

test('compact vocabulary payload restores sentence and wordbook references without I/O', () => {
  const sentence = {
    id: 'sentence-1',
    text: '石油を輸入する。',
    source: '阅读',
    sourceUrl: '/reading/articles/example',
    translation: '进口石油。',
  }
  const folders = [{
    id: 'book-1',
    name: '第一单元',
    seriesId: 'series-1',
    seriesName: 'N2 词汇',
    count: 1,
  }]
  const groupedData = {
    日语: [{
      id: 'vocabulary-1',
      word: '石油',
      readingAudios: [{ reading: 'せきゆ', audioFile: '/audios/sekiyu.mp3' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      sentencePool: [sentence],
      sentenceIds: [sentence.id],
      wordbooks: [{ id: 'book-1', jlpt: 'N2' }],
      wordbookSources: [{
        id: 'book-1',
        jlpt: 'N2',
        recordIds: ['vocabulary-1'],
        meanings: ['石油'],
        sentenceIds: [sentence.id],
      }],
      senses: [{
        id: 'sense-1',
        order: 0,
        definitions: [{ id: 'definition-1', language: 'zh', text: '石油' }],
        exampleIds: [sentence.id],
        patterns: [],
        expressions: [],
        relations: [],
        notes: [],
      }],
    }],
  }

  const hydrated = hydrateVocabularyPayload(groupedData, folders).日语[0]
  assert.deepEqual(hydrated.readingAudios, [{ reading: 'せきゆ', audioFile: '/audios/sekiyu.mp3' }])
  assert.deepEqual(hydrated.wordbooks, [{
    id: 'book-1',
    jlpt: 'N2',
    name: '第一单元',
    pathLabel: 'N2 词汇 / 第一单元',
  }])
  assert.deepEqual(hydrated.sentences, [sentence])
  assert.deepEqual(hydrated.senses?.[0].examples, [sentence])
  assert.deepEqual(hydrated.wordbookSources?.[0].sentences, [sentence])
  assert.strictEqual(hydrated.sentences[0], hydrated.senses?.[0].examples[0])
  assert.strictEqual(
    hydrated.sentences[0],
    hydrated.wordbookSources?.[0].sentences[0],
  )
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseVocabularyCsvDocument,
  parseVocabularyCsvSentences,
  serializeVocabularyCsv,
  serializeVocabularyCsvSentences,
  splitVocabularyCsvList,
  splitVocabularyCsvPartsOfSpeech,
} from '../modules/knowledge/vocabulary/domain/csv.ts'

test('vocabulary CSV round-trips editable metadata without audio', () => {
  const csv = serializeVocabularyCsv([{
    词条ID: 'word-1',
    单词: '=語彙,「テスト」',
    语言: 'ja',
    注音: 'ごい',
    词源: 'interior | inside',
    词性: '名詞 | 固有名詞',
    JLPT: 'N2',
    标签: 'カタカナ語',
    释义: '词汇\n测试',
    例句: '語彙を勉強する。',
    例句词性: '名詞,サ変可能',
  }])
  const [row] = parseVocabularyCsvDocument(csv).rows

  assert.equal(row.单词, '=語彙,「テスト」')
  assert.equal(row.词源, 'interior | inside')
  assert.deepEqual(splitVocabularyCsvList(row.词性), ['名詞', '固有名詞'])
  assert.equal(row.JLPT, 'N2')
  assert.deepEqual(splitVocabularyCsvList(row.标签), ['カタカナ語'])
  assert.deepEqual(splitVocabularyCsvPartsOfSpeech(row.例句词性), [
    '名詞',
    'サ変可能',
  ])
  assert.deepEqual(splitVocabularyCsvPartsOfSpeech('名詞，サ変可能'), [
    '名詞',
    'サ変可能',
  ])
  assert.equal(csv.includes('音频'), false)
})

test('vocabulary CSV rejects missing identity columns', () => {
  assert.throws(
    () => parseVocabularyCsvDocument('单词,词性\n語彙,名詞\n'),
    /缺少列/,
  )
})

test('vocabulary CSV keeps old exports importable without sentence columns', () => {
  const document = parseVocabularyCsvDocument(
    '词条ID,单词,语言,注音,词性,标签,释义\nword-1,語彙,ja,ごい,名詞,,词汇\n',
  )
  assert.equal(document.headers.includes('例句'), false)
  assert.equal(document.rows[0].例句, '')
  assert.equal(document.rows[0].例句词性, '')
})

test('vocabulary CSV aligns multiple sentences and comma-separated parts of speech', () => {
  const serialized = serializeVocabularyCsvSentences([
    { text: '語彙を勉強する。', posTags: ['名詞', 'サ変可能'] },
    { text: '新しい語彙を覚えた。', posTags: ['名詞'] },
    { text: '語彙を勉強する。', posTags: ['学習語彙'] },
  ])
  assert.deepEqual(serialized, {
    例句: '語彙を勉強する。\n新しい語彙を覚えた。',
    例句词性: '名詞,サ変可能,学習語彙\n名詞',
  })
  assert.deepEqual(
    parseVocabularyCsvSentences(serialized.例句, serialized.例句词性),
    [
      { text: '語彙を勉強する。', posTags: ['名詞', 'サ変可能', '学習語彙'] },
      { text: '新しい語彙を覚えた。', posTags: ['名詞'] },
    ],
  )
})

test('vocabulary CSV preserves blank sentence POS lines for row alignment', () => {
  const csv = serializeVocabularyCsv([{
    词条ID: 'word-1',
    单词: '語彙',
    语言: 'ja',
    注音: 'ごい',
    词性: '名詞',
    JLPT: 'N2',
    标签: '',
    释义: '词汇',
    例句: '最初の例文。\n次の例文。',
    例句词性: '\n名詞,サ変可能',
  }])
  const [row] = parseVocabularyCsvDocument(csv).rows
  assert.deepEqual(parseVocabularyCsvSentences(row.例句, row.例句词性), [
    { text: '最初の例文。', posTags: [] },
    { text: '次の例文。', posTags: ['名詞', 'サ変可能'] },
  ])
})

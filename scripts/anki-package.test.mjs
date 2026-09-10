import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatAnkiWordbookSource,
  inferAnkiNotebookPath,
  resolveAnkiNotebookPath,
} from '../modules/import/domain/anki-package.ts'

test('infers the two-level N2 vocabulary training path from an Anki deck', () => {
  assert.equal(
    inferAnkiNotebookPath(
      ['日语 / 单词 / N2 / Unit 02 动词A'],
      '日语__单词__N2__Unit 02 动词A.apkg',
    ),
    'N2語彙トレーニング/Unit02 动词A',
  )
})

test('formats Anki sentence sources with their series and leaf wordbook', () => {
  assert.equal(
    formatAnkiWordbookSource('N2語彙トレーニング', 'Unit01 名詞A'),
    'N2語彙トレーニング › Unit01 名詞A',
  )
  assert.equal(formatAnkiWordbookSource('', 'Unit01 名詞A'), 'Unit01 名詞A')
})

test('falls back to the APKG filename and declines unknown deck layouts', () => {
  assert.equal(
    inferAnkiNotebookPath([], '日语__单词__N3__Unit 7 副词.apkg'),
    'N3語彙トレーニング/Unit07 副词',
  )
  assert.equal(inferAnkiNotebookPath(['日语 / 单词'], 'words.apkg'), '')
})

test('keeps an explicitly entered new group when the wordbook comes from APKG inference', () => {
  assert.deepEqual(
    resolveAnkiNotebookPath({
      requestedSeriesTitle: '我的 N2 分组',
      suggestedNotebookName: 'N2語彙トレーニング/Unit02 动词A',
    }),
    {
      seriesTitle: '我的 N2 分组',
      wordbookTitle: 'Unit02 动词A',
      notebookName: '我的 N2 分组/Unit02 动词A',
    },
  )
})

test('selected groups override typed and inferred group names', () => {
  assert.deepEqual(
    resolveAnkiNotebookPath({
      selectedSeriesTitle: '已有分组',
      requestedSeriesTitle: '忽略的分组',
      requestedWordbookTitle: '自定义词表',
      suggestedNotebookName: '推断分组/推断词表',
    }),
    {
      seriesTitle: '已有分组',
      wordbookTitle: '自定义词表',
      notebookName: '已有分组/自定义词表',
    },
  )
})

test('returns an incomplete target when neither input nor inference supplies both levels', () => {
  assert.deepEqual(
    resolveAnkiNotebookPath({ requestedSeriesTitle: '新分组' }),
    {
      seriesTitle: '新分组',
      wordbookTitle: '',
      notebookName: '',
    },
  )
})

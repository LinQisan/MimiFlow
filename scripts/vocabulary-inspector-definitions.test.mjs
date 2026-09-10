import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeInspectorDefinitions } from '../modules/knowledge/vocabulary/domain/inspector-definitions.ts'

test('inspector preserves canonical and legacy definition IDs and languages', () => {
  const definitions = ['zh', 'JA', 'en'].map((language, index) => ({
    id: `existing-${index}`, language, dictionaryName: '辞典', definition: `意味${index}`,
  }))
  assert.deepEqual(normalizeInspectorDefinitions(definitions), definitions)
})

test('editing, reordering and deleting definitions preserves surviving identity', () => {
  const result = normalizeInspectorDefinitions([
    { id: 'second', language: 'zh', dictionaryName: '  用户编辑 ', definition: ' 新释义 ' },
    { id: 'deleted', language: 'ja', dictionaryName: '', definition: ' ' },
    { id: 'first', language: 'ja', dictionaryName: '辞典', definition: '説明' },
  ])
  assert.deepEqual(result.map(item => [item.id, item.definition]), [['second', '新释义'], ['first', '説明']])
})

test('new definitions have no invented persisted identity', () => {
  assert.deepEqual(normalizeInspectorDefinitions([{ language: '', dictionaryName: '', definition: '意味' }]),
    [{ language: 'zh', dictionaryName: '', definition: '意味' }])
})

const { resolveInspectorMeaningDisplay } = await import('../modules/knowledge/vocabulary/domain/inspector-definitions.ts')
const migrated = { id: 'legacy', language: 'zh', dictionaryName: '旧数据迁移', definition: '原来的中文释义' }

test('migrated Chinese definitions supply missing meanings without duplication', () => {
  assert.deepEqual(resolveInspectorMeaningDisplay([], [migrated]), { meanings: ['原来的中文释义'], definitions: [] })
  assert.deepEqual(resolveInspectorMeaningDisplay(['原来的中文释义'], [migrated]), { meanings: ['原来的中文释义'], definitions: [] })
})

test('existing meanings and distinct sourced definitions are retained', () => {
  const sourced = { ...migrated, id: 'dictionary', dictionaryName: '辞典' }
  assert.deepEqual(resolveInspectorMeaningDisplay(['已有释义'], [migrated, sourced]), {
    meanings: ['已有释义'], definitions: [migrated, sourced],
  })
  assert.deepEqual(resolveInspectorMeaningDisplay([], [sourced]), { meanings: [], definitions: [sourced] })
})

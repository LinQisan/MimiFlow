import assert from 'node:assert/strict'
import test from 'node:test'
import { selectSentenceOccurrenceReading } from '../modules/knowledge/vocabulary/domain/sentence-reading.ts'

test('personal alternatives follow each occurrence without overriding authored readings', () => {
  const text = '便と便'
  const data = { segments: [{ text: '便', reading: 'べん' }, { text: 'と' }, { text: '便', reading: 'びん' }] }
  const select = (start, candidates, cached = data) => selectSentenceOccurrenceReading(text, start, '便', candidates, 'びん', cached)
  assert.equal(select(0, ['びん', 'べん']), 'べん')
  assert.equal(select(2, ['びん', 'べん']), 'びん')
  assert.equal(select(0, ['びん']), 'びん')
  assert.equal(select(0, ['ビン', 'ベン']), 'ベン')
  assert.equal(select(0, ['びん', 'べん'], { segments: [{ text: '古い便', reading: 'べん' }] }), 'びん')
  assert.equal(select(0, ['びん', 'べん'], { segments: [{ text, reading: 'べんとびん' }] }), 'びん')
})

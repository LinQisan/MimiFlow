import assert from 'node:assert/strict'
import test from 'node:test'
import { dedupeAndRankSentences } from '../utils/vocabulary/sentenceQuality.ts'

const silent = {
  id: 'old', text: 'ボールをキャッチする。', source: 'Unit09 カタカナB',
  sourceUrl: '/vocabulary/wordbooks/old', meaningIndex: 0, audioFile: null,
}
const recorded = {
  ...silent, id: 'new', sourceUrl: '/vocabulary/wordbooks/current',
  audioFile: '/audios/vocabulary/N2語彙トレーニング/Unit09 カタカナB/n2-01-61-20.mp3',
}

test('duplicate imported examples retain audio regardless of input order', () => {
  for (const rows of [[silent, recorded], [recorded, silent]]) {
    assert.deepEqual(dedupeAndRankSentences(rows), [recorded])
  }
})

test('blank audio does not replace a playable duplicate or change stable ties', () => {
  const blank = { ...silent, audioFile: '  ' }
  assert.deepEqual(dedupeAndRankSentences([recorded, blank]), [recorded])
  assert.deepEqual(dedupeAndRankSentences([silent, blank]), [silent])
  const alternate = { ...recorded, id: 'alternate', audioFile: '/audios/alternate.mp3' }
  assert.deepEqual(dedupeAndRankSentences([recorded, alternate]), [recorded])
})

test('audio tie-breaking preserves source priority and distinct example ranking', () => {
  const preferred = { ...silent, sourceType: 'AUDIO_DIALOGUE' }
  assert.deepEqual(dedupeAndRankSentences([recorded, preferred]), [preferred])
  const short = { ...silent, id: 'short', text: 'はい。' }
  assert.deepEqual(dedupeAndRankSentences([recorded, short]), [short, recorded])
})

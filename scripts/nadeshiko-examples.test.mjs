import assert from 'node:assert/strict'
import test from 'node:test'
import { mapNadeshikoResponse, nadeshikoSourceLabel, addInputSchema } from '../modules/knowledge/vocabulary/nadeshiko/domain.ts'
import { dedupeAndRankSentences } from '../utils/vocabulary/sentenceQuality.ts'
import { formatVocabularySentenceSource } from '../utils/vocabulary/sourceDisplay.ts'

test('maps public IDs and included media, keeping original text and millisecond times', () => {
  const [example] = mapNadeshikoResponse({
    segments: [{
      publicId: 'clip-a', mediaPublicId: 'media-a', textJa: { content: '彼女に憧れる。', highlight: '<mark>彼女</mark>に憧れる。' },
      textEn: { content: 'I admire her.' }, episode: 4, startTimeMs: 511200, endTimeMs: 513000,
      urls: { audioUrl: 'https://example.com/clip.mp3', imageUrl: 'https://example.com/image.webp', videoUrl: 'https://example.com/clip.mp4' },
    }],
    includes: { media: { 'media-a': { publicId: 'media-a', nameJa: '作品', nameEn: 'Title' } } },
  })
  assert.equal(example.externalId, 'clip-a')
  assert.equal(example.sentence, '彼女に憧れる。')
  assert.equal(example.media.titleJa, '作品')
  assert.equal(example.audioUrl, 'https://example.com/clip.mp3')
  assert.equal(example.endTimeMs, 513000)
  assert.equal(nadeshikoSourceLabel(example), '作品 · 第 4 集 · 08:31')
})

test('missing metadata and audio do not discard a sentence; unsafe URLs never reach the UI', () => {
  const [example] = mapNadeshikoResponse({ segments: [{ publicId: 'clip', textJa: { content: '猫。' }, urls: { audioUrl: 'javascript:alert(1)' } }] })
  assert.equal(example.audioUrl, null)
  assert.equal(example.media.id, null)
  assert.equal(nadeshikoSourceLabel(example), 'Nadeshiko')
  assert.equal(nadeshikoSourceLabel({ ...example, episode: 0, startTimeMs: 0 }), '电影 / 特别篇 · 00:00')
})

test('rejects malformed response identities and restricts add input to references', () => {
  assert.throws(() => mapNadeshikoResponse({ results: [] }))
  assert.throws(() => mapNadeshikoResponse({ segments: [{ textJa: { content: '猫。' } }] }))
  assert.deepEqual(mapNadeshikoResponse({ segments: [] }), [])
  assert.equal(addInputSchema.safeParse({ vocabularyId: 'v', query: '猫', externalId: 'clip', audioFile: '/secret' }).success, false)
  assert.equal(addInputSchema.safeParse({ vocabularyId: '', query: '猫', externalId: 'clip' }).success, false)
})

test('deduplicates stable segment IDs but preserves identical dialogue from distinct sources', () => {
  const clip = { publicId: 'a', textJa: { content: '猫。' } }
  assert.equal(mapNadeshikoResponse({ segments: [clip, clip, { ...clip, publicId: 'b' }] }).length, 2)
  const sentences = ['a', 'b'].map(id => ({ text: '猫。', sourceUrl: `https://nadeshiko.co/sentence/${id}`, source: 'Nadeshiko · 作品 · 00:00' }))
  const visible = dedupeAndRankSentences([{ text: '猫。', source: '教材' }, ...sentences, sentences[0]], 1)
  assert.equal(visible.filter(item => item.sourceUrl).length, 2)
  assert.equal(formatVocabularySentenceSource(sentences[0]), sentences[0].source)
})

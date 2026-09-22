import assert from 'node:assert/strict'
import test from 'node:test'
import { getAudioSearchFields, audioSearchSnippet } from '../modules/search/audio-materials.ts'

test('audio search reads listening and shadowing source text without vocabulary links', () => {
  for (const type of ['LISTENING', 'SPEAKING']) {
    const fields = getAudioSearchFields(type, {
      audioFile: '/audios/not-searchable.mp3',
      description: '説明', transcript: '全文',
      dialogues: [{ stableId: 'line-1', text: 'アリについて話しています。', note: '蚂蚁' }],
    })
    assert.deepEqual(fields, ['説明', '全文', 'アリについて話しています。', '蚂蚁'])
    assert.equal(audioSearchSnippet(fields, ['アリ']), 'アリについて話しています。')
  }
})

test('audio snippets expose a hit beyond the beginning of a long transcript', () => {
  const snippet = audioSearchSnippet(['あ'.repeat(200) + 'アリの巣' + 'い'.repeat(200)], ['アリ'])
  assert.ok(snippet.includes('アリの巣'))
  assert.ok(snippet.startsWith('…'))
  assert.ok(snippet.endsWith('…'))
  assert.ok(snippet.length <= 122)
  assert.equal(audioSearchSnippet([], ['アリ']), '')
})

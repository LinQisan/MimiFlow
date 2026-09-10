import assert from 'node:assert/strict'
import test from 'node:test'
import { planAnkiReadingAudio, changedAnkiFields } from '../modules/import/domain/anki-reading-audio.ts'
import { dedupeVocabularyReadingAudios } from '../modules/knowledge/vocabulary/domain/reading-audio.ts'

test('same word in separate notes retains distinct recorded readings', () => {
  const ben = planAnkiReadingAudio('word', ['べん'], '/audios/44_Unit7-23.mp3')
  const bin = planAnkiReadingAudio('word', ['びん'], '/audios/44_Unit7-25.mp3')
  assert.equal(ben.reading, 'べん')
  assert.equal(bin.reading, 'びん')
  assert.notEqual(ben.audioFile, bin.audioFile)
  assert.deepEqual(planAnkiReadingAudio('word', ['べん'], ben.audioFile), ben)
  assert.equal(planAnkiReadingAudio('word', ['べん'], ''), null)
  assert.equal(planAnkiReadingAudio('word', ['べん'], '  '), null)
})
test('unchanged fields produce no write; only changed fields are updated', () => {
  assert.deepEqual(changedAnkiFields({ audioFile: '/old.mp3', text: '便' }, { audioFile: '/old.mp3', text: '便' }), {})
  assert.deepEqual(changedAnkiFields({ audioFile: null, text: '便' }, { audioFile: '/new.mp3', text: '便' }), { audioFile: '/new.mp3' })
})

test('grouped vocabulary keeps distinct recordings and removes duplicate pairs', () => {
  assert.deepEqual(
    dedupeVocabularyReadingAudios([
      { reading: ' べん ', audioFile: '/audios/ben.mp3' },
      { reading: 'びん', audioFile: '/audios/bin.mp3' },
      { reading: 'べん', audioFile: '/audios/ben.mp3' },
      { reading: '', audioFile: '/audios/ignored.mp3' },
    ]),
    [
      { reading: 'べん', audioFile: '/audios/ben.mp3' },
      { reading: 'びん', audioFile: '/audios/bin.mp3' },
    ],
  )
})

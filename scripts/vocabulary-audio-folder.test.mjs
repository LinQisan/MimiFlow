import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVocabularyAudioFolder,
  collectExclusiveWordbookAudioPaths,
} from '../utils/vocabulary/audioFolder.ts'

test('vocabulary audio directory mirrors series and wordbook hierarchy', () => {
  assert.equal(
    buildVocabularyAudioFolder('N2語彙トレーニング', 'Unit03 形容词A'),
    'vocabulary/N2語彙トレーニング/Unit03 形容词A',
  )
  assert.equal(
    buildVocabularyAudioFolder('红宝书/新版', 'N2:*'),
    'vocabulary/红宝书-新版/N2',
  )
})

test('wordbook deletion only selects exclusive word audio and its sentence audio', () => {
  assert.deepEqual(
    collectExclusiveWordbookAudioPaths(
      'unit-03',
      [
        {
          wordAudio: '/audios/vocabulary/training/unit-03/only.mp3',
          wordbookIds: ['unit-03'],
        },
        {
          wordAudio: '/audios/vocabulary/training/unit-03/shared.mp3',
          wordbookIds: ['unit-03', 'red-book-n2'],
        },
      ],
      ['/audios/vocabulary/training/unit-03/sentence.mp3'],
    ),
    [
      '/audios/vocabulary/training/unit-03/only.mp3',
      '/audios/vocabulary/training/unit-03/sentence.mp3',
    ],
  )
})

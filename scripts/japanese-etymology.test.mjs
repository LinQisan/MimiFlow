import { dedupeVocabularyReadingAudios } from '../modules/knowledge/vocabulary/domain/reading-audio.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { splitJapaneseEtymologies } from '../modules/language/domain/etymology.ts'

test('katakana loanwords separate English origin from Japanese readings', () => {
  assert.deepEqual(splitJapaneseEtymologies('インテリア', ['Interior', 'いんてりあ']), {
    pronunciations: ['いんてりあ'], etymologies: ['Interior'],
  })
  assert.deepEqual(splitJapaneseEtymologies('フリーサイズ', ['free size']), {
    pronunciations: [], etymologies: ['free size'],
  })
  assert.deepEqual(splitJapaneseEtymologies('メーカー', ['Maker / Manufacturer']), {
    pronunciations: [], etymologies: ['Maker / Manufacturer'],
  })
})

test('other languages, kana, IPA and labelled romanization remain pronunciations', () => {
  for (const [word, readings] of [
    ['interior', ['/ɪnˈtɪəriə/']], ['中文', ['zhongwen']], ['東京', ['Tokyo']],
    ['インテリア', ['いんてりあ', '/inteɾia/', 'romaji: interia', 'インテリア']],
    ['コンピューター化', ['computer']],
  ]) assert.deepEqual(splitJapaneseEtymologies(word, readings), { pronunciations: readings, etymologies: [] })
})

test('loanword endings and optional kana preserve the authored word and real readings', () => {
  for (const [word, origin] of [
    ['ロマンチックな', 'Romantic'], ['ユニークな', 'Unique'],
    ['ルーズな', 'Loose'], ['ダブる', 'Double'], ['コピーする', 'Copy'],
    ['インフォ（ー）メーション', 'Information'],
    ['ロマンチック(な)', 'Romantic'],
  ]) {
    const result = splitJapaneseEtymologies(word, [origin, 'ろまんちっくな'])
    assert.deepEqual(result, { pronunciations: ['ろまんちっくな'], etymologies: [origin] })
    assert.deepEqual(splitJapaneseEtymologies(word, result.pronunciations, result.etymologies), result)
  }
  for (const word of ['な', 'する', 'ロマンチックな人', 'ロマンチックではない']) {
    assert.deepEqual(splitJapaneseEtymologies(word, ['Romantic']), { pronunciations: ['Romantic'], etymologies: [] })
  }
})

test('alternate katakana headwords classify source spellings without changing authored variants', () => {
  for (const word of ['エコロジー / エコ', 'エコロジー\n/\nエコ', 'エコロジー／エコ']) {
    assert.deepEqual(splitJapaneseEtymologies(word, ['Ecology / Eco', 'えころじー / えこ']), {
      pronunciations: ['えころじー / えこ'], etymologies: ['Ecology / Eco'],
    })
  }
  assert.deepEqual(splitJapaneseEtymologies('エコ / ecology', ['eco']), {
    pronunciations: ['eco'], etymologies: [],
  })
  assert.deepEqual(splitJapaneseEtymologies(' / ', ['Eco']), {
    pronunciations: ['Eco'], etymologies: [],
  })
})

test('reclassification is idempotent, preserves spelling and authored order', () => {
  const result = splitJapaneseEtymologies('コーナー', ['Corner', 'corner', 'こーなー'], [' corner ', 'Angle'])
  assert.deepEqual(result, { pronunciations: ['こーなー'], etymologies: ['corner', 'Angle'] })
  assert.deepEqual(splitJapaneseEtymologies('コーナー', result.pronunciations, result.etymologies), result)
  assert.deepEqual(splitJapaneseEtymologies('ｲﾝﾃﾘｱ', ['Interior']), { pronunciations: [], etymologies: ['Interior'] })
})


test('legacy audio keeps its file while its button names the Japanese word', () => {
  assert.deepEqual(dedupeVocabularyReadingAudios([
    { reading: 'Interior', audioFile: '/audios/personal.mp3' },
    { reading: 'インテリア', audioFile: '/audios/personal.mp3' },
  ], 'インテリア'), [{ reading: 'インテリア', audioFile: '/audios/personal.mp3' }])
})

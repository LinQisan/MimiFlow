import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRedBookRecords,
  mergeRedBookRecords,
  normalizeAudioReference,
  parseSharedStrings,
  parseWorksheetRows,
  resolveHeadword,
  resolveImportedAudio,
  resolvePartsOfSpeech,
} from './import-red-book-vocabulary.mjs'

test('red-book workbook parser resolves shared strings and relevant cells', () => {
  const strings = parseSharedStrings(
    '<sst><si><t>あう</t></si><si><r><t>会</t></r><r><t>う</t></r></si></sst>',
  )
  const rows = parseWorksheetRows(
    '<worksheet><sheetData><row r="3"><c r="B3"/><c r="C3" t="s"><v>0</v></c><c r="D3" t="s"><v>1</v></c><c r="E3"/><c r="X3" t="inlineStr"><is><t>N5</t></is></c></row></sheetData></worksheet>',
    strings,
  )
  assert.deepEqual(strings, ['あう', '会う'])
  assert.deepEqual(rows, [{
    rowNumber: 3,
    values: { B: '', C: 'あう', D: '会う', E: '', X: 'N5' },
  }])
})

test('red-book metadata keeps written headwords, readings, levels and source POS', () => {
  const records = buildRedBookRecords([
    {
      rowNumber: 3,
      values: {
        A: '1', C: 'あう', D: '会う', E: 'A1', G: 'AV', X: 'N5',
        O: '\\红宝书MP3分割\\01 n5-あ (', P: '1', Q: ').mp3',
      },
    },
  ])
  assert.equal(resolveHeadword('あう', '会う'), '会う')
  assert.equal(resolveHeadword('アイス', 'ice'), 'アイス')
  assert.equal(resolveHeadword('がっかり', 'がっくり'), 'がっかり')
  assert.deepEqual(resolvePartsOfSpeech({ E: 'A2', G: 'AV', H: 'D' }), [
    'な形容詞', '副詞', '畳語',
  ])
  assert.deepEqual(records[0], {
    sourceOrder: 1,
    rowNumber: 3,
    level: 'N5',
    word: '会う',
    reading: 'あう',
    partsOfSpeech: ['い形容詞', '副詞'],
    sourceAudio: '01 n5-あ (1).mp3',
    audioFileName: '01-n5-あ-1.mp3',
    key: '会う\u0000あう',
  })
  assert.equal(normalizeAudioReference('12 n2-し (140).mp4'), '12 n2-し (140).mp3')
})

test('same word and reading is one entry linked to every source level', () => {
  const merged = mergeRedBookRecords([
    { key: 'ああ\u0000ああ', level: 'N5', sourceOrder: 1, partsOfSpeech: [], sourceAudio: 'a.mp3' },
    { key: 'ああ\u0000ああ', level: 'N4', sourceOrder: 2, partsOfSpeech: ['副詞'], sourceAudio: 'b.mp3' },
  ])
  assert.equal(merged.length, 1)
  assert.deepEqual(merged[0].levels, ['N4', 'N5'])
  assert.deepEqual(merged[0].partsOfSpeech, ['副詞'])
})

test('existing personal audio is never overwritten by Red Book audio', () => {
  const oldAudio = '/audios/vocabulary/anki/legacy/old.mp3'
  const redBookAudio = '/audios/vocabulary/red-book/N2/new.mp3'
  assert.equal(resolveImportedAudio(oldAudio, redBookAudio, false), oldAudio)
  assert.equal(resolveImportedAudio('', redBookAudio, false), redBookAudio)
  assert.equal(resolveImportedAudio(oldAudio, redBookAudio, true), redBookAudio)
})

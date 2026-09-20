import assert from 'node:assert/strict'
import test from 'node:test'
import { parseListeningOptionText } from '../modules/import/domain/listening-option-parser.ts'

test('unnumbered options split on line breaks, ignoring empty lines and retaining order', () => {
  assert.deepEqual(parseListeningOptionText('  日本の現状を分析する\r\n\r\n日本人にインタビューする\r\n自分の国を調べる\r\n自分ができることをリストにする 。 '), [
    '日本の現状を分析する', '日本人にインタビューする', '自分の国を調べる', '自分ができることをリストにする。',
  ])
  assert.deepEqual(parseListeningOptionText('最初\r次'), ['最初', '次'])
})

test('plain options retain ruby, numeric content, and duplicate options', () => {
  assert.deepEqual(parseListeningOptionText('<ruby>日本<rt>にほん</rt></ruby>\n2025年の資料\n2025年の資料'), [
    '<ruby>日本<rt>にほん</rt></ruby>', '2025年の資料', '2025年の資料',
  ])
})

test('numbered formats keep precedence over plain lines', () => {
  for (const input of ['1\t最初\n2\t次', 'A. 最初\nB. 次', '①最初\n②次', '1 最初 2 次']) {
    assert.deepEqual(parseListeningOptionText(input), ['最初', '次'])
  }
})

test('empty or single unnumbered options do not trigger recognition', () => {
  for (const input of ['', '  \n\t', '\nひとつだけ\n', 'one option with spaces']) {
    assert.deepEqual(parseListeningOptionText(input), [])
  }
})

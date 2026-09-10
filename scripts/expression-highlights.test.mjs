import assert from 'node:assert/strict'
import test from 'node:test'
import { expressionHighlightFragments } from '../modules/knowledge/vocabulary/domain/expression-highlights.ts'

test('saved collocation marks its continuative form across sorting layout gaps', () => {
  assert.deepEqual(expressionHighlightFragments('宝くじに当たる', '宝くじに 当たり でもしない限り'), ['宝くじに当たり'])
  assert.deepEqual(expressionHighlightFragments('宝くじに当たる', '宝くじを買う'), [])
})
test('collocation matches dictionary and past forms only when present', () => {
  assert.ok(expressionHighlightFragments('宝くじに当たる', '宝くじに当たった。').includes('宝くじに当たった'))
  assert.deepEqual(expressionHighlightFragments('気が重い', '今日は気が重い。'), ['気が重い'])
})

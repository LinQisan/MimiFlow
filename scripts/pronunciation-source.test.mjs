import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePronunciationSource } from '../hooks/pronunciationSource.ts'

test('explicit personal opt-out always wins', () => {
  assert.equal(resolvePronunciationSource('personal', true), 'personal')
  assert.equal(resolvePronunciationSource('personal', false), 'personal')
  assert.equal(resolvePronunciationSource('personal', true, 'sudachi'), 'personal')
})

test('automatic reading applies as soon as it is available', () => {
  assert.equal(resolvePronunciationSource(null, true), 'sudachi')
  assert.equal(resolvePronunciationSource('sudachi', true), 'sudachi')
  assert.equal(resolvePronunciationSource(null, true, 'personal'), 'sudachi')
})

test('unavailable automatic reading keeps the SSR default', () => {
  assert.equal(resolvePronunciationSource(null, false), 'personal')
  assert.equal(resolvePronunciationSource('sudachi', false), 'personal')
  assert.equal(resolvePronunciationSource('sudachi', false, 'sudachi'), 'sudachi')
  assert.equal(resolvePronunciationSource('garbage', true), 'sudachi')
})

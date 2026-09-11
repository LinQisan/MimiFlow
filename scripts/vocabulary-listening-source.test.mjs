import assert from 'node:assert/strict'
import test from 'node:test'
import { listeningMaterialId, matchListeningSentenceSource } from '../modules/knowledge/vocabulary/domain/listening-source.ts'
import { findAudioDialogueTiming, parseAudioDialogueSourceId } from '../utils/audioDialogue/sourceId.ts'
const text = 'あー、小さいお子さんたちだと、担当者の増員が必要だね。'
const line = { stableId: '6', text, start: 23.42, end: 28.5 }

test('listening page links recover the exact original audio interval', () => {
  const id = listeningMaterialId('/listening/material-id?view=transcript')
  const sourceId = matchListeningSentenceSource(text, id, [line])
  assert.equal(sourceId, 'material-id::6')
  const parsed = parseAudioDialogueSourceId(sourceId)
  assert.deepEqual(findAudioDialogueTiming([line], parsed.stableId), { start: 23.42, end: 28.5 })
})
test('ambiguous, changed and invalid transcript lines never get guessed audio', () => {
  assert.equal(matchListeningSentenceSource(text, 'm', [line, { ...line, stableId: '7' }]), null)
  assert.equal(matchListeningSentenceSource('別の文', 'm', [line]), null)
  assert.equal(matchListeningSentenceSource(text, 'm', [{ ...line, end: 0 }]), null)
  assert.equal(listeningMaterialId('https://example.com/listening/m'), '')
  assert.equal(listeningMaterialId('/vocabulary/wordbooks/m'), '')
})

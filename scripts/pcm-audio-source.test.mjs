import assert from 'node:assert/strict'
import test from 'node:test'
import { encodePcmWave, PcmAudioSource, waitForAudioMetadata } from '../modules/media/audio/browser/pcm-source.ts'

const buffer = {
  numberOfChannels: 2, length: 3, sampleRate: 44100,
  getChannelData: channel => channel === 0 ? [-1, 0, 1] : [0.5, -0.5, 2],
}

test('PCM source preserves sample count, rate and channel order for exact seeking', () => {
  const bytes = encodePcmWave(buffer)
  const view = new DataView(bytes)
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF')
  assert.equal(view.getUint32(24, true), 44100)
  assert.equal(view.getUint16(22, true), 2)
  assert.equal(view.getUint32(40, true), 12)
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)),
    [-32768, 16384, 0, -16384, 32767, 32767])
})

test('one page reuses its PCM source and revokes it on disposal', async t => {
  let closed = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
  const oldContext = globalThis.AudioContext
  globalThis.AudioContext = class {
    async decodeAudioData() { return buffer }
    async close() { closed++ }
  }
  t.after(() => { globalThis.AudioContext = oldContext })
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {})
  const source = new PcmAudioSource()
  const [first, second] = await Promise.all([source.prepare('/clip.mp3'), source.prepare('/clip.mp3')])
  assert.equal(first, second)
  assert.equal(fetch.mock.callCount(), 1)
  assert.equal(closed, 1)
  source.dispose()
  assert.equal(revoke.mock.calls[0].arguments[0], first)
})

test('metadata must be ready before applying a sentence offset; cancellation rejects stale playback', async () => {
  const audio = new EventTarget()
  audio.readyState = 0
  const abort = new AbortController()
  let ready = false
  const pending = waitForAudioMetadata(audio, abort.signal).then(() => { ready = true })
  await Promise.resolve()
  assert.equal(ready, false)
  audio.readyState = 1
  audio.dispatchEvent(new Event('loadedmetadata'))
  await pending
  assert.equal(ready, true)
  audio.readyState = 0
  const cancelled = waitForAudioMetadata(audio, abort.signal)
  abort.abort()
  await assert.rejects(cancelled, /interrupted/)
})

test('leaving during decoding creates no orphaned blob URL', async t => {
  let finishDecode
  let closed = false
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
  const oldContext = globalThis.AudioContext
  globalThis.AudioContext = class {
    decodeAudioData() { return new Promise(resolve => { finishDecode = resolve }) }
    async close() { closed = true }
  }
  t.after(() => { globalThis.AudioContext = oldContext })
  const create = t.mock.method(URL, 'createObjectURL', () => 'blob:test')
  const source = new PcmAudioSource()
  const pending = source.prepare('/clip.mp3')
  await new Promise(resolve => setImmediate(resolve))
  source.dispose()
  finishDecode(buffer)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(create.mock.callCount(), 0)
  assert.equal(closed, true)
})

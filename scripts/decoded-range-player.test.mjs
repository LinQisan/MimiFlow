import assert from 'node:assert/strict'
import test from 'node:test'
import { DecodedRangePlayer } from '../modules/media/audio/browser/decoded-range-player.ts'

function context() {
  const sources = []
  return {
    currentTime: 10,
    destination: {},
    sources,
    resume: async () => {},
    close: async () => {},
    decodeAudioData: async () => ({ duration: 154.4 }),
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start(...args) { this.args = args },
        stop() { this.stopped = true },
      }
      sources.push(source)
      return source
    },
  }
}

function mockFetch(t) {
  return t.mock.method(globalThis, 'fetch', async () => ({
    ok: true, arrayBuffer: async () => new ArrayBuffer(1),
  }))
}

test('short previews play the exact decoded interval and reuse the decoded audio', async t => {
  const fetch = mockFetch(t)
  const ctx = context()
  const player = new DecodedRangePlayer(ctx, '/audio.mp3')
  let ended = 0
  assert.equal(await player.play(67.12, 67.69, () => ended++), true)
  assert.deepEqual(ctx.sources[0].args, [0, 67.12, 67.69 - 67.12])
  ctx.currentTime += 0.3
  assert.ok(Math.abs(player.currentTime - 67.42) < 1e-8)
  ctx.sources[0].onended()
  assert.equal(ended, 1)
  assert.equal(player.currentTime, null)
  await player.play(68.19, 69.4, () => ended++)
  assert.equal(fetch.mock.callCount(), 1)
  player.stop()
  assert.equal(ctx.sources[1].stopped, true)
  assert.equal(ctx.sources[1].onended, null)
  assert.equal(ended, 1)
  player.dispose()
})

test('rapid row switching and pause cancel pending decoding before it can play', async t => {
  mockFetch(t)
  const ctx = context()
  let resolveDecode
  ctx.decodeAudioData = () => new Promise(resolve => { resolveDecode = resolve })
  const player = new DecodedRangePlayer(ctx, '/audio.mp3')
  const first = player.play(67.12, 67.69, () => assert.fail('stale end'))
  const second = player.play(68.19, 69.4, () => {})
  await new Promise(resolve => setImmediate(resolve))
  resolveDecode({ duration: 154.4 })
  assert.equal(await first, false)
  assert.equal(await second, true)
  assert.equal(ctx.sources.length, 1)
  assert.equal(ctx.sources[0].args[1], 68.19)
  const third = player.play(67.12, 67.69, () => assert.fail('cancelled end'))
  player.stop()
  assert.equal(await third, false)
  assert.equal(ctx.sources.length, 1)
  player.dispose()
})

test('failed requests can retry and disposal cancels a pending preview', async t => {
  const fetch = mockFetch(t)
  fetch.mock.mockImplementationOnce(async () => ({ ok: false }))
  const ctx = context()
  const player = new DecodedRangePlayer(ctx, '/audio.mp3')
  await assert.rejects(player.play(67.12, 67.69, () => {}), /request failed/)
  const pending = player.play(67.12, 67.69, () => assert.fail('disposed'))
  player.dispose()
  assert.equal(await pending, false)
  assert.equal(ctx.sources.length, 0)
})

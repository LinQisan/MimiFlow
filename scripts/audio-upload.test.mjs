import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MAX_AUDIO_UPLOAD_BYTES, saveAudioUpload } from '../modules/media/audio/server/upload.ts'

test('audio uploads preserve existing names and stream into separate files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mimiflow-audio-upload-'))
  try {
    const file = new File(['sound'], 'clip.mp3', { type: 'audio/mpeg' })
    const [first, second] = await Promise.all([
      saveAudioUpload(file, directory, 'clip', '.mp3'),
      saveAudioUpload(file, directory, 'clip', '.mp3'),
    ])
    assert.deepEqual(new Set([first, second]), new Set(['clip.mp3', 'clip-2.mp3']))
    assert.equal(await readFile(path.join(directory, first), 'utf8'), 'sound')
    assert.equal(await readFile(path.join(directory, second), 'utf8'), 'sound')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('oversized audio is rejected before opening a file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mimiflow-audio-upload-'))
  try {
    await assert.rejects(
      saveAudioUpload({ size: MAX_AUDIO_UPLOAD_BYTES + 1 }, directory, 'large', '.mp3'),
      /80MB/,
    )
    assert.deepEqual(await readdir(directory), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('failed audio stream removes its partial new file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mimiflow-audio-upload-'))
  try {
    const brokenFile = {
      size: 5,
      async *stream() {
        yield Buffer.from('part')
        throw new Error('stream failed')
      },
    }
    await assert.rejects(saveAudioUpload(brokenFile, directory, 'broken', '.mp3'), /stream failed/)
    assert.deepEqual(await readdir(directory), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

/** Keep the decoded sample timeline when seeking with HTMLMediaElement. */
export function encodePcmWave(buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>) {
  const channels = buffer.numberOfChannels
  const blockAlign = channels * 2
  const bytes = new ArrayBuffer(44 + buffer.length * blockAlign)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, buffer.length * blockAlign, true)
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  for (let frame = 0; frame < buffer.length; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][frame]))
      view.setInt16(44 + frame * blockAlign + channel * 2,
        Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
    }
  }
  return bytes
}

/** One page-local decoded source. No persistent cache or source-file mutation. */
export class PcmAudioSource {
  private pending: Promise<string> | null = null
  private url: string | null = null
  private abort = new AbortController()

  prepare(src: string): Promise<string> {
    if (!this.pending) {
      this.pending = this.decode(src).catch(error => {
        this.pending = null
        throw error
      })
    }
    return this.pending
  }

  private async decode(src: string) {
    const response = await fetch(src, { signal: this.abort.signal })
    if (!response.ok) throw new Error('Audio request failed')
    const bytes = await response.arrayBuffer()
    this.abort.signal.throwIfAborted()
    // Store the decoder's sample rate in the WAV header to preserve timing.
    const context = new AudioContext()
    try {
      const buffer = await context.decodeAudioData(bytes)
      this.abort.signal.throwIfAborted()
      this.url = URL.createObjectURL(new Blob([encodePcmWave(buffer)], { type: 'audio/wav' }))
      return this.url
    } finally {
      void context.close()
    }
  }

  dispose() {
    this.abort.abort()
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }
}

export function waitForAudioMetadata(audio: HTMLAudioElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', ready)
      audio.removeEventListener('error', failed)
      signal.removeEventListener('abort', failed)
    }
    const ready = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('Audio loading interrupted')) }
    audio.addEventListener('loadedmetadata', ready)
    audio.addEventListener('error', failed)
    signal.addEventListener('abort', failed)
    if (signal.aborted || audio.error) failed()
    else if (audio.readyState >= 1) ready()
  })
}

/** Sample-accurate previews: compressed-media seeks can land on silent frames. */
export class DecodedRangePlayer {
  private context: AudioContext
  private buffer: Promise<AudioBuffer> | null = null
  private source: AudioBufferSourceNode | null = null
  private generation = 0
  private abort = new AbortController()
  private start = 0
  private end = 0
  private startedAt = 0

  private src: string

  constructor(context: AudioContext, src: string) {
    this.context = context
    this.src = src
  }

  get currentTime(): number | null {
    return this.source
      ? Math.min(this.end, this.start + this.context.currentTime - this.startedAt)
      : null
  }

  async play(start: number, end: number, onEnded: () => void): Promise<boolean> {
    this.stop()
    const generation = this.generation
    // Resume synchronously within the click's user activation, before fetching.
    const resumed = this.context.resume()
    if (!this.buffer) {
      this.buffer = fetch(this.src, { signal: this.abort.signal })
        .then(response => {
          if (!response.ok) throw new Error('Audio request failed')
          return response.arrayBuffer()
        })
        .then(data => this.context.decodeAudioData(data))
        .catch(error => {
          this.buffer = null
          throw error
        })
    }
    const [buffer] = await Promise.all([this.buffer, resumed])
    if (generation !== this.generation) return false
    const safeStart = Math.max(0, start)
    const safeEnd = Math.min(end, buffer.duration)
    if (safeEnd <= safeStart) throw new Error('Audio range is outside the buffer')
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)
    this.start = safeStart
    this.end = safeEnd
    this.startedAt = this.context.currentTime
    this.source = source
    source.onended = () => {
      if (generation !== this.generation) return
      this.source = null
      source.disconnect()
      onEnded()
    }
    source.start(0, safeStart, safeEnd - safeStart)
    return true
  }

  stop() {
    this.generation += 1
    if (this.source) {
      this.source.onended = null
      this.source.stop()
      this.source.disconnect()
      this.source = null
    }
  }

  dispose() {
    this.stop()
    this.abort.abort()
    this.buffer = null
    void this.context.close()
  }
}

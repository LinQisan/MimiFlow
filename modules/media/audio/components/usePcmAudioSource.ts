'use client'

import { useEffect, useState } from 'react'
import { PcmAudioSource } from '../browser/pcm-source'

/** Share a decoded, seekable source across every control of one player. */
export function usePcmAudioSource(src: string | undefined) {
  const [result, setResult] = useState<{
    original: string
    url: string
    error: boolean
  } | null>(null)

  useEffect(() => {
    if (!src) return
    const source = new PcmAudioSource()
    let disposed = false
    void source.prepare(src).then(
      url => {
        if (!disposed) setResult({ original: src, url, error: false })
      },
      () => {
        if (!disposed) setResult({ original: src, url: '', error: true })
      },
    )
    return () => {
      disposed = true
      source.dispose()
    }
  }, [src])

  return {
    src: result && result.original === src ? result.url : '',
    error: Boolean(result && result.original === src && result.error),
  }
}

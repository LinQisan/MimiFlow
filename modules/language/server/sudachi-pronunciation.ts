import 'server-only'

import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { analyze } from '@mimiflow/sudachi'
import type { SudachiLexeme, SudachiToken } from '@/modules/language/domain/sudachi'
import { normalizeSudachiTokenReadings } from '@/modules/language/domain/sudachi'

type SudachiAnalysisTiming = {
  worker?: boolean
  scriptStartupMs: number
  inputParseMs: number
  sudachiImportMs: number
  dictionaryInitializationMs: number
  firstTokenizeMs: number | null
  tokenizeMs: number
  dictionaryReadingTokenizeMs: number
  jsonSerializationMs: number
  totalAnalysisMs: number
  textCount: number
  characterCount: number
  tokenCount: number
  dictionaryReadingCacheSize?: number
}

export type SudachiExecutionTiming = {
  mode: 'one-shot' | 'persistent-worker'
  inputSerializationMs: number
  spawnMs: number
  inputWriteMs: number
  firstOutputMs: number | null
  outputReadMs: number | null
  processWallMs: number
  jsonParseMs: number
  workerQueueMs?: number | null
  workerReadyMs?: number | null
  /** Legacy diagnostic key retained for API compatibility; values now come from Rust. */
  python?: SudachiAnalysisTiming
}

export type SudachiPronunciationResult = {
  available: boolean
  pronunciationMap: Record<string, string>
  lexicon: Record<string, SudachiLexeme>
  tokens: SudachiToken[]
  timing?: SudachiExecutionTiming
}

const MAX_CACHE_ENTRIES = 100
const cache = new Map<string, SudachiPronunciationResult>()
const pending = new Map<string, Promise<SudachiPronunciationResult>>()
let didWarn = false
// Serialize analysis without holding several libuv threads on the native mutex.
// This is an in-process promise chain, with no child process or message transport.
let queued: Promise<void> = Promise.resolve()
const EMPTY_RESULT: SudachiPronunciationResult = {
  available: false, pronunciationMap: {}, lexicon: {}, tokens: [],
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

const parseLexeme = (value: unknown): SudachiLexeme | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    typeof row.surface !== 'string' ||
    typeof row.dictionaryForm !== 'string' ||
    typeof row.normalizedForm !== 'string' ||
    typeof row.reading !== 'string' ||
    typeof row.dictionaryReading !== 'string' ||
    !isStringList(row.partsOfSpeech)
  ) {
    return null
  }
  return {
    surface: row.surface,
    dictionaryForm: row.dictionaryForm,
    normalizedForm: row.normalizedForm,
    reading: row.reading,
    dictionaryReading: row.dictionaryReading,
    partsOfSpeech: row.partsOfSpeech,
  }
}

const parseAnalysisPayload = (
  payload: Record<string, unknown>,
): Omit<SudachiPronunciationResult, 'available' | 'timing'> => {
  const entries =
    payload.pronunciationMap &&
    typeof payload.pronunciationMap === 'object' &&
    !Array.isArray(payload.pronunciationMap)
      ? Object.entries(payload.pronunciationMap)
      : []
  const pronunciationMap = entries.reduce<Record<string, string>>(
    (acc, [surface, reading]) => {
      if (typeof reading === 'string' && reading.trim()) {
        acc[surface] = reading.trim()
      }
      return acc
    },
    {},
  )
  const lexiconEntries =
    payload.lexicon &&
    typeof payload.lexicon === 'object' &&
    !Array.isArray(payload.lexicon)
      ? Object.entries(payload.lexicon)
      : []
  const lexicon = lexiconEntries.reduce<Record<string, SudachiLexeme>>(
    (acc, [surface, value]) => {
      const parsed = parseLexeme(value)
      if (parsed) acc[surface] = parsed
      return acc
    },
    {},
  )
  const tokens = Array.isArray(payload.tokens)
    ? payload.tokens.reduce<SudachiToken[]>((acc, value) => {
        const parsed = parseLexeme(value)
        if (!parsed || !value || typeof value !== 'object' || Array.isArray(value)) {
          return acc
        }
        const row = value as Record<string, unknown>
        if (
          typeof row.textIndex !== 'number' ||
          typeof row.begin !== 'number' ||
          typeof row.end !== 'number'
        ) {
          return acc
        }
        acc.push({
          ...parsed,
          textIndex: row.textIndex,
          begin: row.begin,
          end: row.end,
        })
        return acc
      }, [])
    : []
  return { pronunciationMap, lexicon, tokens }
}

const runSudachi = (texts: string[]) => {
  const requestedAt = performance.now()
  const timeoutMs = Math.min(60_000, Math.max(15_000, 10_000 + texts.reduce((sum, text) => sum + text.length, 0) * 2))
  let expired = false
  const work = queued.then(async () => {
    if (expired) throw new Error('Sudachi annotation timed out')
    const startedAt = performance.now()
    // Preserve the previous single retry for transient initialization failures.
    const payload = await analyze(texts).catch(() => analyze(texts))
    const finishedAt = performance.now()
    const timing: SudachiExecutionTiming = {
      // Legacy mode/field names describe the persistent analyzer contract.
      // Removed transport stages report zero rather than invented timings.
      mode: 'persistent-worker',
      inputSerializationMs: 0,
      spawnMs: 0,
      inputWriteMs: 0,
      firstOutputMs: finishedAt - requestedAt,
      outputReadMs: finishedAt - startedAt,
      processWallMs: finishedAt - requestedAt,
      jsonParseMs: 0,
      workerQueueMs: startedAt - requestedAt,
      workerReadyMs: 0,
      python: payload.timings as SudachiAnalysisTiming,
    }
    return { ...parseAnalysisPayload(payload), timing }
  })
  queued = work.then(() => undefined, () => undefined)
  return new Promise<Omit<SudachiPronunciationResult, 'available'>>((resolve, reject) => {
    const timer = setTimeout(() => {
      expired = true
      reject(new Error('Sudachi annotation timed out'))
    }, timeoutMs)
    work.then(
      result => { clearTimeout(timer); resolve(result) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

const normalizeAnalysisReadings = (
  analysis: Omit<SudachiPronunciationResult, 'available'>,
) => {
  const tokens = normalizeSudachiTokenReadings(analysis.tokens)
  if (tokens === analysis.tokens) return analysis

  const firstTokenBySurface = new Map<string, SudachiToken>()
  tokens.forEach(token => {
    if (!firstTokenBySurface.has(token.surface)) {
      firstTokenBySurface.set(token.surface, token)
    }
  })

  const lexicon = Object.fromEntries(
    Object.entries(analysis.lexicon).map(([surface, lexeme]) => {
      const token = firstTokenBySurface.get(surface)
      return [surface, token ? { ...lexeme, reading: token.reading } : lexeme]
    }),
  )
  const pronunciationMap = { ...analysis.pronunciationMap }
  firstTokenBySurface.forEach((token, surface) => {
    if (
      Object.prototype.hasOwnProperty.call(pronunciationMap, surface) &&
      token.reading.trim()
    ) {
      pronunciationMap[surface] = token.reading
    }
  })

  return { ...analysis, tokens, lexicon, pronunciationMap }
}

const remember = (key: string, result: SudachiPronunciationResult) => {
  cache.delete(key)
  cache.set(key, result)
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
}

export async function getSudachiPronunciationMap(
  texts: string[],
): Promise<SudachiPronunciationResult> {
  const cleanTexts = texts.filter(text => text.trim())
  if (cleanTexts.length === 0) {
    return { ...EMPTY_RESULT, available: true }
  }

  const key = createHash('sha256')
    .update(JSON.stringify(cleanTexts))
    .digest('hex')
  const cached = cache.get(key)
  if (cached) return cached

  const inFlight = pending.get(key)
  if (inFlight) return inFlight

  const task = runSudachi(cleanTexts)
    .then(analysis => {
      const result = {
        available: true,
        ...normalizeAnalysisReadings(analysis),
      }
      remember(key, result)
      return result
    })
    .catch(error => {
      if (!didWarn) {
        didWarn = true
        console.warn(
          'Sudachi is unavailable; Japanese text will use personal pronunciations.',
          error,
        )
      }
      return EMPTY_RESULT
    })
    .finally(() => pending.delete(key))

  pending.set(key, task)
  return task
}

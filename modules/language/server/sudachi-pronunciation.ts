import 'server-only'

import { createHash } from 'node:crypto'
import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import type {
  SudachiLexeme,
  SudachiToken,
} from '@/modules/language/domain/sudachi'
import { normalizeSudachiTokenReadings } from '@/modules/language/domain/sudachi'

type SudachiPythonTiming = {
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
  python?: SudachiPythonTiming
}

export type SudachiPronunciationResult = {
  available: boolean
  pronunciationMap: Record<string, string>
  lexicon: Record<string, SudachiLexeme>
  tokens: SudachiToken[]
  timing?: SudachiExecutionTiming
}

const MAX_CACHE_ENTRIES = 100
// A normal practice corpus can produce more than 10 MiB of token metadata in
// one worker response. The response is still bounded to avoid unbounded IPC
// memory use while allowing that corpus to be processed in one request.
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024
const MIN_ANALYSIS_TIMEOUT_MS = 15_000
const MAX_ANALYSIS_TIMEOUT_MS = 60_000
const WORKER_MODE_ENV = 'SUDACHI_WORKER_MODE'
const WORKER_MODE_ONE_SHOT = 'oneshot'
const WORKER_MODE_OFF = 'off'
const MAX_WORKER_RETRIES = 1

const cache = new Map<string, SudachiPronunciationResult>()
const pending = new Map<string, Promise<SudachiPronunciationResult>>()
let didWarn = false

const resolvePythonExecutable = () => {
  const configured = process.env.SUDACHI_PYTHON?.trim()
  if (configured) return configured
  return ['.venv', 'bin', 'python'].join(path.sep)
}

const getScriptPath = () =>
  path.join(process.cwd(), 'scripts', 'sudachi_pronunciation.py')

const EMPTY_RESULT: SudachiPronunciationResult = {
  available: false,
  pronunciationMap: {},
  lexicon: {},
  tokens: [],
}

const roundMilliseconds = (value: number) => Math.round(value * 10) / 10

const formatTiming = (timing: SudachiExecutionTiming) => ({
  mode: timing.mode,
  inputSerializationMs: roundMilliseconds(timing.inputSerializationMs),
  spawnMs: roundMilliseconds(timing.spawnMs),
  inputWriteMs: roundMilliseconds(timing.inputWriteMs),
  firstOutputMs:
    timing.firstOutputMs == null
      ? null
      : roundMilliseconds(timing.firstOutputMs),
  outputReadMs:
    timing.outputReadMs == null
      ? null
      : roundMilliseconds(timing.outputReadMs),
  processWallMs: roundMilliseconds(timing.processWallMs),
  jsonParseMs: roundMilliseconds(timing.jsonParseMs),
  workerQueueMs:
    timing.workerQueueMs == null
      ? undefined
      : roundMilliseconds(timing.workerQueueMs),
  workerReadyMs:
    timing.workerReadyMs == null
      ? undefined
      : roundMilliseconds(timing.workerReadyMs),
  python: timing.python
    ? {
        ...timing.python,
        scriptStartupMs: roundMilliseconds(timing.python.scriptStartupMs),
        inputParseMs: roundMilliseconds(timing.python.inputParseMs),
        sudachiImportMs: roundMilliseconds(timing.python.sudachiImportMs),
        dictionaryInitializationMs: roundMilliseconds(
          timing.python.dictionaryInitializationMs,
        ),
        firstTokenizeMs:
          timing.python.firstTokenizeMs == null
            ? null
            : roundMilliseconds(timing.python.firstTokenizeMs),
        tokenizeMs: roundMilliseconds(timing.python.tokenizeMs),
        dictionaryReadingTokenizeMs: roundMilliseconds(
          timing.python.dictionaryReadingTokenizeMs,
        ),
        jsonSerializationMs: roundMilliseconds(
          timing.python.jsonSerializationMs,
        ),
        totalAnalysisMs: roundMilliseconds(timing.python.totalAnalysisMs),
      }
    : undefined,
})

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

const timeoutForTexts = (texts: string[]) => {
  const characterCount = texts.reduce((sum, text) => sum + text.length, 0)
  return Math.min(
    MAX_ANALYSIS_TIMEOUT_MS,
    Math.max(MIN_ANALYSIS_TIMEOUT_MS, 10_000 + characterCount * 2),
  )
}

const getPythonTiming = (payload: Record<string, unknown>) => {
  if (!payload.timings || typeof payload.timings !== 'object') return undefined
  return payload.timings as SudachiPythonTiming
}

const logTiming = (label: string, timing: SudachiExecutionTiming) => {
  console.info(`[sudachi] ${label}`, JSON.stringify(formatTiming(timing)))
}

const runSudachiOneShot = (texts: string[]) =>
  new Promise<Omit<SudachiPronunciationResult, 'available'>>((resolve, reject) => {
    const startedAt = performance.now()
    const serializeStartedAt = performance.now()
    const input = JSON.stringify({ texts })
    const inputSerializationMs = performance.now() - serializeStartedAt
    const child = spawn(resolvePythonExecutable(), [getScriptPath()], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false
    let spawnedAt: number | null = null
    let firstOutputAt: number | null = null
    let inputWriteStartedAt: number | null = null
    let inputWriteEndedAt: number | null = null
    let closedAt: number | null = null

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      handler()
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error('SudachiPy annotation timed out')))
    }, timeoutForTexts(texts))

    child.stdout.on('data', (chunk: Buffer) => {
      firstOutputAt ??= performance.now()
      outputBytes += chunk.length
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill()
        finish(() => reject(new Error('SudachiPy output exceeded the limit')))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.once('spawn', () => {
      spawnedAt = performance.now()
    })
    child.on('error', error => finish(() => reject(error)))
    child.on('close', code => {
      closedAt = performance.now()
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(
              Buffer.concat(stderr).toString('utf8').trim() ||
                `SudachiPy exited with code ${code}`,
            ),
          )
          return
        }
        try {
          const jsonParseStartedAt = performance.now()
          const payload = JSON.parse(Buffer.concat(stdout).toString('utf8')) as Record<
            string,
            unknown
          >
          const jsonParseMs = performance.now() - jsonParseStartedAt
          const timing: SudachiExecutionTiming = {
            mode: 'one-shot',
            inputSerializationMs,
            spawnMs: (spawnedAt ?? startedAt) - startedAt,
            inputWriteMs:
              inputWriteStartedAt == null || inputWriteEndedAt == null
                ? 0
                : inputWriteEndedAt - inputWriteStartedAt,
            firstOutputMs:
              firstOutputAt == null ? null : firstOutputAt - startedAt,
            outputReadMs:
              firstOutputAt == null || closedAt == null
                ? null
                : closedAt - firstOutputAt,
            processWallMs: (closedAt ?? performance.now()) - startedAt,
            jsonParseMs,
            python: getPythonTiming(payload),
          }
          logTiming('one-shot timing', timing)
          resolve({ ...parseAnalysisPayload(payload), timing })
        } catch (error) {
          reject(error)
        }
      })
    })

    inputWriteStartedAt = performance.now()
    child.stdin.end(input, () => {
      inputWriteEndedAt = performance.now()
    })
  })

type PendingWorkerRequest = {
  id: string
  texts: string[]
  input: string
  inputSerializationMs: number
  startedAt: number
  sentAt: number | null
  inputWriteStartedAt: number | null
  inputWriteEndedAt: number | null
  timeout: ReturnType<typeof setTimeout>
  resolve: (result: Omit<SudachiPronunciationResult, 'available'>) => void
  reject: (error: Error) => void
}

type SudachiWorkerState = {
  child: ChildProcessWithoutNullStreams
  spawnRequestedAt: number
  spawnedAt: number | null
  readyAt: number | null
  readyTiming?: Record<string, unknown>
  ready: Promise<void>
  resolveReady: () => void
  rejectReady: (error: Error) => void
  bufferParts: string[]
  outputBytes: number
  queue: PendingWorkerRequest[]
  active: PendingWorkerRequest | null
  failed: boolean
  shuttingDown: boolean
  stderr: string
  nextId: number
}

type SudachiGlobalState = {
  worker?: SudachiWorkerState
  shutdownHooksInstalled?: boolean
}

const globalState = globalThis as typeof globalThis & {
  __mimiflowSudachi?: SudachiGlobalState
}

const getGlobalState = () =>
  (globalState.__mimiflowSudachi ??= {})

const createWorker = () => {
  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  ready.catch(() => undefined)
  const spawnRequestedAt = performance.now()
  const child = spawn(resolvePythonExecutable(), [getScriptPath(), '--worker'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const state: SudachiWorkerState = {
    child,
    spawnRequestedAt,
    spawnedAt: null,
    readyAt: null,
    ready,
    resolveReady,
    rejectReady,
    bufferParts: [],
    outputBytes: 0,
    queue: [],
    active: null,
    failed: false,
    shuttingDown: false,
    stderr: '',
    nextId: 1,
  }

  child.once('spawn', () => {
    state.spawnedAt = performance.now()
  })
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    state.outputBytes += Buffer.byteLength(chunk)
    if (state.outputBytes > MAX_OUTPUT_BYTES) {
      failWorker(state, new Error('Sudachi worker output exceeded the limit'))
      return
    }
    let start = 0
    while (start <= chunk.length) {
      const newlineIndex = chunk.indexOf('\n', start)
      if (newlineIndex < 0) {
        if (start < chunk.length) state.bufferParts.push(chunk.slice(start))
        break
      }
      state.bufferParts.push(chunk.slice(start, newlineIndex))
      const line = state.bufferParts.join('')
      state.bufferParts = []
      handleWorkerLine(state, line)
      if (state.failed) return
      start = newlineIndex + 1
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    state.stderr = `${state.stderr}${chunk}`.slice(-4_000)
  })
  child.on('error', error => {
    failWorker(state, error)
  })
  child.on('close', (code, signal) => {
    if (!state.shuttingDown && !state.failed) {
      const stderr = state.stderr.trim()
      failWorker(
        state,
        new Error(
          stderr ||
            `Sudachi worker exited with code ${code ?? 'unknown'}${
              signal ? ` (${signal})` : ''
            }`,
        ),
      )
    }
  })
  return state
}

const installShutdownHooks = () => {
  const state = getGlobalState()
  if (state.shutdownHooksInstalled) return
  state.shutdownHooksInstalled = true
  const shutdown = () => {
    const worker = getGlobalState().worker
    if (!worker) return
    worker.shuttingDown = true
    failWorker(worker, new Error('Sudachi worker is shutting down'))
    worker.child.stdin.end()
    worker.child.kill()
    getGlobalState().worker = undefined
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

const failWorker = (state: SudachiWorkerState, error: Error) => {
  if (state.failed) return
  state.failed = true
  state.rejectReady(error)
  const requests = [
    ...(state.active ? [state.active] : []),
    ...state.queue,
  ]
  state.active = null
  state.queue = []
  requests.forEach(request => {
    clearTimeout(request.timeout)
    request.reject(error)
  })
  if (getGlobalState().worker === state) {
    getGlobalState().worker = undefined
  }
  if (state.stderr.trim()) {
    console.warn('[sudachi] worker stderr', state.stderr.trim())
  }
  if (!state.shuttingDown) {
    if (state.child.exitCode == null) state.child.kill()
    console.warn('[sudachi] worker stopped; the next request will restart it', error)
  }
}

const handleWorkerLine = (state: SudachiWorkerState, line: string) => {
  if (!line.trim()) return
  const jsonParseStartedAt = performance.now()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(line) as Record<string, unknown>
  } catch (error) {
    failWorker(
      state,
      new Error(
        `Sudachi worker returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    )
    return
  }
  const jsonParseMs = performance.now() - jsonParseStartedAt
  if (payload.type === 'ready') {
    state.readyAt = performance.now()
    state.readyTiming =
      payload.timings && typeof payload.timings === 'object'
        ? (payload.timings as Record<string, unknown>)
        : undefined
    state.resolveReady()
    console.info(
      '[sudachi] worker ready',
      JSON.stringify({
        spawnMs: roundMilliseconds(
          (state.spawnedAt ?? state.spawnRequestedAt) - state.spawnRequestedAt,
        ),
        readyMs: roundMilliseconds(state.readyAt - state.spawnRequestedAt),
        python: state.readyTiming,
      }),
    )
    pumpWorker(state)
    return
  }
  const active = state.active
  if (!active || payload.id !== active.id) {
    failWorker(state, new Error('Sudachi worker response id did not match the active request'))
    return
  }
  const responseAt = performance.now()
  state.active = null
  clearTimeout(active.timeout)
  if (payload.type === 'error') {
    active.reject(new Error(String(payload.message || 'Sudachi worker request failed')))
    pumpWorker(state)
    return
  }
  const timing: SudachiExecutionTiming = {
    mode: 'persistent-worker',
    inputSerializationMs: active.inputSerializationMs,
    spawnMs: state.spawnedAt == null
      ? 0
      : state.spawnedAt - state.spawnRequestedAt,
    inputWriteMs:
      active.inputWriteStartedAt == null || active.inputWriteEndedAt == null
        ? 0
        : active.inputWriteEndedAt - active.inputWriteStartedAt,
    firstOutputMs: responseAt - active.startedAt,
    outputReadMs:
      active.sentAt == null ? null : responseAt - active.sentAt,
    processWallMs: responseAt - active.startedAt,
    jsonParseMs,
    workerQueueMs:
      active.sentAt == null ? null : active.sentAt - active.startedAt,
    workerReadyMs:
      state.readyAt == null ? null : state.readyAt - state.spawnRequestedAt,
    python: getPythonTiming(payload),
  }
  logTiming('worker request timing', timing)
  active.resolve({ ...parseAnalysisPayload(payload), timing })
  pumpWorker(state)
}

const pumpWorker = (state: SudachiWorkerState) => {
  if (state.failed || !state.readyAt || state.active || state.queue.length === 0) {
    return
  }
  const request = state.queue.shift()
  if (!request) return
  state.active = request
  request.sentAt = performance.now()
  request.inputWriteStartedAt = performance.now()
  state.outputBytes = 0
  state.child.stdin.write(`${request.input}\n`, () => {
    request.inputWriteEndedAt = performance.now()
  })
}

const getOrCreateWorker = () => {
  installShutdownHooks()
  const global = getGlobalState()
  if (global.worker && !global.worker.failed) return global.worker
  const worker = createWorker()
  global.worker = worker
  return worker
}

const runSudachiWorker = async (texts: string[]) => {
  const state = getOrCreateWorker()
  await state.ready
  if (state.failed) {
    throw new Error('Sudachi worker is not available')
  }
  return new Promise<Omit<SudachiPronunciationResult, 'available'>>(
    (resolve, reject) => {
      const startedAt = performance.now()
      const serializeStartedAt = performance.now()
      const id = `sudachi-${state.nextId++}`
      const input = JSON.stringify({
        id,
        texts,
      })
      const inputSerializationMs = performance.now() - serializeStartedAt
      const request: PendingWorkerRequest = {
        id,
        texts,
        input,
        inputSerializationMs,
        startedAt,
        sentAt: null,
        inputWriteStartedAt: null,
        inputWriteEndedAt: null,
        timeout: setTimeout(() => {
          const error = new Error('Sudachi worker annotation timed out')
          state.child.kill()
          failWorker(state, error)
        }, timeoutForTexts(texts)),
        resolve,
        reject,
      }
      state.queue.push(request)
      pumpWorker(state)
    },
  )
}

const shouldUsePersistentWorker = () => {
  const mode = process.env[WORKER_MODE_ENV]?.trim().toLowerCase()
  return mode !== WORKER_MODE_ONE_SHOT && mode !== WORKER_MODE_OFF
}

const runSudachi = async (texts: string[]) => {
  if (!shouldUsePersistentWorker()) return runSudachiOneShot(texts)
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_WORKER_RETRIES; attempt += 1) {
    try {
      return await runSudachiWorker(texts)
    } catch (error) {
      lastError = error
      if (attempt < MAX_WORKER_RETRIES) {
        const worker = getGlobalState().worker
        if (worker && !worker.failed) {
          worker.shuttingDown = true
          worker.child.kill()
          getGlobalState().worker = undefined
        }
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
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
          'SudachiPy is unavailable; Japanese text will use personal pronunciations.',
          error,
        )
      }
      return EMPTY_RESULT
    })
    .finally(() => pending.delete(key))

  pending.set(key, task)
  return task
}

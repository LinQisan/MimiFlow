import 'server-only'

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type {
  SudachiLexeme,
  SudachiToken,
} from '@/features/reading/domain/sudachi'

export type SudachiPronunciationResult = {
  available: boolean
  pronunciationMap: Record<string, string>
  lexicon: Record<string, SudachiLexeme>
  tokens: SudachiToken[]
}

const MAX_CACHE_ENTRIES = 100
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024
const cache = new Map<string, SudachiPronunciationResult>()
const pending = new Map<string, Promise<SudachiPronunciationResult>>()
let didWarn = false

const resolvePythonExecutable = () => {
  const configured = process.env.SUDACHI_PYTHON?.trim()
  if (configured) return configured
  return ['.venv', 'bin', 'python'].join(path.sep)
}

const EMPTY_RESULT: SudachiPronunciationResult = {
  available: false,
  pronunciationMap: {},
  lexicon: {},
  tokens: [],
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

const runSudachi = (texts: string[]) =>
  new Promise<Omit<SudachiPronunciationResult, 'available'>>((resolve, reject) => {
    const scriptPath = path.join(
      process.cwd(),
      'scripts',
      'sudachi_pronunciation.py',
    )
    const child = spawn(resolvePythonExecutable(), [scriptPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false

    const finish = (
      handler: () => void,
    ) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      handler()
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error('SudachiPy annotation timed out')))
    }, 10_000)

    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill()
        finish(() => reject(new Error('SudachiPy output exceeded the limit')))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', error => finish(() => reject(error)))
    child.on('close', code => {
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
          const payload = JSON.parse(Buffer.concat(stdout).toString('utf8')) as {
            pronunciationMap?: unknown
            lexicon?: unknown
            tokens?: unknown
          }
          const entries =
            payload.pronunciationMap &&
            typeof payload.pronunciationMap === 'object' &&
            !Array.isArray(payload.pronunciationMap)
              ? Object.entries(payload.pronunciationMap)
              : []
          const pronunciationMap = entries.reduce<Record<string, string>>((acc, [surface, reading]) => {
              if (typeof reading === 'string' && reading.trim()) {
                acc[surface] = reading.trim()
              }
              return acc
            }, {})
          const lexiconEntries =
            payload.lexicon && typeof payload.lexicon === 'object' && !Array.isArray(payload.lexicon)
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
                if (!parsed || !value || typeof value !== 'object' || Array.isArray(value)) return acc
                const row = value as Record<string, unknown>
                if (
                  typeof row.textIndex !== 'number' ||
                  typeof row.begin !== 'number' ||
                  typeof row.end !== 'number'
                ) return acc
                acc.push({
                  ...parsed,
                  textIndex: row.textIndex,
                  begin: row.begin,
                  end: row.end,
                })
                return acc
              }, [])
            : []
          resolve({ pronunciationMap, lexicon, tokens })
        } catch (error) {
          reject(error)
        }
      })
    })

    child.stdin.end(JSON.stringify({ texts }))
  })

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
      const result = { available: true, ...analysis }
      remember(key, result)
      return result
    })
    .catch(error => {
      if (!didWarn) {
        didWarn = true
        console.warn(
          'SudachiPy is unavailable; article reading will use personal pronunciations.',
          error,
        )
      }
      return EMPTY_RESULT
    })
    .finally(() => pending.delete(key))

  pending.set(key, task)
  return task
}

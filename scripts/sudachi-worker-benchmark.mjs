import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const ROOT = process.cwd()
const PYTHON = process.env.SUDACHI_PYTHON?.trim() || path.join(ROOT, '.venv', 'bin', 'python')
const SCRIPT = path.join(ROOT, 'scripts', 'sudachi_pronunciation.py')
const execFileAsync = promisify(execFile)

const round = value => Math.round(value * 10) / 10
const readString = value => (typeof value === 'string' ? value : '')
const cleanText = value =>
  value
    .replace(/\[\[(?:sort(?::star)?|blank)\]\]/gi, ' ')
    .replace(/选项\s*\d*/g, ' ')
    .trim()
const comparableText = value => value.replace(/\s+/g, ' ').trim()

const VOCAB_SECTION_BY_TYPE = {
  PRONUNCIATION: 1,
  GRAMMAR: 2,
  SYNONYM_REPLACEMENT: 3,
  WORD_DISTINCTION: 4,
  GRAMMAR_SELECTION: 5,
  SORTING: 6,
  FILL_BLANK: 7,
}

const questionCategory = (materialType, questionType) => {
  if (materialType === 'LISTENING') return 'LISTENING'
  if (materialType === 'READING') {
    return questionType === 'FILL_BLANK' ? 'GRAMMAR' : 'READING'
  }
  return (VOCAB_SECTION_BY_TYPE[questionType] || 9) <= 4
    ? 'TEXT_VOCAB'
    : 'GRAMMAR'
}

const extractMaterialTexts = material => {
  const texts = []
  const append = value => {
    const text = cleanText(value)
    if (text) texts.push(text)
  }
  const payload = material.contentPayload || {}

  if (material.type === 'READING') {
    append(readString(payload.text) || readString(payload.transcript))
  }
  if (material.type === 'LISTENING') {
    const dialogueText = Array.isArray(payload.dialogues)
      ? payload.dialogues.map(dialogue => readString(dialogue?.text)).filter(Boolean).join('\n')
      : ''
    append(dialogueText || readString(payload.transcript) || readString(payload.text))
  }

  for (const question of material.questions || []) {
    const category = questionCategory(material.type, question.questionType)
    const prompt = readString(question.prompt)
    const context = readString(question.context)
    append(
      [prompt, context && comparableText(context) !== comparableText(prompt) ? context : '']
        .filter(Boolean)
        .join('\n'),
    )

    const optionRows = Array.isArray(question.options)
      ? question.options
          .map(option => ({ id: readString(option?.id), text: readString(option?.text) }))
          .filter(option => option.text)
      : []
    append(optionRows.map(option => option.text).join('\n'))

    const answerIds = new Set(
      (Array.isArray(question.answer) ? question.answer : [question.answer]).filter(
        value => typeof value === 'string',
      ),
    )
    const correctOptionTexts = optionRows
      .filter(option => answerIds.has(option.id))
      .map(option => option.text)
    const content = question.content && typeof question.content === 'object'
      ? question.content
      : {}
    const targetParts = [readString(content.targetWord)]
    if (category === 'TEXT_VOCAB') {
      if (question.questionType === 'WORD_DISTINCTION') targetParts.push(prompt)
      if (question.questionType === 'GRAMMAR' || !readString(content.targetWord)) {
        targetParts.push(...correctOptionTexts)
      }
    }
    append([...new Set(targetParts.filter(Boolean))].join('\n'))
  }
  return texts
}

async function loadCorpus() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置。')
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
  try {
    const papers = await prisma.collection.findMany({
      where: {
        collectionType: 'PAPER',
        OR: [
          { language: { equals: 'ja', mode: 'insensitive' } },
          { language: { startsWith: 'ja-', mode: 'insensitive' } },
          { language: { equals: 'japanese', mode: 'insensitive' } },
          { language: { in: ['日语', '日本語'] } },
        ],
      },
      select: {
        materials: {
          where: {
            material: {
              type: { in: ['VOCAB_GRAMMAR', 'READING', 'LISTENING'] },
            },
          },
          orderBy: { sortOrder: 'asc' },
          select: {
            material: {
              select: {
                type: true,
                contentPayload: true,
                questions: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    questionType: true,
                    content: true,
                    prompt: true,
                    context: true,
                    options: true,
                    answer: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    const texts = papers.flatMap(paper =>
      paper.materials.flatMap(relation => extractMaterialTexts(relation.material)),
    )
    return {
      papers: papers.length,
      texts,
      characters: texts.reduce((sum, text) => sum + text.length, 0),
    }
  } finally {
    await prisma.$disconnect()
  }
}

const sampleProcess = async (pid, metrics) => {
  if (!pid) return
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'rss=,%cpu='])
    const values = stdout.trim().split(/\s+/).map(Number)
    if (values.length >= 2 && values.every(Number.isFinite)) {
      metrics.peakRssKb = Math.max(metrics.peakRssKb, values[0])
      metrics.peakCpuPercent = Math.max(metrics.peakCpuPercent, values[1])
    }
  } catch {
    // The process may have exited between the pid check and ps.
  }
}

const createWorker = async () => {
  const startedAt = performance.now()
  const child = spawn(PYTHON, [SCRIPT, '--worker'], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let bufferParts = []
  let stderr = ''
  let nextId = 1
  let closed = false
  let readyResolve
  let readyReject
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const pending = new Map()
  const metrics = { peakRssKb: 0, peakCpuPercent: 0 }

  const rejectAll = error => {
    if (closed) return
    closed = true
    readyReject(error)
    pending.forEach(item => item.reject(error))
    pending.clear()
  }

  const handleLine = line => {
    if (!line.trim()) return
    let payload
    try {
      payload = JSON.parse(line)
    } catch (error) {
      rejectAll(new Error(`Sudachi worker JSON 解析失败: ${error.message}`))
      return
    }
    if (payload.type === 'ready') {
      readyResolve({
        readyWallMs: performance.now() - startedAt,
        timings: payload.timings,
      })
      return
    }
    const item = pending.get(payload.id)
    if (!item) {
      rejectAll(new Error(`Sudachi worker 返回未知 id: ${payload.id}`))
      return
    }
    pending.delete(payload.id)
    const responseBytes = Buffer.byteLength(line)
    if (payload.type === 'error') {
      item.reject(new Error(String(payload.message || 'Sudachi worker request failed')))
      return
    }
    item.resolve({
      payload,
      wallMs: performance.now() - item.startedAt,
      responseBytes,
    })
  }

  child.stdout.on('data', chunk => {
    let start = 0
    while (start <= chunk.length) {
      const newlineIndex = chunk.indexOf('\n', start)
      if (newlineIndex < 0) {
        if (start < chunk.length) bufferParts.push(chunk.slice(start))
        break
      }
      bufferParts.push(chunk.slice(start, newlineIndex))
      const line = bufferParts.join('')
      bufferParts = []
      handleLine(line)
      if (closed) return
      start = newlineIndex + 1
    }
  })
  child.stderr.on('data', chunk => {
    stderr = `${stderr}${chunk}`.slice(-4_000)
  })
  child.on('error', rejectAll)
  child.on('close', (code, signal) => {
    if (!closed) {
      rejectAll(
        new Error(
          stderr.trim() || `Sudachi worker exited with ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
        ),
      )
    }
  })

  const sampleTimer = setInterval(() => {
    void sampleProcess(child.pid, metrics)
  }, 100)
  await ready
  await sampleProcess(child.pid, metrics)

  const request = async texts => {
    await ready
    const startedRequestAt = performance.now()
    const id = `benchmark-${nextId++}`
    const serializeStartedAt = performance.now()
    const input = JSON.stringify({ id, texts })
    const inputSerializationMs = performance.now() - serializeStartedAt
    const result = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, startedAt: startedRequestAt })
    })
    child.stdin.write(`${input}\n`)
    const response = await result
    return {
      ...response,
      inputSerializationMs,
      python: response.payload.timings,
    }
  }

  const shutdown = async () => {
    clearInterval(sampleTimer)
    if (!closed) {
      closed = true
      child.stdin.end()
      child.kill('SIGTERM')
      await new Promise(resolve => child.once('close', resolve))
    }
  }

  return {
    child,
    request,
    shutdown,
    readyTiming: await ready,
    metrics,
  }
}

const runOneShot = async texts => {
  const startedAt = performance.now()
  const input = JSON.stringify({ texts })
  const child = spawn(PYTHON, [SCRIPT], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stdout = []
  const stderr = []
  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))
  child.stdin.end(input)
  const result = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8').trim()))
        return
      }
      resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')))
    })
  })
  return {
    wallMs: round(performance.now() - startedAt),
    responseBytes: Buffer.byteLength(JSON.stringify(result)),
    python: result.timings,
  }
}

const textsForCount = (corpus, count) =>
  Array.from({ length: count }, (_, index) => corpus[index % corpus.length])

const runWarmSizes = async (corpus, counts) => {
  const worker = await createWorker()
  try {
    const results = []
    for (const count of counts) {
      const result = await worker.request(textsForCount(corpus, count))
      results.push({ count, wallMs: round(result.wallMs), responseBytes: result.responseBytes, python: result.python })
    }
    return {
      ready: worker.readyTiming,
      worker: worker.metrics,
      results,
    }
  } finally {
    await worker.shutdown()
  }
}

const splitTexts = (texts, count) =>
  Array.from({ length: count }, (_, index) =>
    texts.filter((_, textIndex) => textIndex % count === index),
  )

const runConcurrency = async (corpus, concurrency, totalTexts) => {
  const worker = await createWorker()
  try {
    const batches = splitTexts(textsForCount(corpus, totalTexts), concurrency)
    const startedAt = performance.now()
    const results = await Promise.all(batches.map(batch => worker.request(batch)))
    return {
      concurrency,
      totalTexts,
      wallMs: round(performance.now() - startedAt),
      requestWallMs: results.map(result => round(result.wallMs)),
      worker: worker.metrics,
      pythonTotalMs: round(results.reduce((sum, result) => sum + (result.python?.totalAnalysisMs || 0), 0)),
    }
  } finally {
    await worker.shutdown()
  }
}

async function main() {
  const corpus = await loadCorpus()
  if (corpus.texts.length === 0) throw new Error('数据库中没有可用于 Sudachi benchmark 的日语文本。')
  console.log(JSON.stringify({
    corpus: {
      papers: corpus.papers,
      texts: corpus.texts.length,
      characters: corpus.characters,
    },
    python: PYTHON,
  }))

  const cold = await runOneShot(textsForCount(corpus.texts, corpus.texts.length))
  console.log(JSON.stringify({ oneShotCold: cold }))

  const warm = await runWarmSizes(corpus.texts, [100, 500, 1000])
  console.log(JSON.stringify({ persistentWorker: warm }))

  const concurrency = []
  for (const level of [1, 2, 4]) {
    concurrency.push(await runConcurrency(corpus.texts, level, 1000))
  }
  console.log(JSON.stringify({ concurrency }))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

import { spawn } from 'node:child_process'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { formatJapaneseTextWithSudachiRubyNotation } from '../utils/language/japaneseRuby.ts'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const ROOT = process.cwd()
const PYTHON =
  process.env.SUDACHI_PYTHON?.trim() || path.join(ROOT, '.venv', 'bin', 'python')
const SCRIPT = path.join(ROOT, 'scripts', 'sudachi_pronunciation.py')

const JAPANESE_CHAR_REGEX =
  /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/
const hasJapanese = text => JAPANESE_CHAR_REGEX.test(text || '')

function parseRubyNotationToSegments(notation) {
  const segments = []
  const regex = /\{([^|{}]+)\|([^|{}]+)\}|([^{}]+)/g
  let match
  while ((match = regex.exec(notation)) !== null) {
    if (match[1] && match[2]) {
      segments.push({ text: match[1], reading: match[2] })
    } else if (match[3]) {
      segments.push({ text: match[3] })
    }
  }
  return segments
}

class SudachiWorkerClient {
  constructor() {
    this.child = null
    this.nextId = 1
    this.pending = new Map()
    this.buffer = ''
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.child = spawn(PYTHON, [SCRIPT, '--worker'], {
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.child.stdout.setEncoding('utf8')
      this.child.stderr.setEncoding('utf8')

      let ready = false

      this.child.stdout.on('data', chunk => {
        this.buffer += chunk
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'ready') {
              ready = true
              resolve()
              continue
            }
            const pendingReq = this.pending.get(msg.id)
            if (pendingReq) {
              this.pending.delete(msg.id)
              if (msg.type === 'error') {
                pendingReq.reject(new Error(msg.message || 'Worker error'))
              } else {
                pendingReq.resolve(msg)
              }
            }
          } catch (err) {
            console.error('Failed to parse line:', line, err)
          }
        }
      })

      this.child.on('error', err => {
        if (!ready) reject(err)
      })

      this.child.on('exit', code => {
        if (!ready) reject(new Error(`Worker exited with code ${code}`))
        for (const req of this.pending.values()) {
          req.reject(new Error(`Worker closed unexpectedly`))
        }
        this.pending.clear()
      })
    })
  }

  async analyze(texts) {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('Worker not running')
    }
    const id = String(this.nextId++)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(JSON.stringify({ id, type: 'analyze', texts }) + '\n')
    })
  }

  close() {
    if (this.child) {
      try {
        this.child.stdin.write(JSON.stringify({ type: 'close' }) + '\n')
      } catch {}
      this.child.kill()
      this.child = null
    }
  }
}

async function main() {
  const startTotal = performance.now()
  console.log('--- Starting Vocabulary Pronunciation Materialization Backfill ---')

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
  const worker = new SudachiWorkerClient()

  try {
    console.log('Starting Sudachi persistent worker...')
    await worker.start()
    console.log('Sudachi persistent worker ready.')

    // 1. Backfill Vocabulary items
    const vocabularies = await prisma.vocabulary.findMany({
      where: {
        OR: [
          { pronunciationVersion: null },
          { pronunciationVersion: { lt: 1 } },
        ],
      },
      select: { id: true, word: true, pronunciations: true },
    })

    const japaneseVocabs = vocabularies.filter(v => hasJapanese(v.word))
    console.log(
      `Found ${vocabularies.length} vocabulary rows needing check (${japaneseVocabs.length} with Japanese characters).`,
    )

    const BATCH_SIZE = 300
    let vocabUpdated = 0

    for (let i = 0; i < japaneseVocabs.length; i += BATCH_SIZE) {
      const chunk = japaneseVocabs.slice(i, i + BATCH_SIZE)
      const words = Array.from(new Set(chunk.map(v => v.word.trim()).filter(Boolean)))

      const analysis = await worker.analyze(words)
      const updates = []

      for (const vocab of chunk) {
        const word = vocab.word.trim()
        const notation = formatJapaneseTextWithSudachiRubyNotation(
          word,
          analysis.lexicon,
        )
        const segments = parseRubyNotationToSegments(notation)
        const reading = analysis.pronunciationMap[word] || undefined
        const data = {
          segments: segments.length > 0 ? segments : [{ text: word }],
          ...(reading ? { reading } : {}),
        }

        updates.push(
          prisma.vocabulary.update({
            where: { id: vocab.id },
            data: {
              pronunciationData: data,
              pronunciationVersion: 1,
            },
          }),
        )
      }

      await prisma.$transaction(updates)
      vocabUpdated += updates.length
      console.log(
        `[Vocabulary] Processed ${vocabUpdated}/${japaneseVocabs.length} (Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(japaneseVocabs.length / BATCH_SIZE)})`,
      )
    }

    // Mark non-Japanese vocabularies with version 1 so they don't query again
    const nonJapaneseVocabs = vocabularies.filter(v => !hasJapanese(v.word))
    if (nonJapaneseVocabs.length > 0) {
      for (let i = 0; i < nonJapaneseVocabs.length; i += BATCH_SIZE) {
        const chunk = nonJapaneseVocabs.slice(i, i + BATCH_SIZE)
        await prisma.vocabulary.updateMany({
          where: { id: { in: chunk.map(v => v.id) } },
          data: { pronunciationVersion: 1 },
        })
      }
      console.log(`[Vocabulary] Marked ${nonJapaneseVocabs.length} non-Japanese entries with version 1.`)
    }

    // 2. Backfill VocabularySentence items
    const sentences = await prisma.vocabularySentence.findMany({
      where: {
        OR: [
          { pronunciationVersion: null },
          { pronunciationVersion: { lt: 1 } },
        ],
      },
      select: { id: true, text: true },
    })

    const japaneseSentences = sentences.filter(s => hasJapanese(s.text))
    console.log(
      `Found ${sentences.length} sentence rows needing check (${japaneseSentences.length} with Japanese characters).`,
    )

    let sentUpdated = 0
    for (let i = 0; i < japaneseSentences.length; i += BATCH_SIZE) {
      const chunk = japaneseSentences.slice(i, i + BATCH_SIZE)
      const texts = Array.from(new Set(chunk.map(s => s.text.trim()).filter(Boolean)))

      const analysis = await worker.analyze(texts)
      const updates = []

      for (const sent of chunk) {
        const text = sent.text.trim()
        const notation = formatJapaneseTextWithSudachiRubyNotation(
          text,
          analysis.lexicon,
        )
        const segments = parseRubyNotationToSegments(notation)
        const data = {
          segments: segments.length > 0 ? segments : [{ text }],
        }

        updates.push(
          prisma.vocabularySentence.update({
            where: { id: sent.id },
            data: {
              pronunciationData: data,
              pronunciationVersion: 1,
            },
          }),
        )
      }

      await prisma.$transaction(updates)
      sentUpdated += updates.length
      console.log(
        `[Sentence] Processed ${sentUpdated}/${japaneseSentences.length} (Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(japaneseSentences.length / BATCH_SIZE)})`,
      )
    }

    // Mark non-Japanese sentences with version 1
    const nonJapaneseSentences = sentences.filter(s => !hasJapanese(s.text))
    if (nonJapaneseSentences.length > 0) {
      for (let i = 0; i < nonJapaneseSentences.length; i += BATCH_SIZE) {
        const chunk = nonJapaneseSentences.slice(i, i + BATCH_SIZE)
        await prisma.vocabularySentence.updateMany({
          where: { id: { in: chunk.map(s => s.id) } },
          data: { pronunciationVersion: 1 },
        })
      }
      console.log(`[Sentence] Marked ${nonJapaneseSentences.length} non-Japanese entries with version 1.`)
    }

    const elapsed = Math.round(performance.now() - startTotal)
    console.log('--- Backfill Completed Successfully ---')
    console.log(
      `Summary: Updated ${vocabUpdated} vocabularies and ${sentUpdated} sentences in ${elapsed}ms.`,
    )
  } finally {
    worker.close()
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})

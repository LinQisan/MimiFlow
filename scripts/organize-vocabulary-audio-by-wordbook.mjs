import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { mkdir, readdir, rename, rmdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePathInsideRoot } from '../utils/files/path.ts'
import { buildVocabularyAudioFolder } from '../utils/vocabulary/audioFolder.ts'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
const shouldApply = process.argv.includes('--apply')
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_AUDIO_ROOT = path.resolve(SCRIPT_DIRECTORY, '../public/audios')

const pathExists = async value => {
  try {
    await stat(value)
    return true
  } catch {
    return false
  }
}

const seriesPriority = title => {
  if (title.includes('N2語彙トレーニング')) return 0
  if (title === '红宝书') return 1
  return 2
}

const toAudioAbsolutePath = audioPath => {
  if (!audioPath.startsWith('/audios/')) return null
  return resolvePathInsideRoot(
    PUBLIC_AUDIO_ROOT,
    audioPath.replace(/^\/audios\//, ''),
  )
}

const toTargetWebPath = (wordbook, fileName) => {
  const folder = buildVocabularyAudioFolder(
    wordbook.series.title,
    wordbook.title,
  )
  return folder ? `/audios/${folder}/${fileName}` : ''
}

const uniqueTargetPath = async targetPath => {
  const parsed = path.parse(targetPath)
  let candidate = targetPath
  let suffix = 2
  while (await pathExists(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`)
    suffix += 1
  }
  return candidate
}

const removeEmptyDirectories = async directory => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    await removeEmptyDirectories(path.join(directory, entry.name))
  }
  if (path.resolve(directory) !== path.resolve(PUBLIC_AUDIO_ROOT, 'vocabulary')) {
    await rmdir(directory).catch(() => {})
  }
}

async function organize() {
  const [wordbooks, sentences, materials] = await Promise.all([
    prisma.wordbook.findMany({
      select: {
        id: true,
        title: true,
        series: { select: { title: true } },
        entries: {
          select: { vocabulary: { select: { wordAudio: true } } },
        },
      },
    }),
    prisma.vocabularySentence.findMany({
      where: { audioFile: { not: null } },
      select: { audioFile: true, source: true, sourceUrl: true },
    }),
    prisma.material.findMany({ select: { contentPayload: true } }),
  ])

  const wordbookById = new Map(wordbooks.map(wordbook => [wordbook.id, wordbook]))
  const titleCounts = new Map()
  wordbooks.forEach(wordbook => {
    titleCounts.set(wordbook.title, (titleCounts.get(wordbook.title) || 0) + 1)
  })
  const wordbookBySource = new Map()
  wordbooks.forEach(wordbook => {
    wordbookBySource.set(
      `${wordbook.series.title} › ${wordbook.title}`,
      wordbook,
    )
    wordbookBySource.set(`${wordbook.series.title}/${wordbook.title}`, wordbook)
    if (titleCounts.get(wordbook.title) === 1) {
      wordbookBySource.set(wordbook.title, wordbook)
    }
  })

  const ownership = new Map()
  const offerOwnership = (audioPath, wordbook, score) => {
    if (!audioPath?.startsWith('/audios/vocabulary/')) return
    const current = ownership.get(audioPath)
    if (!current || score < current.score) ownership.set(audioPath, { wordbook, score })
  }

  wordbooks.forEach(wordbook => {
    wordbook.entries.forEach(entry => {
      const audioPath = entry.vocabulary.wordAudio
      const currentTargetFolder = `/audios/${buildVocabularyAudioFolder(
        wordbook.series.title,
        wordbook.title,
      )}/`
      const alreadyOwnedByWordbook = audioPath?.startsWith(currentTargetFolder)
      const redBookMatch =
        wordbook.series.title === '红宝书' &&
        audioPath?.includes(`/vocabulary/red-book/${wordbook.title}/`)
      offerOwnership(
        audioPath,
        wordbook,
        alreadyOwnedByWordbook
          ? -30
          : redBookMatch
            ? -10
            : seriesPriority(wordbook.series.title),
      )
    })
  })
  sentences.forEach(sentence => {
    const wordbookId = sentence.sourceUrl.match(
      /^\/vocabulary\/wordbooks\/([^/?#]+)/,
    )?.[1]
    const wordbook =
      (wordbookId ? wordbookById.get(wordbookId) : null) ||
      wordbookBySource.get(sentence.source)
    if (wordbook) offerOwnership(sentence.audioFile, wordbook, -20)
  })

  const materialPayloadText = materials
    .map(material => JSON.stringify(material.contentPayload))
    .join('\n')
  const moves = []
  let missingFiles = 0
  let protectedFiles = 0
  for (const [audioPath, { wordbook }] of ownership) {
    const sourcePath = toAudioAbsolutePath(audioPath)
    if (!sourcePath || !(await pathExists(sourcePath))) {
      missingFiles += 1
      continue
    }
    if (materialPayloadText.includes(audioPath)) {
      protectedFiles += 1
      continue
    }
    const targetWebPath = toTargetWebPath(wordbook, path.basename(sourcePath))
    if (!targetWebPath || targetWebPath === audioPath) continue
    const requestedTargetPath = toAudioAbsolutePath(targetWebPath)
    if (!requestedTargetPath) continue
    moves.push({ audioPath, sourcePath, requestedTargetPath, targetWebPath })
  }

  if (!shouldApply) {
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        linkedAudioPaths: ownership.size,
        plannedMoves: moves.length,
        missingFiles,
        protectedFiles,
      }),
    )
    return
  }

  let moved = 0
  for (const move of moves) {
    await mkdir(path.dirname(move.requestedTargetPath), { recursive: true })
    const targetPath = await uniqueTargetPath(move.requestedTargetPath)
    const targetWebPath = `/audios/${path
      .relative(PUBLIC_AUDIO_ROOT, targetPath)
      .split(path.sep)
      .join('/')}`
    await rename(move.sourcePath, targetPath)
    try {
      await prisma.$transaction([
        prisma.vocabulary.updateMany({
          where: { wordAudio: move.audioPath },
          data: { wordAudio: targetWebPath },
        }),
        prisma.vocabularySentence.updateMany({
          where: { audioFile: move.audioPath },
          data: { audioFile: targetWebPath },
        }),
      ])
      moved += 1
    } catch (error) {
      await rename(targetPath, move.sourcePath).catch(() => {})
      throw error
    }
  }
  await removeEmptyDirectories(path.join(PUBLIC_AUDIO_ROOT, 'vocabulary'))
  console.log(
    JSON.stringify({
      mode: 'apply',
      linkedAudioPaths: ownership.size,
      moved,
      missingFiles,
      protectedFiles,
    }),
  )
}

try {
  await organize()
} finally {
  await prisma.$disconnect()
}

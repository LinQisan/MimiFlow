// app/upload/action.ts
'use server'

import { CollectionType, MaterialType, Prisma } from '@prisma/client'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  formatJlptListeningTitle,
  parseJlptListeningIdentity,
} from '@/utils/listening/jlptIdentity'
import { revalidatePath } from 'next/cache'
import { resolvePathInsideRoot } from '@/utils/files/path'

import prisma from '@/lib/prisma'
import { replaceMediaSubtitleSearchIndex } from '@/lib/media-subtitles/search-index'
import {
  getMaterialCollectionTypeError,
  isCollectionTypeAllowedForMaterial,
} from '@/modules/import/collection-policy'

function assTimeToSeconds(timeStr: string): number {
  const [h, m, s] = timeStr.split(':')
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)
}

type RawSubtitle = {
  id: number
  text: string
  rawStart: number
  rawEnd: number
}

type ProcessedSubtitle = {
  id: number
  stableId: string
  text: string
  start: number
  end: number
  sequenceId: number
}

type TimedSubtitleDraft = {
  text: string
  start: number
  end: number
}

function splitDialogueTextToLines(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

function parseAssToRawSubs(assContent: string): RawSubtitle[] {
  const subs: RawSubtitle[] = []
  const lines = assContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
  let eventsStarted = false
  let dialogueId = 1
  let formatFields: string[] = []
  let startIndex = 1
  let endIndex = 2
  let textIndex = 9

  for (let line of lines) {
    line = line.trim()
    if (line === '[Events]') {
      eventsStarted = true
      continue
    }
    if (!eventsStarted) continue
    if (line.startsWith('Format:')) {
      formatFields = line
        .replace('Format:', '')
        .split(',')
        .map(item => item.trim().toLowerCase())
      const sIndex = formatFields.indexOf('start')
      const eIndex = formatFields.indexOf('end')
      const tIndex = formatFields.indexOf('text')
      if (sIndex >= 0) startIndex = sIndex
      if (eIndex >= 0) endIndex = eIndex
      if (tIndex >= 0) textIndex = tIndex
      continue
    }
    if (!line.startsWith('Dialogue:')) continue

    const row = line.replace('Dialogue:', '').trim()
    const splitLimit = formatFields.length > 0 ? formatFields.length : textIndex + 1
    const parts: string[] = []
    let cursor = 0
    for (let idx = 0; idx < splitLimit - 1; idx += 1) {
      const commaIndex = row.indexOf(',', cursor)
      if (commaIndex === -1) break
      parts.push(row.slice(cursor, commaIndex))
      cursor = commaIndex + 1
    }
    parts.push(row.slice(cursor))
    if (parts.length <= Math.max(startIndex, endIndex, textIndex)) continue

    const startStr = parts[startIndex]
    const endStr = parts[endIndex]
    const text = parts[textIndex]
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\{[^}]*\}/g, '')
      .trim()
    if (!text) continue

    const rawStart = assTimeToSeconds(startStr)
    const rawEnd = assTimeToSeconds(endStr)
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue
    if (rawEnd <= rawStart) continue

    const sentenceLines = splitDialogueTextToLines(text)
    for (const sentenceText of sentenceLines) {
      subs.push({
        id: dialogueId,
        text: sentenceText,
        rawStart,
        rawEnd,
      })
      dialogueId += 1
    }
  }

  return subs.sort((a, b) => a.rawStart - b.rawStart || a.rawEnd - b.rawEnd)
}

function applySmartPadding(
  subs: RawSubtitle[],
  padStart = 0.1,
  padEnd = 0.3,
  minGap = 0.05,
): ProcessedSubtitle[] {
  const minDuration = 0.05
  const result: ProcessedSubtitle[] = []

  for (let i = 0; i < subs.length; i += 1) {
    const sub = subs[i]
    let actualPadStart = padStart
    let actualPadEnd = padEnd

    if (i > 0) {
      const prevResultEnd = result[i - 1].end
      const availableSpace = sub.rawStart - prevResultEnd - minGap
      actualPadStart = availableSpace < 0 ? 0 : Math.min(padStart, availableSpace)
    }

    if (i < subs.length - 1) {
      const nextRawStart = subs[i + 1].rawStart
      const availableSpace = nextRawStart - sub.rawEnd - minGap
      actualPadEnd = availableSpace < 0 ? 0 : Math.min(padEnd, availableSpace)
    }

    const finalStart = Math.max(0, sub.rawStart - actualPadStart)
    let finalEnd = sub.rawEnd + actualPadEnd
    if (finalEnd < finalStart + minDuration) {
      finalEnd = finalStart + minDuration
    }

    result.push({
      id: i + 1,
      stableId: randomUUID(),
      text: sub.text,
      start: Number(finalStart.toFixed(2)),
      end: Number(finalEnd.toFixed(2)),
      sequenceId: i + 1,
    })
  }

  return result
}

function parseTimedSubtitleDrafts(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || !raw.trim()) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const text = String(record.text || '').trim()
        const start = Number(record.start)
        const end = Number(record.end)
        if (!text || !Number.isFinite(start) || !Number.isFinite(end)) {
          return null
        }
        if (start < 0 || end <= start) return null
        return {
          text,
          start: Number(start.toFixed(2)),
          end: Number(end.toFixed(2)),
        }
      })
      .filter((item): item is TimedSubtitleDraft => Boolean(item))
      .sort((a, b) => a.start - b.start || a.end - b.end)
  } catch {
    return []
  }
}

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.webm',
])

const PUBLIC_AUDIO_DIR = path.join(process.cwd(), 'public', 'audios')

function toSafeFilename(name: string) {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}._-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
}

function normalizeAudioFolderPath(folder: string) {
  return folder
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => toSafeFolderName(segment).slice(0, 100))
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .slice(0, 12)
    .join('/')
}

function getDefaultAudioUploadFolder() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year')?.value || 'unknown'
  const month = parts.find(part => part.type === 'month')?.value || '00'
  return `uploads/${year}-${month}`
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function toSafeFolderName(name: string) {
  return name
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
}

function ensureAudioWebPath(rawPath: string) {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function getBaseNameWithoutExt(filename: string) {
  return path.basename(filename, path.extname(filename))
}

function normalizeStem(raw: string) {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
}

async function buildMaterialSequencePlan(collectionId: string) {
  const rows = await prisma.collectionMaterial.findMany({
    where: { collectionId },
    select: { sortOrder: true },
  })
  const maxSortOrder = rows.reduce((acc, row) => Math.max(acc, row.sortOrder), -1)
  return { startSortOrder: maxSortOrder + 1 }
}

function deriveAudioPathForBatch(baseAudioPath: string, fileName: string) {
  const trimmed = ensureAudioWebPath(baseAudioPath).trim()
  if (!trimmed) return ''
  if (trimmed.endsWith('/')) {
    const base = toSafeFilename(getBaseNameWithoutExt(fileName)) || 'audio'
    return `${trimmed}${base}.mp3`
  }
  return trimmed
}

function getFolderPrefixFromSelection(folder: string) {
  const trimmed = folder.trim()
  if (!trimmed || trimmed === '(根目录)') return '/audios/'
  const normalized = trimmed
    .replace(/^\/audios\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!normalized) return '/audios/'
  return `/audios/${normalized}/`
}

function buildAudioStemMap(paths: string[]) {
  const map = new Map<string, string[]>()
  for (const audioPath of paths.sort((a, b) => a.localeCompare(b))) {
    const stem = normalizeStem(getBaseNameWithoutExt(audioPath))
    if (!stem) continue
    const bucket = map.get(stem) || []
    bucket.push(audioPath)
    map.set(stem, bucket)
  }
  return map
}

function cloneStemMap(source: Map<string, string[]>) {
  const cloned = new Map<string, string[]>()
  for (const [stem, list] of source.entries()) {
    cloned.set(stem, [...list])
  }
  return cloned
}

function shiftStemCandidate(stem: string, map: Map<string, string[]>) {
  const queue = map.get(stem)
  if (!queue || queue.length === 0) return null
  const next = queue.shift() || null
  if (queue.length === 0) map.delete(stem)
  return next
}

function removeStemCandidate(stem: string, map: Map<string, string[]>, value: string) {
  const queue = map.get(stem)
  if (!queue || queue.length === 0) return
  const idx = queue.indexOf(value)
  if (idx < 0) return
  queue.splice(idx, 1)
  if (queue.length === 0) map.delete(stem)
}

function parseAssAudioOverrides(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || !raw.trim()) return {} as Record<string, string>
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function pickAudioByStem(
  stem: string,
  scopedMap: Map<string, string[]>,
  globalMap: Map<string, string[]>,
) {
  const scoped = shiftStemCandidate(stem, scopedMap)
  if (scoped) {
    removeStemCandidate(stem, globalMap, scoped)
    return scoped
  }
  return shiftStemCandidate(stem, globalMap)
}

function getMaterialIdPrefix(type: MaterialType) {
  if (type === MaterialType.READING) return 'passage:'
  if (type === MaterialType.VOCAB_GRAMMAR) return 'quiz:'
  if (type === MaterialType.MEDIA_SUBTITLE) return 'media:'
  return 'lesson:'
}

function getLegacyModelByMaterialType(type: MaterialType) {
  if (type === MaterialType.READING) return 'Passage'
  if (type === MaterialType.VOCAB_GRAMMAR) return 'Quiz'
  if (type === MaterialType.MEDIA_SUBTITLE) return 'MediaSubtitle'
  return 'Lesson'
}

function parseRequestedMaterialType(
  raw: FormDataEntryValue | null,
): MaterialType | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (
    value === MaterialType.LISTENING ||
    value === MaterialType.MEDIA_SUBTITLE ||
    value === MaterialType.READING ||
    value === MaterialType.VOCAB_GRAMMAR ||
    value === MaterialType.SPEAKING
  ) {
    return value
  }
  return null
}

function normalizeCollectionTypeForMaterial(
  materialType: MaterialType,
  rawCollectionType: string,
) {
  const requested =
    rawCollectionType === CollectionType.CUSTOM_GROUP
      ? CollectionType.CUSTOM_GROUP
      : rawCollectionType === CollectionType.FAVORITES
        ? CollectionType.FAVORITES
        : CollectionType.PAPER

  if (isCollectionTypeAllowedForMaterial(materialType, requested)) {
    return requested
  }

  if (
    materialType === MaterialType.SPEAKING ||
    materialType === MaterialType.MEDIA_SUBTITLE
  ) {
    return CollectionType.CUSTOM_GROUP
  }

  return requested
}

async function inferCollectionMaterialType(collectionId: string) {
  const [listeningCount, mediaSubtitleCount, readingCount, vocabCount, speakingCount] =
    await Promise.all([
      prisma.material.count({
        where: {
          type: MaterialType.LISTENING,
          collectionMaterials: { some: { collectionId } },
        },
      }),
      prisma.material.count({
        where: {
          type: MaterialType.MEDIA_SUBTITLE,
          collectionMaterials: { some: { collectionId } },
        },
      }),
      prisma.material.count({
        where: {
          type: MaterialType.READING,
          collectionMaterials: { some: { collectionId } },
        },
      }),
      prisma.material.count({
        where: {
          type: MaterialType.VOCAB_GRAMMAR,
          collectionMaterials: { some: { collectionId } },
        },
      }),
      prisma.material.count({
        where: {
          type: MaterialType.SPEAKING,
          collectionMaterials: { some: { collectionId } },
        },
      }),
    ])

  const ranked: Array<{ type: MaterialType; count: number }> = [
    { type: MaterialType.LISTENING, count: listeningCount },
    { type: MaterialType.MEDIA_SUBTITLE, count: mediaSubtitleCount },
    { type: MaterialType.READING, count: readingCount },
    { type: MaterialType.VOCAB_GRAMMAR, count: vocabCount },
    { type: MaterialType.SPEAKING, count: speakingCount },
  ].sort((a, b) => b.count - a.count)

  if (ranked[0].count > 0) return ranked[0].type
  return MaterialType.LISTENING
}

async function ensureTargetCollections(
  formData: FormData,
  materialType: MaterialType,
) {
  const uploadMode = formData.get('uploadMode') as string
  const paperId = (formData.get('paperId') as string)?.trim()

  if (uploadMode === 'new') {
    const collectionName =
      (formData.get('collectionName') as string)?.trim() ||
      (formData.get('categoryName') as string)?.trim()
    const rawCollectionType = (formData.get('collectionType') as string)?.trim()
    if (!collectionName) {
      throw new Error('请填写新集合名称。')
    }
    const collectionType = normalizeCollectionTypeForMaterial(
      materialType,
      rawCollectionType,
    )
    const created = await prisma.collection.create({
      data: {
        title: collectionName,
        collectionType,
      },
      select: { id: true },
    })
    return { primaryCollectionId: created.id, collectionIds: [created.id] }
  }

  const collectionIds = Array.from(
    new Set(
      formData
        .getAll('collectionIds')
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )
  if (collectionIds.length === 0 && paperId) collectionIds.push(paperId)

  if (collectionIds.length === 0) {
    throw new Error('集合信息缺失，请重新选择集合。')
  }

  const existingCollections = await prisma.collection.findMany({
    where: { id: { in: collectionIds } },
    select: { id: true, collectionType: true },
  })
  if (existingCollections.length !== collectionIds.length) {
    throw new Error('部分集合不存在，请刷新页面后重新选择。')
  }
  for (const collection of existingCollections) {
    const typeError = getMaterialCollectionTypeError(
      materialType,
      collection.collectionType,
    )
    if (typeError) throw new Error(typeError)
  }
  return {
    primaryCollectionId: collectionIds[0],
    collectionIds,
  }
}

async function getCollectionAudioFolderName(collectionId: string | null) {
  if (!collectionId) return ''
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { title: true },
  })
  return toSafeFolderName(collection?.title || '')
}

function parseUploadMode(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string') return 'existing'
  return raw.trim()
}

async function walkAudioFiles(dir: string, baseDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkAudioFiles(fullPath, baseDir)))
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(ext)) continue

    const rel = path.relative(baseDir, fullPath).split(path.sep).join('/')
    results.push(`/audios/${rel}`)
  }

  return results
}

export async function listPublicAudioFiles() {
  try {
    const files = await walkAudioFiles(PUBLIC_AUDIO_DIR, PUBLIC_AUDIO_DIR)
    return {
      success: true,
      files: files.sort((a, b) => a.localeCompare(b)),
    }
  } catch (error) {
    console.error('读取音频目录失败:', error)
    return { success: false, files: [] as string[] }
  }
}

async function saveUploadedAudio(
  file: File,
  folderName = '',
  mp3Only = false,
) {
  if (!file || file.size === 0) {
    throw new Error('未检测到录音文件，请重新选择。')
  }

  const ext = path.extname(file.name).toLowerCase()
  if (mp3Only && ext !== '.mp3') {
    throw new Error('听力录音仅支持 MP3 文件。')
  }
  if (!AUDIO_EXTENSIONS.has(ext)) {
    throw new Error('录音格式不支持，请上传 mp3/m4a/wav/ogg/aac/flac/webm。')
  }

  const safeFolderName =
    normalizeAudioFolderPath(folderName) || getDefaultAudioUploadFolder()
  const targetDir = resolvePathInsideRoot(PUBLIC_AUDIO_DIR, safeFolderName)
  if (!targetDir) throw new Error('录音保存目录无效。')
  await mkdir(targetDir, { recursive: true })

  const base = path.basename(file.name, ext)
  const safeBase = toSafeFilename(base) || 'audio'
  let finalName = `${safeBase}${ext}`
  let suffix = 2
  while (await fileExists(path.join(targetDir, finalName))) {
    finalName = `${safeBase}-${suffix}${ext}`
    suffix += 1
  }
  const finalPath = path.join(targetDir, finalName)
  const bytes = Buffer.from(await file.arrayBuffer())
  await writeFile(finalPath, bytes)

  return `/audios/${safeFolderName}/${finalName}`
}

export async function uploadAssAndSaveData(formData: FormData) {
  try {
    const uploadMode = parseUploadMode(formData.get('uploadMode'))
    const isMediaUploadMode = uploadMode === 'media'
    const requestedMaterialType = isMediaUploadMode
      ? MaterialType.MEDIA_SUBTITLE
      : parseRequestedMaterialType(formData.get('materialType'))
    const targetCollections = isMediaUploadMode
      ? { primaryCollectionId: null, collectionIds: [] as string[] }
      : await ensureTargetCollections(
          formData,
          requestedMaterialType || MaterialType.LISTENING,
        )
    const collectionId = targetCollections.primaryCollectionId
    const collectionIds = targetCollections.collectionIds
    const subtitleNoAudio = isMediaUploadMode
    const rawSubtitleSourceType = (
      (formData.get('subtitleSourceType') as string) || ''
    ).trim()
    const subtitleSourceType =
      isMediaUploadMode && rawSubtitleSourceType === 'TV' ? 'TV' : 'MOVIE'
    const subtitleWorkTitle = isMediaUploadMode
      ? (formData.get('subtitleWorkTitle') as string)?.trim() || ''
      : ''
    const subtitleSeason = isMediaUploadMode
      ? (formData.get('subtitleSeason') as string)?.trim() || ''
      : ''
    const subtitleEpisode = isMediaUploadMode
      ? (formData.get('subtitleEpisode') as string)?.trim() || ''
      : ''
    const matchedMaterialType =
      requestedMaterialType ||
      (collectionId
        ? await inferCollectionMaterialType(collectionId)
        : isMediaUploadMode
          ? MaterialType.MEDIA_SUBTITLE
          : MaterialType.LISTENING)
    const audioFolderName = await getCollectionAudioFolderName(collectionId)
    const title = (formData.get('title') as string)?.trim()
    const audioSourceType = (formData.get('audioSourceType') as string) || 'manual'
    const audioFileField = formData.get('audioFile')
    const audioFileFromInput = typeof audioFileField === 'string' ? audioFileField : ''
    const audioUploadFile = formData.get('audioUploadFile') as File | null
    const audioUploadFiles = (
      formData.getAll('audioUploadFiles').filter(item => item instanceof File) as File[]
    ).filter(file => file.size > 0)
    const uniqueAudioUploadFiles = Array.from(
      new Map(
        [...audioUploadFiles, ...(audioUploadFile ? [audioUploadFile] : [])].map(file => [
          `${file.name}_${file.size}`,
          file,
        ]),
      ).values(),
    )
    const audioMatchFolder = (formData.get('audioMatchFolder') as string) || ''
    const files = (
      formData.getAll('assFiles').filter(item => item instanceof File) as File[]
    ).filter(file => file.size > 0 && file.name.toLowerCase().endsWith('.ass'))
    const legacyFile = formData.get('assFile')
    if (legacyFile instanceof File && legacyFile.size > 0) {
      files.push(legacyFile)
    }

    const uniqueFiles = Array.from(
      new Map(files.map(file => [`${file.name}_${file.size}`, file])).values(),
    )
    if (uniqueFiles.length === 0) {
      throw new Error('没有检测到可导入的 .ass 文件。')
    }
    if (isMediaUploadMode && !subtitleWorkTitle) {
      throw new Error('请填写电影名或剧名。')
    }
    if (
      isMediaUploadMode &&
      subtitleSourceType === 'TV' &&
      (!subtitleSeason || !subtitleEpisode)
    ) {
      throw new Error('电视剧字幕请填写季和集。')
    }

    const isBatch = uniqueFiles.length > 1
    let baseAudioFile = ensureAudioWebPath(audioFileFromInput)
    const uploadedAudioByStem = new Map<string, string[]>()

    if (!subtitleNoAudio && audioSourceType === 'upload') {
      if (!isBatch) {
        const singleAudio = uniqueAudioUploadFiles[0] || audioUploadFile
        if (!singleAudio || singleAudio.size === 0) {
          throw new Error('请选择需要保存的录音文件。')
        }
        baseAudioFile = await saveUploadedAudio(
          singleAudio,
          audioFolderName,
          matchedMaterialType === MaterialType.LISTENING,
        )
      } else {
        for (const file of uniqueAudioUploadFiles) {
          const savedPath = await saveUploadedAudio(
            file,
            audioFolderName,
            matchedMaterialType === MaterialType.LISTENING,
          )
          const stem = normalizeStem(getBaseNameWithoutExt(file.name))
          const bucket = uploadedAudioByStem.get(stem) || []
          bucket.push(savedPath)
          uploadedAudioByStem.set(stem, bucket)
        }
      }
    }

    if (!subtitleNoAudio && !baseAudioFile && audioSourceType !== 'upload') {
      throw new Error('请填写或选择音频路径。')
    }

    const siteAudioFiles = await walkAudioFiles(PUBLIC_AUDIO_DIR, PUBLIC_AUDIO_DIR)
    const siteAudioByStem = buildAudioStemMap(siteAudioFiles)
    const folderPrefix = getFolderPrefixFromSelection(audioMatchFolder)
    const scopedSiteAudioByStem = buildAudioStemMap(
      siteAudioFiles.filter(item => item.startsWith(folderPrefix)),
    )

    const createdMaterials: { name: string; id: string }[] = []
    const matchedFromUpload: string[] = []
    const matchedFromSite: string[] = []
    const fallbackPaths: string[] = []
    const unmatchedAudio: string[] = []
    const assAudioOverrides = parseAssAudioOverrides(formData.get('assAudioOverrides'))
    const materialDescription = (formData.get('materialDescription') as string)?.trim() || ''
    const materialTranscript = (formData.get('materialTranscript') as string)?.trim() || ''
    const materialSourceInput =
      (formData.get('materialSource') as string)?.trim() || ''
    const materialSource =
      materialSourceInput || (isMediaUploadMode ? subtitleWorkTitle : '')
    const materialLanguage = (formData.get('materialLanguage') as string)?.trim() || ''
    const materialDifficulty = (formData.get('materialDifficulty') as string)?.trim() || ''
    const materialChapterName =
      (formData.get('materialChapterName') as string)?.trim() || ''
    const materialTags = ((formData.get('materialTags') as string) || '')
      .split(/[，,]/)
      .map(item => item.trim())
      .filter(Boolean)
    let overrideApplied = 0
    let overrideInvalid = 0
    const sequencePlans = new Map(
      await Promise.all(
        collectionIds.map(
          async id => [id, await buildMaterialSequencePlan(id)] as const,
        ),
      ),
    )
    const sequencePlan = collectionId
      ? sequencePlans.get(collectionId) || { startSortOrder: 0 }
      : { startSortOrder: 0 }
    const uploadedAudioQueueByStem = cloneStemMap(uploadedAudioByStem)
    const siteAudioQueueByStem = cloneStemMap(siteAudioByStem)
    const scopedSiteAudioQueueByStem = cloneStemMap(scopedSiteAudioByStem)
    let createdCount = 0

    for (let i = 0; i < uniqueFiles.length; i += 1) {
      const file = uniqueFiles[i]
      const fileContent = await file.text()
      const rawSubs = parseAssToRawSubs(fileContent)
      if (rawSubs.length === 0) {
        throw new Error(`文件 ${file.name} 未解析到有效字幕行。`)
      }

      const processedSubs = applySmartPadding(rawSubs, 0.1, 0.3, 0.05)
      const fileBase = getBaseNameWithoutExt(file.name)
      const draftTitle = isBatch ? (title ? `${title} · ${fileBase}` : fileBase) : title || fileBase
      const stem = normalizeStem(fileBase)
      let finalAudioFile = ''
      const overrideKey = `${file.name}::${file.size}`
      const overrideValue = (assAudioOverrides[overrideKey] || '').trim()

      if (overrideValue) {
        if (overrideValue.startsWith('upload://')) {
          const overrideStem = normalizeStem(overrideValue.replace(/^upload:\/\//, ''))
          const matchedUpload = shiftStemCandidate(
            overrideStem,
            uploadedAudioQueueByStem,
          )
          if (matchedUpload) {
            finalAudioFile = matchedUpload
            overrideApplied += 1
          } else {
            overrideInvalid += 1
          }
        } else {
          const webPath = ensureAudioWebPath(overrideValue)
          if (webPath.startsWith('/audios/')) {
            finalAudioFile = webPath
            overrideApplied += 1
          } else {
            overrideInvalid += 1
          }
        }
      }

      if (!finalAudioFile) {
        if (!isBatch) {
          finalAudioFile = baseAudioFile
        } else {
          const uploadMatched = shiftStemCandidate(stem, uploadedAudioQueueByStem)
          if (uploadMatched) {
            finalAudioFile = uploadMatched
            matchedFromUpload.push(file.name)
          } else {
            const siteMatched = pickAudioByStem(
              stem,
              scopedSiteAudioQueueByStem,
              siteAudioQueueByStem,
            )
            if (siteMatched) {
              finalAudioFile = siteMatched
              matchedFromSite.push(file.name)
            } else if (baseAudioFile) {
              finalAudioFile = deriveAudioPathForBatch(baseAudioFile, file.name)
              fallbackPaths.push(file.name)
            }
          }
        }
      }

      const jlptIdentity =
        matchedMaterialType === MaterialType.LISTENING
          ? parseJlptListeningIdentity(fileBase) ||
            parseJlptListeningIdentity(finalAudioFile) ||
            parseJlptListeningIdentity(draftTitle)
          : null
      const finalTitle = jlptIdentity
        ? formatJlptListeningTitle(jlptIdentity)
        : draftTitle

      if (!finalAudioFile) {
        if (subtitleNoAudio) {
          finalAudioFile = ''
        } else {
          unmatchedAudio.push(file.name)
          continue
        }
      }

      const materialId = `${getMaterialIdPrefix(matchedMaterialType)}${randomUUID()}`
      const nextSortOrder = sequencePlan.startSortOrder + createdCount
      const contentPayload: Record<string, unknown> = { dialogues: processedSubs }
      if (finalAudioFile) {
        contentPayload.audioUrl = finalAudioFile
        contentPayload.audioFile = finalAudioFile
      }
      if (isMediaUploadMode) contentPayload.subtitleNoAudio = true
      if (isMediaUploadMode) {
        contentPayload.subtitleSourceType = subtitleSourceType
      }
      if (subtitleWorkTitle) contentPayload.subtitleWorkTitle = subtitleWorkTitle
      if (subtitleSeason) contentPayload.subtitleSeason = subtitleSeason
      if (subtitleEpisode) contentPayload.subtitleEpisode = subtitleEpisode
      if (materialDescription) contentPayload.description = materialDescription
      if (materialTranscript) contentPayload.transcript = materialTranscript
      if (materialSource) contentPayload.source = materialSource
      if (materialLanguage) contentPayload.language = materialLanguage
      if (materialDifficulty) contentPayload.difficulty = materialDifficulty
      if (materialTags.length > 0) contentPayload.tags = materialTags
      if (matchedMaterialType === MaterialType.LISTENING) {
        contentPayload.questionEntryRequired = true
      }
      if (jlptIdentity) {
        contentPayload.listeningSectionNumber = jlptIdentity.sectionNumber
        contentPayload.sectionNumber = jlptIdentity.sectionNumber
        contentPayload.listeningSectionTitle = jlptIdentity.sectionLabel
        contentPayload.sectionTitle = jlptIdentity.sectionLabel
        contentPayload.questionNumber = jlptIdentity.questionNumber
        contentPayload.jlptLevel = jlptIdentity.level
        contentPayload.jlptSession = jlptIdentity.session
      }

      const metadata: Record<string, unknown> = {}
      if (collectionId) {
        metadata.legacy = {
          model: getLegacyModelByMaterialType(matchedMaterialType),
          paperId: collectionId,
          sortOrder: nextSortOrder,
        }
      }
      if (
        materialSource ||
        materialLanguage ||
        materialDifficulty ||
        materialTags.length > 0
      ) {
        metadata.upload = {
          source: materialSource || null,
          language: materialLanguage || null,
          difficulty: materialDifficulty || null,
          tags: materialTags,
        }
      }
      if (isMediaUploadMode) {
        metadata.subtitle = {
          noAudio: true,
          sourceType: subtitleSourceType,
          workTitle: subtitleWorkTitle || null,
          season: subtitleSeason || null,
          episode: subtitleEpisode || null,
        }
      }

      await prisma.$transaction(async tx => {
        await tx.material.create({
          data: {
            id: materialId,
            type: matchedMaterialType,
            title: finalTitle,
            chapterName:
              matchedMaterialType === MaterialType.SPEAKING
                ? materialChapterName || finalTitle
                : null,
            contentPayload: contentPayload as Prisma.InputJsonValue,
            metadata:
              Object.keys(metadata).length > 0
                ? (metadata as Prisma.InputJsonValue)
                : undefined,
            collectionMaterials: collectionIds.length > 0
              ? {
                  create: collectionIds.map(targetCollectionId => ({
                    collectionId: targetCollectionId,
                    sortOrder:
                      (sequencePlans.get(targetCollectionId)?.startSortOrder || 0) +
                      createdCount,
                  })),
                }
              : undefined,
          },
        })

        if (matchedMaterialType === MaterialType.MEDIA_SUBTITLE) {
          await replaceMediaSubtitleSearchIndex(tx, {
            id: materialId,
            title: finalTitle,
            contentPayload,
          })
        }
      })
      createdMaterials.push({ name: file.name, id: materialId })
      createdCount += 1
    }

    if (createdMaterials.length === 0) {
      throw new Error(
        unmatchedAudio.length > 0
          ? `未匹配到同名音频：${unmatchedAudio.slice(0, 3).join('、')}`
          : '未成功导入任何字幕文件。',
      )
    }

    const summary: string[] = []
    if (matchedFromUpload.length > 0) summary.push(`上传配对 ${matchedFromUpload.length}`)
    if (matchedFromSite.length > 0) summary.push(`站内配对 ${matchedFromSite.length}`)
    if (fallbackPaths.length > 0) summary.push(`路径推断 ${fallbackPaths.length}`)
    if (unmatchedAudio.length > 0) summary.push(`未匹配 ${unmatchedAudio.length}`)
    if (overrideApplied > 0) summary.push(`手动改配 ${overrideApplied}`)
    if (overrideInvalid > 0) summary.push(`无效改配 ${overrideInvalid}`)

    revalidatePath('/')
    revalidatePath('/manage/import')
    revalidatePath('/manage/collections')
    if (isMediaUploadMode) revalidatePath('/subtitles')

    return {
      success: true,
      message: isBatch
        ? `批量导入完成：${createdMaterials.length} 个字幕文件已写入（MaterialType=${matchedMaterialType}）。${summary.length > 0 ? `（${summary.join('，')}）` : ''}`
        : `成功导入 ${createdMaterials[0].name}（MaterialType=${matchedMaterialType}）。`,
      lessonIds: createdMaterials.map(item => item.id.split(':').slice(1).join(':')),
      materialType: matchedMaterialType,
      questionEntryRequired: matchedMaterialType === MaterialType.LISTENING,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('处理失败:', error)
    return { success: false, message: `导入失败: ${message}` }
  }
}

export async function createShadowingFromTimedAudio(formData: FormData) {
  try {
    const title = String(formData.get('title') || '').trim()
    const chapterName = String(formData.get('chapterName') || '').trim()
    const collectionMode = String(formData.get('collectionMode') || 'existing')
    const collectionIdInput = String(formData.get('collectionId') || '').trim()
    const collectionName = String(formData.get('collectionName') || '').trim()
    const description = String(formData.get('description') || '').trim()
    const source = String(formData.get('source') || '').trim()
    const language = String(formData.get('language') || '').trim()
    const difficulty = String(formData.get('difficulty') || '').trim()
    const tags = String(formData.get('tags') || '')
      .split(/[，,]/)
      .map(item => item.trim())
      .filter(Boolean)
    const audioFile = formData.get('audioFile') as File | null
    const subtitleDrafts = parseTimedSubtitleDrafts(formData.get('subtitleLines'))

    if (!title) throw new Error('请填写材料标题。')
    if (!audioFile || audioFile.size === 0) throw new Error('请上传音频文件。')
    if (subtitleDrafts.length === 0) {
      throw new Error('请至少添加一条有效字幕。')
    }

    let targetCollectionId = collectionIdInput
    if (collectionMode === 'new') {
      if (!collectionName) throw new Error('请填写新集合名称。')
      const created = await prisma.collection.create({
        data: {
          title: collectionName,
          collectionType: CollectionType.FAVORITES,
        },
        select: { id: true },
      })
      targetCollectionId = created.id
    }

    if (!targetCollectionId) throw new Error('请选择或新建跟读集合。')

    const collection = await prisma.collection.findUnique({
      where: { id: targetCollectionId },
      select: { id: true, title: true },
    })
    if (!collection) throw new Error('目标集合不存在，请刷新页面重试。')

    const savedAudioPath = await saveUploadedAudio(audioFile, collection.title)
    const materialId = `${getMaterialIdPrefix(MaterialType.SPEAKING)}${randomUUID()}`
    const maxRow = await prisma.collectionMaterial.aggregate({
      where: { collectionId: targetCollectionId },
      _max: { sortOrder: true },
    })
    const nextSortOrder = (maxRow._max.sortOrder ?? -1) + 1

    const dialogues: ProcessedSubtitle[] = subtitleDrafts.map((line, index) => ({
      id: index + 1,
      stableId: randomUUID(),
      text: line.text,
      start: line.start,
      end: line.end,
      sequenceId: index + 1,
    }))
    const transcript = dialogues.map(line => line.text).join('\n')
    const contentPayload: Record<string, unknown> = {
      audioUrl: savedAudioPath,
      audioFile: savedAudioPath,
      dialogues,
      transcript,
    }
    if (description) contentPayload.description = description
    if (source) contentPayload.source = source
    if (language) contentPayload.language = language
    if (difficulty) contentPayload.difficulty = difficulty
    if (tags.length > 0) contentPayload.tags = tags

    const metadata: Record<string, unknown> = {
      legacy: {
        model: getLegacyModelByMaterialType(MaterialType.SPEAKING),
        paperId: targetCollectionId,
        sortOrder: nextSortOrder,
      },
      upload: {
        source: source || null,
        language: language || null,
        difficulty: difficulty || null,
        tags,
        creationMode: 'timed-audio',
      },
    }

    await prisma.material.create({
      data: {
        id: materialId,
        type: MaterialType.SPEAKING,
        title,
        chapterName: chapterName || title,
        contentPayload: contentPayload as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
        collectionMaterials: {
          create: {
            collectionId: targetCollectionId,
            sortOrder: nextSortOrder,
          },
        },
      },
    })

    revalidatePath('/')
    revalidatePath('/manage/import')
    revalidatePath('/listening')
    revalidatePath('/manage/listening')
    revalidatePath('/manage/shadowing')
    revalidatePath('/manage/collections')

    return {
      success: true,
      message: `已导入跟读材料：${title}（${dialogues.length} 条字幕）。`,
      lessonId: materialId.split(':').slice(1).join(':'),
      materialId,
      audioFile: savedAudioPath,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('音频打轴导入失败:', error)
    return { success: false, message: `导入失败: ${message}` }
  }
}

// app/upload/action.ts
'use server'

import {
  CollectionType,
  MaterialType,
  Prisma,
} from '@prisma/client'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  formatJlptListeningTitle,
  parseJlptListeningIdentity,
} from '@/utils/listening/jlptIdentity'
import { revalidatePath } from 'next/cache'
import { resolvePathInsideRoot } from '@/utils/files/path'
import {
  PUBLIC_AUDIO_ROOT,
  PUBLIC_QUESTION_IMAGE_ROOT,
} from '@/lib/server/public-paths'

import prisma from '@/lib/prisma'
import { replaceMediaSubtitleSearchIndex } from '@/lib/media-subtitles/search-index'
import { encodeMaterialPayload } from '@/lib/codecs/material-payload'
import {
  getMaterialCollectionTypeError,
  isCollectionTypeAllowedForMaterial,
} from '@/modules/import/collection-policy'
import {
  buildCollectionAudioFolder,
} from '@/modules/import/audio/domain'
import { parseListeningQuestionDraftPayload } from '@/modules/import/domain/listening-question-drafts'
import { selectListeningQuestionEntriesForFile } from '@/modules/import/domain/listening-batch-assignments'
import { encodeQuestionContent } from '@/lib/codecs/question-content'
import { toQuestionOptionsAndAnswer } from '@/modules/practice/domain/question-record'
import { getToeicPartByQuestionType } from '@/modules/questions/domain/toeic'
import { normalizePaperAttributes } from '@/modules/practice/domain/paper-attributes'
import {
  applyAssTimelinePadding,
  parseAssToRawSubtitles,
} from '@/modules/import/audio/ass'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/modules/practice/server/vocabulary-analytics'

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.aac',
  '.flac',
  '.webm',
])

const PUBLIC_AUDIO_DIR = PUBLIC_AUDIO_ROOT
const PUBLIC_QUESTION_IMAGE_DIR = PUBLIC_QUESTION_IMAGE_ROOT

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
    const collectionLanguage =
      (formData.get('collectionLanguage') as string)?.trim().toLowerCase() || null
    if (!collectionName) {
      throw new Error('请填写新集合名称。')
    }
    const collectionType = normalizeCollectionTypeForMaterial(
      materialType,
      rawCollectionType,
    )
    const paperAttributes = normalizePaperAttributes({
      title: collectionName,
      language: collectionLanguage,
    })
    const created = await prisma.collection.create({
      data: {
        title: collectionName,
        collectionType,
        acceptedMaterialTypes:
          collectionType === CollectionType.PAPER
            ? paperAttributes.acceptedMaterialTypes
            : [materialType],
        language:
          collectionType === CollectionType.PAPER
            ? paperAttributes.language
            : collectionLanguage,
        level:
          collectionType === CollectionType.PAPER
            ? paperAttributes.level
            : null,
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

async function getCollectionAudioFolderName(
  collectionId: string | null,
  materialType: MaterialType,
) {
  if (!collectionId) return ''
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: {
      id: true,
      title: true,
      level: true,
      collectionType: true,
      parent: { select: { id: true, title: true } },
    },
  })
  if (!collection) return ''

  return buildCollectionAudioFolder({ materialType, collection })
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

async function saveUploadedQuestionImage(
  file: File,
  questionIndex: number,
  questionTitle: string,
  questionCount: number,
  nameSuffix = '',
  imageLabel = '题目图片',
) {
  const extensionByMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  }
  const extension = extensionByMime[file.type]
  if (!extension) {
    throw new Error(
      `第 ${questionIndex + 1} 题${imageLabel}仅支持 JPG、PNG 或 WebP。`,
    )
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`第 ${questionIndex + 1} 题${imageLabel}不能超过 10MB。`)
  }

  await mkdir(PUBLIC_QUESTION_IMAGE_DIR, { recursive: true })
  const safeTitle = toSafeFilename(questionTitle) || `question-${questionIndex + 1}`
  const indexedTitle =
    questionCount > 1 ? `${safeTitle}-${questionIndex + 1}` : safeTitle
  const imageTitle = `${indexedTitle}${nameSuffix}`
  let fileName = `${imageTitle}${extension}`
  let suffix = 2
  while (await fileExists(path.join(PUBLIC_QUESTION_IMAGE_DIR, fileName))) {
    fileName = `${imageTitle}-${suffix}${extension}`
    suffix += 1
  }
  await writeFile(
    path.join(PUBLIC_QUESTION_IMAGE_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  )
  return `/images/questions/${fileName}`
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
    const audioFolderName = await getCollectionAudioFolderName(
      collectionId,
      matchedMaterialType,
    )
    const title = (formData.get('title') as string)?.trim()
    const audioSourceType = (formData.get('audioSourceType') as string) || 'manual'
    const audioFileField = formData.get('audioFile')
    const audioFileFromInput = typeof audioFileField === 'string' ? audioFileField : ''
    const audioUploadFile = formData.get('audioUploadFile') as File | null
    const audioUploadFiles = (
      formData.getAll('audioUploadFiles').filter(item => item instanceof File) as File[]
    ).filter(file => file.size > 0)
    const combinedMediaFiles = (
      formData.getAll('mediaFiles').filter(item => item instanceof File) as File[]
    ).filter(file => file.size > 0)
    const combinedAudioFiles = combinedMediaFiles.filter(file =>
      file.name.toLowerCase().endsWith('.mp3'),
    )
    const combinedSubtitleFiles = combinedMediaFiles.filter(file =>
      file.name.toLowerCase().endsWith('.ass'),
    )
    const uniqueAudioUploadFiles = Array.from(
      new Map(
        [
          ...audioUploadFiles,
          ...combinedAudioFiles,
          ...(audioUploadFile ? [audioUploadFile] : []),
        ].map(file => [`${file.name}_${file.size}`, file]),
      ).values(),
    )
    const audioMatchFolder = (formData.get('audioMatchFolder') as string) || ''
    const files = (
      [
        ...(formData
          .getAll('assFiles')
          .filter(item => item instanceof File) as File[]),
        ...combinedSubtitleFiles,
      ]
    ).filter(file => file.size > 0 && file.name.toLowerCase().endsWith('.ass'))

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
    const listeningQuestionDrafts =
      matchedMaterialType === MaterialType.LISTENING
        ? parseListeningQuestionDraftPayload(
            formData.get('listeningQuestionsJson'),
          )
        : {
            listeningSectionNumber: null,
            listeningSectionTitle: null,
            questions: [],
          }
    const questionImageTitle =
      title || getBaseNameWithoutExt(uniqueFiles[0]?.name || '')
    const listeningQuestionImagePaths = await Promise.all(
      listeningQuestionDrafts.questions.map(async (question, questionIndex) => {
        if (question.questionType !== 'TOEIC_PHOTOGRAPH') return ''
        const image = formData.get(`listeningQuestionImage_${questionIndex}`)
        if (!(image instanceof File) || image.size === 0) {
          throw new Error(`请上传第 ${questionIndex + 1} 题的题目图片。`)
        }
        return saveUploadedQuestionImage(
          image,
          questionIndex,
          questionImageTitle,
          listeningQuestionDrafts.questions.length,
        )
      }),
    )
    const listeningOptionImagePaths = await Promise.all(
      listeningQuestionDrafts.questions.map(async (question, questionIndex) => {
        if (question.optionKind !== 'image') {
          return question.options.map(option => option.imageUrl || '')
        }
        return Promise.all(
          question.options.map(async (option, optionIndex) => {
            const image = formData.get(
              `listeningQuestionOptionImage_${questionIndex}_${optionIndex}`,
            )
            if (!(image instanceof File) || image.size === 0) {
              if (option.imageUrl) return option.imageUrl
              throw new Error(
                `请上传第 ${questionIndex + 1} 题的第 ${optionIndex + 1} 个选项图片。`,
              )
            }
            return saveUploadedQuestionImage(
              image,
              questionIndex,
              questionImageTitle,
              listeningQuestionDrafts.questions.length,
              `-option-${optionIndex + 1}`,
              `选项 ${optionIndex + 1} 图片`,
            )
          }),
        )
      }),
    )
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

    const createdMaterials: {
      name: string
      id: string
      listeningSectionNumber: number | null
    }[] = []
    const matchedFromUpload: string[] = []
    const matchedFromSite: string[] = []
    const fallbackPaths: string[] = []
    const unmatchedAudio: string[] = []
    const assAudioOverrides = parseAssAudioOverrides(formData.get('assAudioOverrides'))
    const materialLanguage = isMediaUploadMode
      ? (formData.get('materialLanguage') as string)?.trim() || ''
      : ''
    const materialChapterName =
      (formData.get('materialChapterName') as string)?.trim() || ''
    let overrideApplied = 0
    let overrideInvalid = 0
    const sequencePlans = new Map(
      await Promise.all(
        collectionIds.map(
          async id => [id, await buildMaterialSequencePlan(id)] as const,
        ),
      ),
    )
    const uploadedAudioQueueByStem = cloneStemMap(uploadedAudioByStem)
    const siteAudioQueueByStem = cloneStemMap(siteAudioByStem)
    const scopedSiteAudioQueueByStem = cloneStemMap(scopedSiteAudioByStem)
    let createdCount = 0

    for (let i = 0; i < uniqueFiles.length; i += 1) {
      const file = uniqueFiles[i]
      const materialQuestionEntries = selectListeningQuestionEntriesForFile(
        listeningQuestionDrafts.questions,
        file.name,
        isBatch,
      )
      const fileContent = await file.text()
      const rawSubs = parseAssToRawSubtitles(fileContent)
      if (rawSubs.length === 0) {
        throw new Error(`文件 ${file.name} 未解析到有效字幕行。`)
      }

      const processedSubs = applyAssTimelinePadding(
        rawSubs,
        0.1,
        0.3,
        0.05,
      ).map(dialogue => ({ ...dialogue, stableId: randomUUID() }))
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

      const materialId = randomUUID()
      const listeningSectionNumber =
        listeningQuestionDrafts.listeningSectionNumber ||
        jlptIdentity?.sectionNumber ||
        null
      const toeicPart = getToeicPartByQuestionType(
        listeningQuestionDrafts.questions[0]?.questionType || '',
      )
      const listeningSectionTitle =
        listeningQuestionDrafts.listeningSectionTitle ||
        jlptIdentity?.sectionLabel ||
        (toeicPart
          ? `Part ${toeicPart.part} · ${toeicPart.title}`
          : '听力')
      const contentPayload: Record<string, unknown> = { dialogues: processedSubs }
      if (finalAudioFile) {
        contentPayload.audioFile = finalAudioFile
      }
      if (isMediaUploadMode) contentPayload.subtitleNoAudio = true
      if (isMediaUploadMode) {
        contentPayload.subtitleSourceType = subtitleSourceType
      }
      if (subtitleWorkTitle) contentPayload.subtitleWorkTitle = subtitleWorkTitle
      if (subtitleSeason) contentPayload.subtitleSeason = subtitleSeason
      if (subtitleEpisode) contentPayload.subtitleEpisode = subtitleEpisode
      if (materialLanguage) contentPayload.language = materialLanguage
      if (matchedMaterialType === MaterialType.LISTENING) {
        contentPayload.questionEntryRequired =
          materialQuestionEntries.length === 0
        if (listeningSectionNumber) {
          contentPayload.listeningSectionNumber = listeningSectionNumber
          contentPayload.listeningSectionTitle = listeningSectionTitle
        }
      }
      if (jlptIdentity) {
        contentPayload.questionNumber = jlptIdentity.questionNumber
        contentPayload.jlptLevel = jlptIdentity.level
        contentPayload.jlptSession = jlptIdentity.session
      }

      const metadata: Record<string, unknown> = {}
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
            contentPayload: encodeMaterialPayload(
              matchedMaterialType,
              contentPayload,
            ),
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

        if (
          matchedMaterialType === MaterialType.LISTENING &&
          materialQuestionEntries.length > 0
        ) {
          for (let questionIndex = 0; questionIndex < materialQuestionEntries.length; questionIndex += 1) {
            const { question, globalIndex } = materialQuestionEntries[questionIndex]
            const questionOptions = toQuestionOptionsAndAnswer(
              question.options.map((option, optionIndex) => ({
                ...option,
                imageUrl:
                  listeningOptionImagePaths[globalIndex]?.[optionIndex] ||
                  undefined,
              })),
            )
            await tx.question.create({
              data: {
                materialId,
                questionType: question.questionType,
                prompt: question.prompt,
                context: question.context,
                analysis: question.explanation,
                content: encodeQuestionContent({
                  optionLabelFormat: question.optionLabelFormat,
                  customOptionLabels: question.customOptionLabels,
                  shuffleOptions:
                    question.shuffleOptions && listeningSectionNumber !== 3,
                  listeningSectionNumber,
                  listeningSectionTitle,
                  imageUrl: listeningQuestionImagePaths[globalIndex] || undefined,
                }),
                ...questionOptions,
                sortOrder: questionIndex + 1,
              },
            })
          }
        }

        if (matchedMaterialType === MaterialType.MEDIA_SUBTITLE) {
          await replaceMediaSubtitleSearchIndex(tx, {
            id: materialId,
            title: finalTitle,
            contentPayload,
          })
        }
      })
      createdMaterials.push({
        name: file.name,
        id: materialId,
        listeningSectionNumber,
      })
      createdCount += 1
    }

    if (createdMaterials.length === 0) {
      throw new Error(
        unmatchedAudio.length > 0
          ? `未匹配到同名音频：${unmatchedAudio.slice(0, 3).join('、')}`
          : '未成功导入任何字幕文件。',
      )
    }

    await precomputePracticeVocabularyMaterialAnalyses(
      createdMaterials.map(material => material.id),
    )
    invalidatePracticeVocabularyAnalytics()

    const summary: string[] = []
    if (matchedFromUpload.length > 0) summary.push(`上传配对 ${matchedFromUpload.length}`)
    if (matchedFromSite.length > 0) summary.push(`站内配对 ${matchedFromSite.length}`)
    if (fallbackPaths.length > 0) summary.push(`路径推断 ${fallbackPaths.length}`)
    if (unmatchedAudio.length > 0) summary.push(`未匹配 ${unmatchedAudio.length}`)
    if (overrideApplied > 0) summary.push(`手动改配 ${overrideApplied}`)
    if (overrideInvalid > 0) summary.push(`无效改配 ${overrideInvalid}`)

    revalidatePath('/')
    revalidatePath('/manage/import')
    if (matchedMaterialType === MaterialType.LISTENING) {
      revalidatePath('/manage/listening')
      revalidatePath('/practice')
    }
    revalidatePath('/manage/shadowing')
    if (isMediaUploadMode) revalidatePath('/subtitles')

    return {
      success: true,
      message: isBatch
        ? `已导入 ${createdMaterials.length} 个字幕文件。${summary.length > 0 ? `（${summary.join('，')}）` : ''}`
        : listeningQuestionDrafts.questions.length > 0
          ? `已导入 ${createdMaterials[0].name}，并保存 ${listeningQuestionDrafts.questions.length} 道题。`
          : `已导入 ${createdMaterials[0].name}。`,
      lessonIds: createdMaterials.map(item => item.id),
      materialType: matchedMaterialType,
      questionEntryRequired:
        matchedMaterialType === MaterialType.LISTENING &&
        listeningQuestionDrafts.questions.length === 0,
      listeningSectionNumber:
        createdMaterials.length === 1
          ? createdMaterials[0].listeningSectionNumber
          : null,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('处理失败:', error)
    return { success: false, message: `导入失败: ${message}` }
  }
}

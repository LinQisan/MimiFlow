'use server'

import { MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { isPathInsideRoot, resolvePathInsideRoot } from '@/utils/files/path'
import { readString } from '@/lib/validation/schema'
import { PUBLIC_AUDIO_ROOT } from '@/lib/server/public-paths'
import {
  decodeMaterialPayloadRecord,
  patchMaterialPayload,
} from '@/lib/codecs/material-payload'
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'

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

type AudioRecord = {
  path: string
  folder: string
  name: string
  size: number
  updatedAt: string
  linkedLessons: number
  linkedListeningMaterials: number
  linkedReadingMaterials: number
  linkedSpeakingMaterials: number
  linkedSubtitleMaterials: number
  linkedVocabularyAudio: number
}

type AudioFolderRecord = {
  path: string
  name: string
  depth: number
  directCount: number
  descendantCount: number
  size: number
}

type RefUpdateResult = {
  lessonRefUpdated: number
  listeningRefUpdated: number
  readingRefUpdated: number
  speakingRefUpdated: number
  subtitleRefUpdated: number
  vocabularyRefUpdated: number
}

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

function normalizeFolderInput(rawFolder: string) {
  const normalized = rawFolder
    .replace(/\\/g, '/')
    .split('/')
    .map(segment =>
      segment
        .normalize('NFKC')
        .trim()
        .replace(/[<>:"|?*\u0000-\u001F]/g, '')
        .slice(0, 100),
    )
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .slice(0, 12)
  return normalized.join('/')
}

function getDefaultUploadFolder() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year')?.value || 'unknown'
  const month = parts.find(part => part.type === 'month')?.value || '00'
  return `staging/${year}-${month}`
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

function ensureAudioPath(audioPath: string) {
  if (!audioPath.startsWith('/audios/')) return null
  const rel = audioPath.replace(/^\/audios\//, '')
  if (!rel) return null
  const normalizedRoot = path.resolve(PUBLIC_AUDIO_DIR)
  const normalizedTarget = resolvePathInsideRoot(PUBLIC_AUDIO_DIR, rel)
  if (!normalizedTarget || normalizedTarget === normalizedRoot) return null
  return {
    rel,
    absPath: normalizedTarget,
    normalizedRoot,
    normalizedTarget,
  }
}

function joinAudioWebPath(folder: string, fileName: string) {
  const safeFolder = normalizeFolderInput(folder)
  const rel = safeFolder ? `${safeFolder}/${fileName}` : fileName
  return `/audios/${rel.split(path.sep).join('/')}`
}

async function replaceAudioReference(
  oldPath: string,
  nextPath: string,
): Promise<RefUpdateResult> {
  if (oldPath === nextPath) {
    return {
      lessonRefUpdated: 0,
      listeningRefUpdated: 0,
      readingRefUpdated: 0,
      speakingRefUpdated: 0,
      subtitleRefUpdated: 0,
      vocabularyRefUpdated: 0,
    }
  }

  const audioMaterials = await prisma.material.findMany({
    where: {
      type: {
        in: [
          MaterialType.LISTENING,
          MaterialType.READING,
          MaterialType.SPEAKING,
          MaterialType.MEDIA_SUBTITLE,
        ],
      },
    },
    select: { id: true, type: true, contentPayload: true },
  })

  const matchedMaterials = audioMaterials.filter(material => {
    const payload = decodeMaterialPayloadRecord(
      material.type,
      material.contentPayload,
    )
    const audioFile = readString(payload.audioFile) || readString(payload.audioUrl)
    return audioFile === oldPath
  })

  const materialUpdates = matchedMaterials.map(material => {
    return prisma.material.update({
      where: { id: material.id },
      data: {
        contentPayload: patchMaterialPayload(
          material.type,
          material.contentPayload,
          {
          audioFile: nextPath,
          audioUrl: nextPath,
          },
        ),
      },
    })
  })

  const [sentenceRefCount, wordRefCount] = await Promise.all([
    prisma.vocabularySentence.count({ where: { audioFile: oldPath } }),
    prisma.vocabulary.count({ where: { wordAudio: oldPath } }),
  ])
  const vocabularyRefUpdated = sentenceRefCount + wordRefCount
  await prisma.$transaction([
    ...materialUpdates,
    prisma.vocabularySentence.updateMany({
      where: { audioFile: oldPath },
      data: { audioFile: nextPath },
    }),
    prisma.vocabulary.updateMany({
      where: { wordAudio: oldPath },
      data: { wordAudio: nextPath },
    }),
  ])

  return {
    lessonRefUpdated: matchedMaterials.filter(
      material => material.type !== MaterialType.MEDIA_SUBTITLE,
    ).length,
    listeningRefUpdated: matchedMaterials.filter(
      material => material.type === MaterialType.LISTENING,
    ).length,
    readingRefUpdated: matchedMaterials.filter(
      material => material.type === MaterialType.READING,
    ).length,
    speakingRefUpdated: matchedMaterials.filter(
      material => material.type === MaterialType.SPEAKING,
    ).length,
    subtitleRefUpdated: matchedMaterials.filter(
      material => material.type === MaterialType.MEDIA_SUBTITLE,
    ).length,
    vocabularyRefUpdated,
  }
}

async function relocateAudioFile(
  oldPath: string,
  oldAbsPath: string,
  nextPath: string,
  nextAbsPath: string,
) {
  await copyFile(oldAbsPath, nextAbsPath)
  let refUpdated: RefUpdateResult
  try {
    refUpdated = await replaceAudioReference(oldPath, nextPath)
  } catch (error) {
    await unlink(nextAbsPath).catch(() => {})
    throw error
  }

  let sourceRemoved = true
  try {
    await unlink(oldAbsPath)
  } catch (error) {
    sourceRemoved = false
    console.error('新路径已生效，但旧录音清理失败:', error)
  }
  return { ...refUpdated, sourceRemoved }
}

async function walkAudioFiles(
  dir: string,
  baseDir: string,
): Promise<{ webPath: string; absPath: string }[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: { webPath: string; absPath: string }[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await walkAudioFiles(fullPath, baseDir)
      results.push(...nested)
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(ext)) continue

    const rel = path.relative(baseDir, fullPath).split(path.sep).join('/')
    results.push({
      webPath: `/audios/${rel}`,
      absPath: fullPath,
    })
  }

  return results
}

async function walkAudioFolders(dir: string, baseDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const folders: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fullPath = path.join(dir, entry.name)
    const rel = path.relative(baseDir, fullPath).split(path.sep).join('/')
    folders.push(rel)
    folders.push(...(await walkAudioFolders(fullPath, baseDir)))
  }

  return folders
}

export async function listAudioFilesAdmin(
  params?: {
    page?: number
    pageSize?: number
    keyword?: string
    folder?: string
    usage?: 'all' | 'listening' | 'reading' | 'speaking' | 'vocabulary' | 'unlinked'
  },
) {
  try {
    await mkdir(PUBLIC_AUDIO_DIR, { recursive: true })
    const safePageSize = Math.min(120, Math.max(10, Math.floor(params?.pageSize || 40)))
    const rawPage = Math.max(1, Math.floor(params?.page || 1))
    const keyword = (params?.keyword || '').trim().toLowerCase()
    const selectedFolder = (params?.folder || '').trim()
    const selectedUsage = params?.usage || 'all'

    const [files, directoryPaths] = await Promise.all([
      walkAudioFiles(PUBLIC_AUDIO_DIR, PUBLIC_AUDIO_DIR),
      walkAudioFolders(PUBLIC_AUDIO_DIR, PUBLIC_AUDIO_DIR),
    ])
    const uniquePaths = Array.from(new Set(files.map(item => item.webPath)))
    const uniquePathSet = new Set(uniquePaths)

    const [audioMaterials, vocabularySentences, vocabularyWords] = await Promise.all([
      prisma.material.findMany({
        where: {
          type: {
            in: [
              MaterialType.LISTENING,
              MaterialType.READING,
              MaterialType.SPEAKING,
              MaterialType.MEDIA_SUBTITLE,
            ],
          },
        },
        select: { type: true, contentPayload: true },
      }),
      prisma.vocabularySentence.findMany({
        where: { audioFile: { not: null } },
        select: { audioFile: true },
      }),
      prisma.vocabulary.findMany({
        where: { wordAudio: { not: null } },
        select: { wordAudio: true },
      }),
    ])
    const listeningUsageMap = new Map<string, number>()
    const readingUsageMap = new Map<string, number>()
    const speakingUsageMap = new Map<string, number>()
    const subtitleUsageMap = new Map<string, number>()
    const vocabularyUsageMap = new Map<string, number>()
    for (const material of audioMaterials) {
      const payload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      )
      const audioPath = readString(payload.audioFile) || readString(payload.audioUrl)
      if (!audioPath || !uniquePathSet.has(audioPath)) continue
      const usageMap = material.type === MaterialType.LISTENING
        ? listeningUsageMap
        : material.type === MaterialType.READING
          ? readingUsageMap
        : material.type === MaterialType.SPEAKING
          ? speakingUsageMap
          : subtitleUsageMap
      usageMap.set(audioPath, (usageMap.get(audioPath) || 0) + 1)
    }
    vocabularySentences.forEach(sentence => {
      const audioPath = sentence.audioFile || ''
      if (!audioPath || !uniquePathSet.has(audioPath)) return
      vocabularyUsageMap.set(
        audioPath,
        (vocabularyUsageMap.get(audioPath) || 0) + 1,
      )
    })
    vocabularyWords.forEach(vocabulary => {
      const audioPath = vocabulary.wordAudio || ''
      if (!audioPath || !uniquePathSet.has(audioPath)) return
      vocabularyUsageMap.set(
        audioPath,
        (vocabularyUsageMap.get(audioPath) || 0) + 1,
      )
    })

    const rows = await Promise.all(
      files.map(async file => {
        const meta = await stat(file.absPath)
        const trimmed = file.webPath.replace(/^\/audios\//, '')
        const segments = trimmed.split('/').filter(Boolean)
        const folder =
          segments.length > 1 ? segments.slice(0, -1).join('/') : '(根目录)'
        const name = segments[segments.length - 1] || trimmed
        return {
          path: file.webPath,
          folder,
          name,
          size: meta.size,
          updatedAt: meta.mtime.toISOString(),
          linkedLessons:
            (listeningUsageMap.get(file.webPath) || 0) +
            (readingUsageMap.get(file.webPath) || 0) +
            (speakingUsageMap.get(file.webPath) || 0) +
            (subtitleUsageMap.get(file.webPath) || 0) +
            (vocabularyUsageMap.get(file.webPath) || 0),
          linkedListeningMaterials: listeningUsageMap.get(file.webPath) || 0,
          linkedReadingMaterials: readingUsageMap.get(file.webPath) || 0,
          linkedSpeakingMaterials: speakingUsageMap.get(file.webPath) || 0,
          linkedSubtitleMaterials: subtitleUsageMap.get(file.webPath) || 0,
          linkedVocabularyAudio: vocabularyUsageMap.get(file.webPath) || 0,
        } as AudioRecord
      }),
    )

    const sorted = rows.sort((a, b) => {
      if (selectedFolder) {
        return a.name.localeCompare(b.name, 'ja', { numeric: true })
      }
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    const folders = Array.from(new Set(directoryPaths)).sort((a, b) =>
      a.localeCompare(b, 'ja', { numeric: true }),
    )
    const folderSummaries: AudioFolderRecord[] = folders.map(folderPath => {
      const descendants = sorted.filter(
        item => item.folder === folderPath || item.folder.startsWith(`${folderPath}/`),
      )
      return {
        path: folderPath,
        name: folderPath.split('/').pop() || folderPath,
        depth: folderPath.split('/').length - 1,
        directCount: descendants.filter(item => item.folder === folderPath).length,
        descendantCount: descendants.length,
        size: descendants.reduce((sum, item) => sum + item.size, 0),
      }
    })
    const summary = {
      totalFiles: sorted.length,
      totalSize: sorted.reduce((sum, item) => sum + item.size, 0),
      linkedFiles: sorted.filter(item => item.linkedLessons > 0).length,
      unlinkedFiles: sorted.filter(item => item.linkedLessons === 0).length,
      folderCount: folders.length,
    }
    const filtered = sorted.filter(item => {
      const folderOk =
        !selectedFolder ||
        item.folder === selectedFolder ||
        item.folder.startsWith(`${selectedFolder}/`)
      if (!folderOk) return false
      const usageOk =
        selectedUsage === 'all' ||
        (selectedUsage === 'listening' && item.linkedListeningMaterials > 0) ||
        (selectedUsage === 'reading' && item.linkedReadingMaterials > 0) ||
        (selectedUsage === 'speaking' && item.linkedSpeakingMaterials > 0) ||
        (selectedUsage === 'vocabulary' && item.linkedVocabularyAudio > 0) ||
        (selectedUsage === 'unlinked' && item.linkedLessons === 0)
      if (!usageOk) return false
      if (!keyword) return true
      const text = `${item.name} ${item.path} ${item.folder}`.toLowerCase()
      return text.includes(keyword)
    })
    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / safePageSize))
    const page = Math.min(rawPage, totalPages)
    const skip = (page - 1) * safePageSize
    const paged = filtered.slice(skip, skip + safePageSize)

    return {
      success: true,
      items: paged,
      folders,
      folderSummaries,
      summary,
      total,
      page,
      pageSize: safePageSize,
      totalPages,
    }
  } catch (error) {
    console.error('读取录音文件失败:', error)
    return {
      success: false,
      items: [] as AudioRecord[],
      folders: [] as string[],
      folderSummaries: [] as AudioFolderRecord[],
      summary: {
        totalFiles: 0,
        totalSize: 0,
        linkedFiles: 0,
        unlinkedFiles: 0,
        folderCount: 0,
      },
      total: 0,
      page: 1,
      pageSize: 40,
      totalPages: 1,
    }
  }
}

export async function uploadAudioFileAdmin(formData: FormData) {
  try {
    const file = formData.get('audioFile') as File | null
    if (!file || file.size === 0) {
      return { success: false, message: '请选择音频文件。' }
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(ext)) {
      return { success: false, message: '仅支持 mp3/m4a/wav/ogg/aac/flac/webm。' }
    }

    const requestedFolder = readString(formData.get('folder'))
    const folder = normalizeFolderInput(requestedFolder) || getDefaultUploadFolder()
    const uploadDir = resolvePathInsideRoot(PUBLIC_AUDIO_DIR, folder)
    if (!uploadDir) {
      return { success: false, message: '上传目录无效。' }
    }
    await mkdir(uploadDir, { recursive: true })
    const safeBase = toSafeFilename(path.basename(file.name, ext)) || 'audio'
    let fileName = `${safeBase}${ext}`
    let suffix = 2
    while (await pathExists(path.join(uploadDir, fileName))) {
      fileName = `${safeBase}-${suffix}${ext}`
      suffix += 1
    }
    const absPath = path.join(uploadDir, fileName)
    const bytes = Buffer.from(await file.arrayBuffer())
    await writeFile(absPath, bytes)

    revalidatePath('/manage/system/audio')
    revalidatePath('/manage/import')
    return {
      success: true,
      message: `录音已上传至 ${folder}。`,
      path: joinAudioWebPath(folder, fileName),
      folder,
    }
  } catch (error) {
    console.error('上传录音失败:', error)
    return { success: false, message: '上传失败，请重试。' }
  }
}

export async function deleteAudioFileAdmin(audioPath: string) {
  try {
    const target = ensureAudioPath(audioPath)
    if (!target) {
      return { success: false, message: '非法路径。' }
    }

    const [audioMaterials, vocabularySentenceCount, vocabularyWordCount] = await Promise.all([
      prisma.material.findMany({
        where: {
          type: {
            in: [
              MaterialType.LISTENING,
              MaterialType.READING,
              MaterialType.SPEAKING,
              MaterialType.MEDIA_SUBTITLE,
            ],
          },
        },
        select: { type: true, contentPayload: true },
      }),
      prisma.vocabularySentence.count({ where: { audioFile: audioPath } }),
      prisma.vocabulary.count({ where: { wordAudio: audioPath } }),
    ])
    const vocabularyCount = vocabularySentenceCount + vocabularyWordCount
    const linkedMaterials = audioMaterials.filter(material => {
      const payload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      )
      const currentPath = readString(payload.audioFile) || readString(payload.audioUrl)
      return currentPath === audioPath
    })
    if (linkedMaterials.length > 0 || vocabularyCount > 0) {
      const listeningCount = linkedMaterials.filter(
        material => material.type === MaterialType.LISTENING,
      ).length
      const speakingCount = linkedMaterials.filter(
        material => material.type === MaterialType.SPEAKING,
      ).length
      const readingCount = linkedMaterials.filter(
        material => material.type === MaterialType.READING,
      ).length
      const subtitleCount = linkedMaterials.filter(
        material => material.type === MaterialType.MEDIA_SUBTITLE,
      ).length
      return {
        success: false,
        message: `该录音仍被听力 ${listeningCount} 条、阅读 ${readingCount} 条、跟读 ${speakingCount} 条、影视字幕 ${subtitleCount} 条、词汇 ${vocabularyCount} 条使用，无法删除。`,
      }
    }

    await unlink(target.normalizedTarget)
    revalidatePath('/manage/system/audio')
    revalidatePath('/manage/import')
    revalidatePath('/reading')
    return { success: true, message: '录音已删除。' }
  } catch (error) {
    console.error('删除录音失败:', error)
    return { success: false, message: '删除失败，请确认文件存在。' }
  }
}

export async function moveAudioFileAdmin(audioPath: string, rawFolder: string) {
  try {
    const oldTarget = ensureAudioPath(audioPath)
    if (!oldTarget) {
      return { success: false, message: '非法路径。' }
    }

    const targetFolder = normalizeFolderInput(rawFolder)
    const fileName = path.basename(oldTarget.rel)
    const targetRel = targetFolder ? `${targetFolder}/${fileName}` : fileName
    const targetAbsPath = path.join(PUBLIC_AUDIO_DIR, targetRel)
    const normalizedTarget = path.resolve(targetAbsPath)
    if (!isPathInsideRoot(oldTarget.normalizedRoot, normalizedTarget)) {
      return { success: false, message: '非法目标路径。' }
    }

    const nextWebPath = joinAudioWebPath(targetFolder, fileName)
    if (nextWebPath === audioPath) {
      return { success: false, message: '文件已在目标文件夹中。' }
    }

    await mkdir(path.dirname(targetAbsPath), { recursive: true })
    if (await pathExists(targetAbsPath)) {
      return { success: false, message: '目标文件夹中已存在同名文件。' }
    }

    const refUpdated = await relocateAudioFile(
      audioPath,
      oldTarget.absPath,
      nextWebPath,
      targetAbsPath,
    )

    revalidatePath('/manage/system/audio')
    revalidatePath('/manage/import')
    revalidatePath('/manage/shadowing')

    return {
      success: true,
      message: `文件已移动至 ${targetFolder || '根目录'}。`,
      path: nextWebPath,
      lessonRefUpdated: refUpdated.lessonRefUpdated,
      listeningRefUpdated: refUpdated.listeningRefUpdated,
      readingRefUpdated: refUpdated.readingRefUpdated,
      speakingRefUpdated: refUpdated.speakingRefUpdated,
      subtitleRefUpdated: refUpdated.subtitleRefUpdated,
      vocabularyRefUpdated: refUpdated.vocabularyRefUpdated,
      sourceRemoved: refUpdated.sourceRemoved,
    }
  } catch (error) {
    console.error('移动录音失败:', error)
    return { success: false, message: '移动失败，请稍后重试。' }
  }
}

export async function createAudioFolderAdmin(rawFolder: string) {
  try {
    const folder = normalizeFolderInput(rawFolder)
    if (!folder) {
      return { success: false, message: '请输入有效文件夹名。' }
    }
    const targetAbsPath = path.resolve(path.join(PUBLIC_AUDIO_DIR, folder))
    const root = path.resolve(PUBLIC_AUDIO_DIR)
    if (!isPathInsideRoot(root, targetAbsPath)) {
      return { success: false, message: '非法路径。' }
    }
    await mkdir(targetAbsPath, { recursive: true })
    revalidatePath('/manage/system/audio')
    revalidatePath('/manage/import')
    return { success: true, message: `文件夹已创建：${folder}` }
  } catch (error) {
    console.error('创建文件夹失败:', error)
    return { success: false, message: '创建文件夹失败，请重试。' }
  }
}

export async function renameAudioFileAdmin(audioPath: string, rawName: string) {
  try {
    const target = ensureAudioPath(audioPath)
    if (!target) return { success: false, message: '非法路径。' }

    const oldFileName = path.basename(target.rel)
    const ext = path.extname(oldFileName).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(ext)) {
      return { success: false, message: '仅支持重命名音频文件。' }
    }

    const noExtInput = rawName.trim().replace(new RegExp(`${ext}$`, 'i'), '')
    const safeBase = toSafeFilename(noExtInput) || 'audio'
    const nextName = `${safeBase}${ext}`
    const parentFolder = path.dirname(target.rel)
    const normalizedFolder = parentFolder === '.' ? '' : parentFolder
    const nextPath = joinAudioWebPath(normalizedFolder, nextName)
    if (nextPath === audioPath) {
      return { success: false, message: '文件名未变化。' }
    }

    const nextAbsPath = path.resolve(
      path.join(PUBLIC_AUDIO_DIR, nextPath.replace(/^\/audios\//, '')),
    )
    if (!isPathInsideRoot(target.normalizedRoot, nextAbsPath)) {
      return { success: false, message: '非法路径。' }
    }
    if (await pathExists(nextAbsPath)) {
      return { success: false, message: '同文件夹下已存在同名文件。' }
    }

    const refUpdated = await relocateAudioFile(
      audioPath,
      target.absPath,
      nextPath,
      nextAbsPath,
    )

    revalidatePath('/manage/system/audio')
    revalidatePath('/manage/import')
    revalidatePath('/manage/shadowing')
    return {
      success: true,
      message: `文件已重命名为 ${nextName}。`,
      path: nextPath,
      lessonRefUpdated: refUpdated.lessonRefUpdated,
      listeningRefUpdated: refUpdated.listeningRefUpdated,
      readingRefUpdated: refUpdated.readingRefUpdated,
      speakingRefUpdated: refUpdated.speakingRefUpdated,
      subtitleRefUpdated: refUpdated.subtitleRefUpdated,
      vocabularyRefUpdated: refUpdated.vocabularyRefUpdated,
      sourceRemoved: refUpdated.sourceRemoved,
    }
  } catch (error) {
    console.error('重命名录音失败:', error)
    return { success: false, message: '重命名失败，请重试。' }
  }
}

export async function bulkMoveAudioFilesAdmin(paths: string[], rawFolder: string) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { success: false, message: '请先选择要移动的录音。' }
  }
  const targetFolder = normalizeFolderInput(rawFolder)
  const succeeded: string[] = []
  const failed: { path: string; message: string }[] = []
  let lessonRefUpdated = 0
  let listeningRefUpdated = 0
  let readingRefUpdated = 0
  let speakingRefUpdated = 0
  let subtitleRefUpdated = 0
  let vocabularyRefUpdated = 0

  for (const itemPath of Array.from(new Set(paths))) {
    const res = await moveAudioFileAdmin(itemPath, targetFolder)
    if (res.success) {
      succeeded.push(itemPath)
      lessonRefUpdated += res.lessonRefUpdated || 0
      listeningRefUpdated += res.listeningRefUpdated || 0
      readingRefUpdated += res.readingRefUpdated || 0
      speakingRefUpdated += res.speakingRefUpdated || 0
      subtitleRefUpdated += res.subtitleRefUpdated || 0
      vocabularyRefUpdated += res.vocabularyRefUpdated || 0
    } else {
      failed.push({ path: itemPath, message: res.message })
    }
  }

  return {
    success: succeeded.length > 0,
    message: `已移动 ${succeeded.length} 条，失败 ${failed.length} 条。`,
    succeeded,
    failed,
    lessonRefUpdated,
    listeningRefUpdated,
    readingRefUpdated,
    speakingRefUpdated,
    subtitleRefUpdated,
    vocabularyRefUpdated,
  }
}

export async function bulkDeleteAudioFilesAdmin(paths: string[]) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { success: false, message: '请先选择要删除的录音。' }
  }
  const succeeded: string[] = []
  const failed: { path: string; message: string }[] = []

  for (const itemPath of Array.from(new Set(paths))) {
    const res = await deleteAudioFileAdmin(itemPath)
    if (res.success) succeeded.push(itemPath)
    else failed.push({ path: itemPath, message: res.message })
  }

  return {
    success: succeeded.length > 0,
    message: `已删除 ${succeeded.length} 条，失败 ${failed.length} 条。`,
    succeeded,
    failed,
  }
}

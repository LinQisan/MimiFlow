// app/manage/upload/action.ts
'use server'

import prisma from '@/lib/prisma'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
// ================== 核心解析逻辑 (保持不变) ==================

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
  text: string
  start: number
  end: number
}

type LessonSequencePlan = { startSortOrder: number }

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
    if (eventsStarted && line.startsWith('Dialogue:')) {
      const row = line.replace('Dialogue:', '').trim()
      const splitLimit =
        formatFields.length > 0 ? formatFields.length : textIndex + 1
      const parts: string[] = []
      let cursor = 0
      for (let idx = 0; idx < splitLimit - 1; idx++) {
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

      subs.push({
        id: dialogueId++,
        text,
        rawStart,
        rawEnd,
      })
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
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i]
    let actualPadStart = padStart
    let actualPadEnd = padEnd

    if (i > 0) {
      const prevResultEnd = result[i - 1].end
      const availableSpace = sub.rawStart - prevResultEnd - minGap
      actualPadStart =
        availableSpace < 0 ? 0 : Math.min(padStart, availableSpace)
    }

    if (i < subs.length - 1) {
      const nextRawStart = subs[i + 1].rawStart
      const availableSpace = nextRawStart - sub.rawEnd - minGap
      actualPadEnd = availableSpace < 0 ? 0 : Math.min(padEnd, availableSpace)
    }

    const finalStart = Math.max(0.0, sub.rawStart - actualPadStart)
    let finalEnd = sub.rawEnd + actualPadEnd
    if (finalEnd < finalStart + minDuration) {
      finalEnd = finalStart + minDuration
    }

    result.push({
      id: i + 1,
      text: sub.text,
      start: Number(finalStart.toFixed(2)),
      end: Number(finalEnd.toFixed(2)),
    })
  }
  return result
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
const PUBLIC_UPLOAD_DIR = path.join(PUBLIC_AUDIO_DIR, 'uploads')

function toSafeFilename(name: string) {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
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

async function buildLessonSequencePlan(
  paperId: string,
  _count: number,
): Promise<LessonSequencePlan> {
  const lessons = await prisma.lesson.findMany({
    where: { paperId },
    select: { sortOrder: true },
  })
  const maxSortOrder = lessons.reduce(
    (acc, row) => Math.max(acc, row.sortOrder),
    -1,
  )
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

function parseAssAudioOverrides(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || !raw.trim())
    return {} as Record<string, string>
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function pickAudioByStem(
  stem: string,
  scopedMap: Map<string, string[]>,
  globalMap: Map<string, string[]>,
) {
  const scoped = scopedMap.get(stem)
  if (scoped && scoped.length > 0) return scoped[0]
  const global = globalMap.get(stem)
  if (global && global.length > 0) return global[0]
  return null
}

async function ensureTargetCategory(formData: FormData) {
  const uploadMode = formData.get('uploadMode') as string
  const paperId = (formData.get('paperId') as string)?.trim()

  if (uploadMode === 'new') {
    const level = (formData.get('level') as string)?.trim()
    const categoryName = (formData.get('categoryName') as string)?.trim()
    const description = (formData.get('description') as string)?.trim()
    if (!level || !categoryName) {
      throw new Error('请填写新分类名称并选择所属等级。')
    }

    const generatedId = `${level.toLowerCase()}_${Date.now()}`
    const targetCategoryId = paperId || generatedId

    const existed = await prisma.paper.findUnique({
      where: { id: targetCategoryId },
    })
    if (!existed) {
      await prisma.paper.create({
        data: {
          id: targetCategoryId,
          levelId: level.toLowerCase(),
          name: categoryName,
          description: description || null,
        },
      })
    }
    return targetCategoryId
  }

  if (!paperId) {
    throw new Error('分类信息缺失，请重新选择分类。')
  }
  const existing = await prisma.paper.findUnique({ where: { id: paperId } })
  if (!existing) throw new Error('选中的试卷组不存在，请刷新页面重试。')
  return paperId
}

async function walkAudioFiles(dir: string, baseDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

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

async function saveUploadedAudio(file: File) {
  if (!file || file.size === 0) {
    throw new Error('未检测到录音文件，请重新选择。')
  }
  const ext = path.extname(file.name).toLowerCase()
  if (!AUDIO_EXTENSIONS.has(ext)) {
    throw new Error('录音格式不支持，请上传 mp3/m4a/wav/ogg/aac/flac/webm。')
  }

  await mkdir(PUBLIC_UPLOAD_DIR, { recursive: true })

  const base = path.basename(file.name, ext)
  const safeBase = toSafeFilename(base) || 'audio'
  const finalName = `${Date.now()}-${safeBase}${ext}`
  const finalPath = path.join(PUBLIC_UPLOAD_DIR, finalName)
  const bytes = Buffer.from(await file.arrayBuffer())
  await writeFile(finalPath, bytes)

  return `/audios/uploads/${finalName}`
}

// ================== 暴露给前端的 Server Action ==================
export async function uploadAssAndSaveData(formData: FormData) {
  try {
    const paperId = await ensureTargetCategory(formData)
    const title = (formData.get('title') as string)?.trim()
    const audioSourceType =
      (formData.get('audioSourceType') as string) || 'manual'
    const audioFileField = formData.get('audioFile')
    const audioFileFromInput =
      typeof audioFileField === 'string' ? audioFileField : ''
    const audioUploadFile = formData.get('audioUploadFile') as File | null
    const audioUploadFiles = (
      formData
        .getAll('audioUploadFiles')
        .filter(item => item instanceof File) as File[]
    ).filter(file => file.size > 0)
    const uniqueAudioUploadFiles = Array.from(
      new Map(
        [
          ...audioUploadFiles,
          ...(audioUploadFile ? [audioUploadFile] : []),
        ].map(file => [`${file.name}_${file.size}`, file]),
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
    if (uniqueFiles.length === 0)
      throw new Error('没有检测到可导入的 .ass 文件。')

    const isBatch = uniqueFiles.length > 1
    let baseAudioFile = ensureAudioWebPath(audioFileFromInput)
    const uploadedAudioByStem = new Map<string, string[]>()
    if (audioSourceType === 'upload') {
      if (!isBatch) {
        const singleAudio = uniqueAudioUploadFiles[0] || audioUploadFile
        if (!singleAudio || singleAudio.size === 0) {
          throw new Error('请选择需要保存的录音文件。')
        }
        baseAudioFile = await saveUploadedAudio(singleAudio)
      } else {
        for (const file of uniqueAudioUploadFiles) {
          const savedPath = await saveUploadedAudio(file)
          const stem = normalizeStem(getBaseNameWithoutExt(file.name))
          const bucket = uploadedAudioByStem.get(stem) || []
          bucket.push(savedPath)
          uploadedAudioByStem.set(stem, bucket)
        }
      }
    }
    if (!baseAudioFile && audioSourceType !== 'upload') {
      throw new Error('请填写或选择音频路径。')
    }

    const siteAudioFiles = await walkAudioFiles(
      PUBLIC_AUDIO_DIR,
      PUBLIC_AUDIO_DIR,
    )
    const siteAudioByStem = buildAudioStemMap(siteAudioFiles)
    const folderPrefix = getFolderPrefixFromSelection(audioMatchFolder)
    const scopedSiteAudioByStem = buildAudioStemMap(
      siteAudioFiles.filter(item => item.startsWith(folderPrefix)),
    )

    const createdLessons: string[] = []
    const matchedFromUpload: string[] = []
    const matchedFromSite: string[] = []
    const fallbackPaths: string[] = []
    const unmatchedAudio: string[] = []
    const assAudioOverrides = parseAssAudioOverrides(
      formData.get('assAudioOverrides'),
    )
    let overrideApplied = 0
    let overrideInvalid = 0
    const sequencePlan = await buildLessonSequencePlan(
      paperId,
      uniqueFiles.length,
    )
    for (let i = 0; i < uniqueFiles.length; i++) {
      const file = uniqueFiles[i]
      const fileContent = await file.text()
      const rawSubs = parseAssToRawSubs(fileContent)
      if (rawSubs.length === 0) {
        throw new Error(`文件 ${file.name} 未解析到有效字幕行。`)
      }
      const processedSubs = applySmartPadding(rawSubs, 0.1, 0.3, 0.05)
      const fileBase = getBaseNameWithoutExt(file.name)

      const finalTitle = isBatch
        ? title
          ? `${title} · ${fileBase}`
          : fileBase
        : title || fileBase
      const stem = normalizeStem(fileBase)
      let finalAudioFile = ''
      const overrideKey = `${file.name}::${file.size}`
      const overrideValue = (assAudioOverrides[overrideKey] || '').trim()
      if (overrideValue) {
        if (overrideValue.startsWith('upload://')) {
          const overrideStem = normalizeStem(
            overrideValue.replace(/^upload:\/\//, ''),
          )
          const matchedUpload = uploadedAudioByStem.get(overrideStem)?.[0]
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
          const uploadMatched = uploadedAudioByStem.get(stem)?.[0] || null
          if (uploadMatched) {
            finalAudioFile = uploadMatched
            matchedFromUpload.push(file.name)
          } else {
            const siteMatched = pickAudioByStem(
              stem,
              scopedSiteAudioByStem,
              siteAudioByStem,
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
      if (!finalAudioFile) {
        unmatchedAudio.push(file.name)
        continue
      }
      const lessonId = randomUUID()

      const existingLesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { id: true },
      })

      if (existingLesson) {
        throw new Error(`生成的 lessonId 已存在：${lessonId}`)
      }

      // 【修改点 1】先独立创建主表 Lesson
      await prisma.lesson.create({
        data: {
          id: lessonId,
          title: finalTitle,
          audioFile: finalAudioFile,
          paperId,
          sortOrder: sequencePlan.startSortOrder + i,
        },
      })

      // 【修改点 2】使用 createMany 批量插入子表 Dialogues
      // (注意：这里假设你的 Prisma 模型名为 dialogue，如果你的 schema 里首字母是大写或叫别的名字，请对应替换)
      await prisma.dialogue.createMany({
        data: processedSubs.map(sub => ({
          lessonId: lessonId, // 手动关联主表 ID
          sequenceId: sub.id,
          text: sub.text,
          start: sub.start,
          end: sub.end,
        })),
      })
      createdLessons.push(file.name)
    }

    if (createdLessons.length === 0) {
      throw new Error(
        unmatchedAudio.length > 0
          ? `未匹配到同名音频：${unmatchedAudio.slice(0, 3).join('、')}`
          : '未成功导入任何字幕文件。',
      )
    }

    const summary: string[] = []
    if (matchedFromUpload.length > 0)
      summary.push(`上传配对 ${matchedFromUpload.length}`)
    if (matchedFromSite.length > 0)
      summary.push(`站内配对 ${matchedFromSite.length}`)
    if (fallbackPaths.length > 0)
      summary.push(`路径推断 ${fallbackPaths.length}`)
    if (unmatchedAudio.length > 0)
      summary.push(`未匹配 ${unmatchedAudio.length}`)
    if (overrideApplied > 0) summary.push(`手动改配 ${overrideApplied}`)
    if (overrideInvalid > 0) summary.push(`无效改配 ${overrideInvalid}`)
    return {
      success: true,
      message: isBatch
        ? `批量导入完成：${createdLessons.length} 个字幕文件已写入 [${paperId}]。${summary.length > 0 ? `（${summary.join('，')}）` : ''}`
        : `成功导入 ${createdLessons[0]} 至 [${paperId}]。`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('处理失败:', error)
    return { success: false, message: `导入失败: ${message}` }
  }
}

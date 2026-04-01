'use server'

import prisma from '@/lib/prisma'
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
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

const PUBLIC_AUDIO_DIR = path.join(process.cwd(), 'public', 'audios')
const PUBLIC_UPLOAD_DIR = path.join(PUBLIC_AUDIO_DIR, 'uploads')

type AudioRecord = {
  path: string
  folder: string
  name: string
  size: number
  updatedAt: string
  linkedLessons: number
}

type RefUpdateResult = {
  lessonRefUpdated: number
  subtitleRefUpdated: number
}

function toSafeFilename(name: string) {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
}

function normalizeFolderInput(rawFolder: string) {
  const normalized = rawFolder
    .replace(/\\/g, '/')
    .split('/')
    .map(segment =>
      segment
        .trim()
        .replace(/[<>:"|?*\u0000-\u001F]/g, ''),
    )
    .filter(segment => segment && segment !== '.' && segment !== '..')
  return normalized.join('/')
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
  const absPath = path.join(PUBLIC_AUDIO_DIR, rel)
  const normalizedRoot = path.resolve(PUBLIC_AUDIO_DIR)
  const normalizedTarget = path.resolve(absPath)
  if (!normalizedTarget.startsWith(normalizedRoot)) return null
  return {
    rel,
    absPath,
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
    return { lessonRefUpdated: 0, subtitleRefUpdated: 0 }
  }

  const lessonUpdate = await prisma.lesson.updateMany({
    where: { audioFile: oldPath },
    data: { audioFile: nextPath },
  })

  const dialoguesWithAudioRef = await prisma.dialogue.findMany({
    where: { text: { contains: oldPath } },
    select: { id: true, text: true },
  })

  let subtitleRefUpdated = 0
  if (dialoguesWithAudioRef.length > 0) {
    const updates: ReturnType<typeof prisma.dialogue.update>[] = []
    for (const row of dialoguesWithAudioRef) {
      const replaced = row.text.replaceAll(oldPath, nextPath)
      if (replaced === row.text) continue
      updates.push(
        prisma.dialogue.update({
          where: { id: row.id },
          data: { text: replaced },
        }),
      )
    }
    if (updates.length > 0) {
      await prisma.$transaction(updates)
      subtitleRefUpdated = updates.length
    }
  }

  return {
    lessonRefUpdated: lessonUpdate.count,
    subtitleRefUpdated,
  }
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

export async function listAudioFilesAdmin() {
  try {
    const files = await walkAudioFiles(PUBLIC_AUDIO_DIR, PUBLIC_AUDIO_DIR)
    const uniquePaths = Array.from(new Set(files.map(item => item.webPath)))

    const lessons = await prisma.lesson.findMany({
      where: { audioFile: { in: uniquePaths } },
      select: { audioFile: true },
    })
    const usageMap = new Map<string, number>()
    for (const lesson of lessons) {
      usageMap.set(lesson.audioFile, (usageMap.get(lesson.audioFile) || 0) + 1)
    }

    const rows: AudioRecord[] = []
    for (const file of files) {
      const meta = await stat(file.absPath)
      const trimmed = file.webPath.replace(/^\/audios\//, '')
      const segments = trimmed.split('/').filter(Boolean)
      const folder =
        segments.length > 1 ? segments.slice(0, -1).join('/') : '(根目录)'
      rows.push({
        path: file.webPath,
        folder,
        name: segments[segments.length - 1] || trimmed,
        size: meta.size,
        updatedAt: meta.mtime.toISOString(),
        linkedLessons: usageMap.get(file.webPath) || 0,
      })
    }

    return {
      success: true,
      items: rows.sort((a, b) => a.path.localeCompare(b.path)),
    }
  } catch (error) {
    console.error('读取录音文件失败:', error)
    return { success: false, items: [] as AudioRecord[] }
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

    await mkdir(PUBLIC_UPLOAD_DIR, { recursive: true })
    const safeBase = toSafeFilename(path.basename(file.name, ext)) || 'audio'
    const fileName = `${Date.now()}-${safeBase}${ext}`
    const absPath = path.join(PUBLIC_UPLOAD_DIR, fileName)
    const bytes = Buffer.from(await file.arrayBuffer())
    await writeFile(absPath, bytes)

    revalidatePath('/manage/audio')
    revalidatePath('/manage/upload')
    return { success: true, message: '录音已上传。', path: `/audios/uploads/${fileName}` }
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

    const linkedCount = await prisma.lesson.count({ where: { audioFile: audioPath } })
    if (linkedCount > 0) {
      return { success: false, message: `该录音仍被 ${linkedCount} 个听力语料使用，无法删除。` }
    }

    await unlink(target.normalizedTarget)
    revalidatePath('/manage/audio')
    revalidatePath('/manage/upload')
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
    if (!normalizedTarget.startsWith(oldTarget.normalizedRoot)) {
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

    await rename(oldTarget.absPath, targetAbsPath)
    const refUpdated = await replaceAudioReference(audioPath, nextWebPath)

    revalidatePath('/manage/audio')
    revalidatePath('/manage/upload')
    revalidatePath('/manage/level')

    return {
      success: true,
      message: `文件已移动至 ${targetFolder || '根目录'}。`,
      path: nextWebPath,
      lessonRefUpdated: refUpdated.lessonRefUpdated,
      subtitleRefUpdated: refUpdated.subtitleRefUpdated,
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
    if (!targetAbsPath.startsWith(root)) {
      return { success: false, message: '非法路径。' }
    }
    await mkdir(targetAbsPath, { recursive: true })
    revalidatePath('/manage/audio')
    revalidatePath('/manage/upload')
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
    if (!nextAbsPath.startsWith(target.normalizedRoot)) {
      return { success: false, message: '非法路径。' }
    }
    if (await pathExists(nextAbsPath)) {
      return { success: false, message: '同文件夹下已存在同名文件。' }
    }

    await rename(target.absPath, nextAbsPath)
    const refUpdated = await replaceAudioReference(audioPath, nextPath)

    revalidatePath('/manage/audio')
    revalidatePath('/manage/upload')
    revalidatePath('/manage/level')
    return {
      success: true,
      message: `文件已重命名为 ${nextName}。`,
      path: nextPath,
      lessonRefUpdated: refUpdated.lessonRefUpdated,
      subtitleRefUpdated: refUpdated.subtitleRefUpdated,
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
  let subtitleRefUpdated = 0

  for (const itemPath of Array.from(new Set(paths))) {
    const res = await moveAudioFileAdmin(itemPath, targetFolder)
    if (res.success) {
      succeeded.push(itemPath)
      lessonRefUpdated += res.lessonRefUpdated || 0
      subtitleRefUpdated += res.subtitleRefUpdated || 0
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
    subtitleRefUpdated,
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

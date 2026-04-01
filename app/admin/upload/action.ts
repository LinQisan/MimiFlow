// app/admin/upload/actions.ts
'use server'

import prisma from '@/lib/prisma'

// ================== 核心解析逻辑 (保持不变) ==================

function assTimeToSeconds(timeStr: string): number {
  const [h, m, s] = timeStr.split(':')
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)
}

function parseAssToRawSubs(assContent: string) {
  const subs = []
  const lines = assContent.trim().split('\n')
  let eventsStarted = false
  let dialogueId = 1

  for (let line of lines) {
    line = line.trim()
    if (line === '[Events]') {
      eventsStarted = true
      continue
    }
    if (eventsStarted && line.startsWith('Dialogue:')) {
      const parts = line.replace('Dialogue:', '').trim().split(',')
      if (parts.length >= 10) {
        const startStr = parts[1]
        const endStr = parts[2]
        const text = parts
          .slice(9)
          .join(',')
          .replace(/\\N/g, '\n')
          .replace(/\\n/g, '\n')

        subs.push({
          id: dialogueId++,
          text: text,
          rawStart: assTimeToSeconds(startStr),
          rawEnd: assTimeToSeconds(endStr),
        })
      }
    }
  }
  return subs
}

function applySmartPadding(
  subs: any[],
  padStart = 0.1,
  padEnd = 0.3,
  minGap = 0.05,
) {
  const result = []
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
    const finalEnd = sub.rawEnd + actualPadEnd

    result.push({
      id: sub.id,
      text: sub.text,
      start: Number(finalStart.toFixed(2)),
      end: Number(finalEnd.toFixed(2)),
    })
  }
  return result
}

// ================== 暴露给前端的 Server Action ==================
export async function uploadAssAndSaveData(formData: FormData) {
  try {
    // 🌟 新增：判断用户选的是“已有”还是“新建”
    const uploadMode = formData.get('uploadMode') as string // 'existing' | 'new'
    const categoryId = formData.get('categoryId') as string

    // 课程核心信息
    const lessonNum = formData.get('lessonNum') as string
    const title = formData.get('title') as string
    const audioFile = formData.get('audioFile') as string
    const file = formData.get('assFile') as File

    if (!file) throw new Error('没有检测到上传的文件')

    // 解析 ASS 文件内容
    const fileContent = await file.text()
    const rawSubs = parseAssToRawSubs(fileContent)
    if (rawSubs.length === 0) throw new Error('未能从文件中解析出字幕对话！')

    const processedSubs = applySmartPadding(rawSubs, 0.1, 0.3, 0.05)

    // 🌟 核心分流处理
    if (uploadMode === 'new') {
      const level = formData.get('level') as string
      const categoryName = formData.get('categoryName') as string
      const description = formData.get('description') as string

      // 如果是新分类，就执行完整的创建
      await prisma.category.create({
        data: {
          id: categoryId,
          levelId: level.toLowerCase(),
          name: categoryName,
          description: description || null,
        },
      })
    } else {
      // 如果是沿用已有分类，先查一下以防万一
      const existing = await prisma.category.findUnique({
        where: { id: categoryId },
      })
      if (!existing) throw new Error('选中的试卷组不存在，请刷新页面重试！')
    }

    // 插入课程及字幕数据
    await prisma.lesson.create({
      data: {
        lessonNum: lessonNum,
        title: title,
        audioFile: audioFile,
        categoryId: categoryId,
        dialogues: {
          create: processedSubs.map(sub => ({
            sequenceId: sub.id,
            text: sub.text,
            start: sub.start,
            end: sub.end,
          })),
        },
      },
    })

    return {
      success: true,
      message: `✅ 成功导入 ${processedSubs.length} 条字幕至 [${categoryId}]！`,
    }
  } catch (error: any) {
    console.error('处理失败:', error)
    return { success: false, message: `❌ 导入失败: ${error.message}` }
  }
}

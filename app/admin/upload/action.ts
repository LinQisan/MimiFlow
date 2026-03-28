// app/admin/upload/actions.ts
'use server'

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL!  })
const prisma = new PrismaClient({ adapter })

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
    // 1. 从表单中提取所有字段
    const categoryId = formData.get('categoryId') as string 
    const level = formData.get('level') as string 
    const categoryName = formData.get('categoryName') as string 
    const lessonNum = formData.get('lessonNum') as string 
    const title = formData.get('title') as string 
    const audioFile = formData.get('audioFile') as string 
    
    // 🌟 新增：提取前端可能传过来的试卷描述
    const description = formData.get('description') as string 
    const file = formData.get('assFile') as File

    if (!file) throw new Error('没有检测到上传的文件')

    // 2. 读取 ASS 文件内容并解析
    const fileContent = await file.text()
    const rawSubs = parseAssToRawSubs(fileContent)
    if (rawSubs.length === 0) throw new Error('未能从文件中解析出字幕对话！')

    const processedSubs = applySmartPadding(rawSubs, 0.1, 0.3, 0.05)

    // 3. 写入数据库
    // 🌟 核心修改：适配新的 Category 表结构
    await prisma.category.upsert({
      where: { id: categoryId },
      update: {
        // 如果再次上传同属于这个 categoryId 的新题目，顺便更新描述
        description: description || null,
      },
      create: {
        id: categoryId,
        levelId: level.toLowerCase(), // 🌟 变成外键 levelId，并转小写匹配 Level 表
        name: categoryName,
        description: description || null, // 🌟 存入描述
      },
    })

    // 插入课程及字幕数据 (保持不变)
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
      message: `✅ 成功解析并导入 ${processedSubs.length} 条字幕！`,
    }
  } catch (error: any) {
    console.error('处理失败:', error)
    return { success: false, message: `❌ 导入失败: ${error.message}` }
  }
}
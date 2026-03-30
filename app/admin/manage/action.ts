// app/admin/manage/actions.ts
'use server'

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { revalidatePath } from 'next/cache'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

export async function deleteCategory(categoryId: string) {
  try {
    // 🌟 核心：一条指令，级联删除该分类及旗下所有题目和字幕！
    await prisma.category.delete({
      where: { id: categoryId },
    })

    // 🌟 刷新缓存，让页面立刻显示最新状态
    revalidatePath('/admin/manage')
    revalidatePath('/')
    revalidatePath('/category/[categoryId]', 'page')

    return { success: true, message: '删除成功！' }
  } catch (error: any) {
    console.error('删除失败:', error)
    return { success: false, message: `删除失败: ${error.message}` }
  }
}

// 1. 删除单节课程 (Lesson)
export async function deleteLesson(lessonId: string) {
  try {
    await prisma.lesson.delete({ where: { id: lessonId } })
    revalidatePath('/admin/manage')
    return { success: true, message: '课程删除成功！' }
  } catch (error: any) {
    return { success: false, message: `删除失败: ${error.message}` }
  }
}

// 2. 删除单条字幕 (Dialogue)
export async function deleteDialogue(dialogueId: number) {
  try {
    await prisma.dialogue.delete({ where: { id: dialogueId } })
    revalidatePath('/admin/manage/lesson/[lessonId]', 'page')
    return { success: true, message: '字幕已删除' }
  } catch (error: any) {
    return { success: false, message: `删除失败: ${error.message}` }
  }
}

// 3. 修改单条字幕内容和时间轴 (Dialogue)
export async function updateDialogue(
  dialogueId: number,
  data: { text: string; start: number; end: number },
) {
  try {
    await prisma.dialogue.update({
      where: { id: dialogueId },
      data: {
        text: data.text,
        start: data.start,
        end: data.end,
      },
    })
    revalidatePath('/admin/manage/lesson/[lessonId]', 'page')
    return { success: true, message: '保存成功' }
  } catch (error: any) {
    return { success: false, message: `保存失败: ${error.message}` }
  }
}

export async function createLevel(formData: FormData) {
  try {
    const id = (formData.get('id') as string).toLowerCase()
    const title = formData.get('title') as string
    const description = formData.get('description') as string

    await prisma.level.create({
      data: { id, title, description },
    })

    // 刷新全站缓存，让下拉框和主页立刻生效
    revalidatePath('/')
    revalidatePath('/admin/manage')
    revalidatePath('/admin/upload')

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      message: `创建失败，可能是 ID 重复。(${error.message})`,
    }
  }
}
//  移动单节课程到其他试卷组
export async function moveLesson(lessonId: string, targetCategoryId: string) {
  try {
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { categoryId: targetCategoryId },
    })

    // 刷新管理页和前台主页缓存
    revalidatePath('/admin/manage')
    revalidatePath('/')

    return { success: true, message: '移动成功' }
  } catch (error: any) {
    return { success: false, message: `移动失败: ${error.message}` }
  }
}

//  修改试卷的 ID (安全克隆法)
export async function updateCategoryId(oldId: string, newId: string) {
  if (!newId || oldId === newId) return { success: false, message: 'ID 无变化' }

  try {
    // 1. 检查新 ID 是否已被占用，防止覆盖别人的数据
    const existing = await prisma.category.findUnique({ where: { id: newId } })
    if (existing) return { success: false, message: '新 ID 已存在，请换一个！' }

    // 2. 获取老数据的内容
    const oldCategory = await prisma.category.findUnique({
      where: { id: oldId },
    })
    if (!oldCategory) return { success: false, message: '找不到原试卷' }

    // 3. 🌟 核心：开启事务，保证三步操作要么全成功，要么全失败回滚
    await prisma.$transaction([
      // A. 用新 ID 创建一个完全一样的试卷壳子
      prisma.category.create({
        data: {
          id: newId,
          name: oldCategory.name,
          levelId: oldCategory.levelId,
          description: oldCategory.description,
        },
      }),
      // B. 把原来属于旧 ID 的所有题目，全部转移给新 ID
      prisma.lesson.updateMany({
        where: { categoryId: oldId },
        data: { categoryId: newId },
      }),
      // C. 功成身退，安全删除旧 ID 试卷
      prisma.category.delete({
        where: { id: oldId },
      }),
    ])

    // 刷新页面缓存
    revalidatePath('/admin/manage')
    revalidatePath('/')

    return { success: true, message: 'ID 修改成功！' }
  } catch (error: any) {
    return { success: false, message: `修改失败: ${error.message}` }
  }
}

//  修改大模块 (Level) 的 ID (安全克隆法)
export async function updateLevelId(oldId: string, newId: string) {
  if (!newId || oldId === newId) return { success: false, message: 'ID 无变化' }

  try {
    // 1. 检查新 ID 是否已被占用
    const existing = await prisma.level.findUnique({ where: { id: newId } })
    if (existing) return { success: false, message: '新 ID 已存在，请换一个！' }

    // 2. 获取老数据的内容
    const oldLevel = await prisma.level.findUnique({ where: { id: oldId } })
    if (!oldLevel) return { success: false, message: '找不到原大模块' }

    // 3. 🌟 开启事务：克隆新模块 -> 把底下所有试卷转移给新模块 -> 删除旧模块
    await prisma.$transaction([
      prisma.level.create({
        data: {
          id: newId,
          title: oldLevel.title,
          description: oldLevel.description,
        },
      }),
      // 转移关联的试卷 (Category)
      prisma.category.updateMany({
        where: { levelId: oldId },
        data: { levelId: newId },
      }),
      prisma.level.delete({
        where: { id: oldId },
      }),
    ])

    revalidatePath('/admin/manage')
    revalidatePath('/')

    return { success: true, message: '大模块 ID 修改成功！' }
  } catch (error: any) {
    return { success: false, message: `修改失败: ${error.message}` }
  }
}

//  修改单道题目 (Lesson)
export async function updateLessonNum(lessonId: string, newLessonNum: string) {
  if (!newLessonNum || newLessonNum.trim() === '') {
    return { success: false, message: '编号不能为空' }
  }

  try {
    // 🌟 因为 lessonNum 只是个普通字段，直接 update 即可，极其高效
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { lessonNum: newLessonNum.trim() },
    })

    revalidatePath('/admin/manage')
    return { success: true, message: '编号修改成功！' }
  } catch (error: any) {
    return { success: false, message: `修改失败: ${error.message}` }
  }
}

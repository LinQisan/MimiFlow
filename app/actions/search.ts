// app/actions/search.ts
'use server'

import prisma from '@/lib/prisma'

export async function getMoreExamples(word: string, excludeDialogueId: number) {
  try {
    const results = await prisma.dialogue.findMany({
      where: {
        text: { contains: word },
        id: { not: excludeDialogueId },
      },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            audioFile: true, // 🌟 核心新增：必须查出音频文件路径
            paper: {
              select: { name: true, level: { select: { title: true } } },
            },
          },
        },
      },
      take: 5,
      orderBy: { id: 'desc' },
    })

    return { success: true, data: results }
  } catch (error: any) {
    console.error('搜索例句失败:', error)
    return { success: false, message: error.message }
  }
}

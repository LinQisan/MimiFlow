// app/actions/search.ts
'use server'

import prisma from '@/lib/prisma'

export async function getMoreExamples(word: string, excludeDialogueId: number) {
  try {
    const results = await prisma.vocabularySentence.findMany({
      where: {
        sourceType: 'AUDIO_DIALOGUE',
        text: { contains: word },
        sourceId: { not: String(excludeDialogueId) },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    })

    return {
      success: true,
      data: results.map(item => ({
        id: Number(item.sourceId || 0),
        text: item.text,
        lesson: {
          id: item.sourceUrl.replace('/shadowing/', '').replace('/lessons/', ''),
          title: item.source.replace(/^听力[:：]/, '') || '听力',
          audioFile: item.audioFile || '',
          paper: {
            name: '听力',
            level: { title: '' },
          },
        },
      })),
    }
  } catch (error: any) {
    console.error('搜索例句失败:', error)
    return { success: false, message: error.message }
  }
}

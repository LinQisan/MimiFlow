'use server'

import { SourceType } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { expressionHighlightFragments } from './domain/expression-highlights'

export async function listExpressionHighlights(input: unknown) {
  const sources = z.array(z.object({ sourceType: z.enum(SourceType), sourceId: z.string().trim().min(1).max(500) })).max(300).parse(input)
  if (!sources.length) return []
  const userId = await getCurrentUserId()
  const links = await prisma.vocabularySentenceLink.findMany({
    where: { vocabulary: { userId }, sentence: { OR: sources } },
    select: { vocabulary: { select: { word: true, senses: { select: { expressions: { where: { type: { in: ['collocation', 'idiom'] } }, select: { id: true, type: true, text: true, meaning: true } } } } } }, sentence: { select: { text: true, sourceType: true, sourceId: true } } },
  })
  const highlights = links.flatMap(link => link.vocabulary.senses.flatMap(sense => sense.expressions.map(expression => ({
    id: `expression:${expression.id}:${link.sentence.sourceId}`,
    title: expression.text,
    category: 'IDIOM' as const,
    annotationLabel: expression.type === 'collocation' ? '我的搭配' : '我的惯用表达',
    fragments: expressionHighlightFragments(expression.text, link.sentence.text),
    note: [expression.meaning, `关联单词：${link.vocabulary.word}`].filter(Boolean).join('\n'),
    sentenceText: link.sentence.text,
    sourceType: link.sentence.sourceType!,
    sourceId: link.sentence.sourceId!,
  }))))
  const unique = new Map<string, typeof highlights[number]>()
  for (const highlight of highlights) {
    if (!highlight.fragments.length) continue
    const key = `${highlight.sourceType}:${highlight.sourceId}:${highlight.title}`
    const previous = unique.get(key)
    if (previous) previous.note = [...new Set([...previous.note.split('\n'), ...highlight.note.split('\n')])].join('\n')
    else unique.set(key, highlight)
  }
  return [...unique.values()]
}

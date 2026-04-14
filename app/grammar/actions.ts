'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

type CreateGrammarPayload = {
  name: string
  constructionsInput?: string
  constructions?: Array<{
    connection: string
    meaning: string
    note?: string
    examplesInput?: string
    sentenceExampleIds?: string[]
  }>
  tagsInput?: string
  clusterTitle?: string
  similarGrammarIds?: string[]
}

type UpdateGrammarPayload = {
  grammarId: string
  name: string
  constructionsInput?: string
  constructions?: Array<{
    connection: string
    meaning: string
    note?: string
    examplesInput?: string
    sentenceExampleIds?: string[]
  }>
  tagsInput?: string
  clusterTitle?: string
}

const splitByDelimiters = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，;；、]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const parseConstructions = (value: string) =>
  value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\s*[|｜]\s*/)
      return {
        connection: (parts[0] || '').trim(),
        meaning: (parts[1] || '').trim(),
        note: (parts[2] || '').trim() || null,
        examplesInput: '',
        sentenceExampleIds: [] as string[],
        sortOrder: index + 1,
      }
    })
    .filter(item => item.connection.length > 0 && item.meaning.length > 0)

const parseExamples = (value: string) =>
  (value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({
      sentenceText: line,
    }))
    .filter(item => item.sentenceText.length > 0)

const normalizeConstructions = (
  rows?: Array<{
    connection: string
    meaning: string
    note?: string
    examplesInput?: string
    sentenceExampleIds?: string[]
  }>,
  constructionsInput?: string,
) => {
  const fromRows = (rows || [])
    .map((item, index) => ({
      connection: (item.connection || '').trim(),
      meaning: (item.meaning || '').trim(),
      note: (item.note || '').trim() || null,
      examplesInput: (item.examplesInput || '').trim(),
      sentenceExampleIds: Array.from(
        new Set((item.sentenceExampleIds || []).map(v => v.trim()).filter(Boolean)),
      ),
      sortOrder: index + 1,
    }))
    .filter(item => item.connection.length > 0 && item.meaning.length > 0)
  if (fromRows.length > 0) return fromRows
  return parseConstructions(constructionsInput || '')
}

export async function searchGrammarSentenceCandidates(keyword: string) {
  const q = keyword.trim()
  if (!q) return []

  const rows = await prisma.vocabularySentence.findMany({
    where: {
      OR: [{ text: { contains: q } }, { source: { contains: q } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      text: true,
      translation: true,
      source: true,
    },
  })

  return rows
}

export async function createGrammar(payload: CreateGrammarPayload) {
  const name = (payload.name || '').trim()
  const constructionsInput = (payload.constructionsInput || '').trim()
  const clusterTitle = (payload.clusterTitle || '').trim()
  const tags = splitByDelimiters(payload.tagsInput || '')
  const similarGrammarIds = Array.from(
    new Set((payload.similarGrammarIds || []).map(item => item.trim()).filter(Boolean)),
  )
  const constructions = normalizeConstructions(
    payload.constructions,
    constructionsInput,
  )

  if (!name) {
    return { success: false, message: '语法名称不能为空。' }
  }

  try {
    await prisma.$transaction(async tx => {
      const grammar = await tx.grammar.create({
        data: {
          name,
        },
        select: { id: true },
      })

      if (tags.length > 0) {
        for (const tagName of tags) {
          const tag = await tx.grammarTag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName },
            select: { id: true },
          })
          await tx.grammarTagOnGrammar.upsert({
            where: {
              grammarId_tagId: {
                grammarId: grammar.id,
                tagId: tag.id,
              },
            },
            update: {},
            create: {
              grammarId: grammar.id,
              tagId: tag.id,
            },
          })
        }
      }

      if (constructions.length > 0) {
        for (const item of constructions) {
          const createdConstruction = await tx.grammarConstruction.create({
            data: {
              grammarId: grammar.id,
              connection: item.connection,
              meaning: item.meaning,
              note: item.note,
              sortOrder: item.sortOrder,
            },
            select: { id: true },
          })

          const manualExamples = parseExamples(item.examplesInput || '')
          if (manualExamples.length > 0) {
            await tx.grammarExample.createMany({
              data: manualExamples.map(example => ({
                grammarId: grammar.id,
                constructionId: createdConstruction.id,
                source: 'MANUAL',
                sentenceText: example.sentenceText,
              })),
            })
          }

          if ((item.sentenceExampleIds || []).length > 0) {
            const sentenceRows = await tx.vocabularySentence.findMany({
              where: { id: { in: item.sentenceExampleIds } },
              select: { id: true, text: true, translation: true },
            })
            if (sentenceRows.length > 0) {
              await tx.grammarExample.createMany({
                data: sentenceRows.map(sentence => ({
                  grammarId: grammar.id,
                  constructionId: createdConstruction.id,
                  source: 'SENTENCE_DB',
                  sentenceId: sentence.id,
                  sentenceText: sentence.text,
                })),
              })
            }
          }
        }
      }

      if (clusterTitle || similarGrammarIds.length > 0) {
        const title = clusterTitle || `${name} 相似语法组`
        const cluster = await tx.grammarCluster.upsert({
          where: { title },
          update: {},
          create: { title },
          select: { id: true },
        })

        await tx.grammarClusterMember.upsert({
          where: {
            clusterId_grammarId: {
              clusterId: cluster.id,
              grammarId: grammar.id,
            },
          },
          update: {},
          create: {
            clusterId: cluster.id,
            grammarId: grammar.id,
          },
        })

        for (const similarId of similarGrammarIds) {
          if (similarId === grammar.id) continue
          await tx.grammarClusterMember.upsert({
            where: {
              clusterId_grammarId: {
                clusterId: cluster.id,
                grammarId: similarId,
              },
            },
            update: {},
            create: {
              clusterId: cluster.id,
              grammarId: similarId,
            },
          })
        }
      }
    })

    revalidatePath('/grammar')
    return { success: true, message: '语法已创建。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    return { success: false, message }
  }
}

export async function updateGrammar(payload: UpdateGrammarPayload) {
  const grammarId = (payload.grammarId || '').trim()
  const name = (payload.name || '').trim()
  const constructionsInput = (payload.constructionsInput || '').trim()
  const clusterTitle = (payload.clusterTitle || '').trim()
  const tags = splitByDelimiters(payload.tagsInput || '')
  const constructions = normalizeConstructions(
    payload.constructions,
    constructionsInput,
  )

  if (!grammarId) return { success: false, message: '语法 ID 缺失。' }
  if (!name) return { success: false, message: '语法名称不能为空。' }

  try {
    await prisma.$transaction(async tx => {
      await tx.grammar.update({
        where: { id: grammarId },
        data: {
          name,
        },
      })

      await tx.grammarExample.deleteMany({
        where: { grammarId },
      })
      await tx.grammarConstruction.deleteMany({
        where: { grammarId },
      })
      if (constructions.length > 0) {
        for (const item of constructions) {
          const createdConstruction = await tx.grammarConstruction.create({
            data: {
              grammarId,
              connection: item.connection,
              meaning: item.meaning,
              note: item.note,
              sortOrder: item.sortOrder,
            },
            select: { id: true },
          })

          const manualExamples = parseExamples(item.examplesInput || '')
          if (manualExamples.length > 0) {
            await tx.grammarExample.createMany({
              data: manualExamples.map(example => ({
                grammarId,
                constructionId: createdConstruction.id,
                source: 'MANUAL',
                sentenceText: example.sentenceText,
              })),
            })
          }

          if ((item.sentenceExampleIds || []).length > 0) {
            const sentenceRows = await tx.vocabularySentence.findMany({
              where: { id: { in: item.sentenceExampleIds } },
              select: { id: true, text: true, translation: true },
            })
            if (sentenceRows.length > 0) {
              await tx.grammarExample.createMany({
                data: sentenceRows.map(sentence => ({
                  grammarId,
                  constructionId: createdConstruction.id,
                  source: 'SENTENCE_DB',
                  sentenceId: sentence.id,
                  sentenceText: sentence.text,
                })),
              })
            }
          }
        }
      }

      await tx.grammarTagOnGrammar.deleteMany({
        where: { grammarId },
      })
      for (const tagName of tags) {
        const tag = await tx.grammarTag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
          select: { id: true },
        })
        await tx.grammarTagOnGrammar.create({
          data: {
            grammarId,
            tagId: tag.id,
          },
        })
      }

      await tx.grammarClusterMember.deleteMany({
        where: { grammarId },
      })
      if (clusterTitle) {
        const cluster = await tx.grammarCluster.upsert({
          where: { title: clusterTitle },
          update: {},
          create: { title: clusterTitle },
          select: { id: true },
        })
        await tx.grammarClusterMember.create({
          data: {
            clusterId: cluster.id,
            grammarId,
          },
        })
      }

    })

    revalidatePath('/grammar')
    revalidatePath('/grammar/edit')
    return { success: true, message: '语法已保存。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}

export async function removeGrammar(grammarId: string) {
  const id = (grammarId || '').trim()
  if (!id) return { success: false, message: '语法 ID 缺失。' }

  try {
    await prisma.grammar.delete({
      where: { id },
    })
    revalidatePath('/grammar')
    revalidatePath('/grammar/edit')
    return { success: true, message: '语法已删除。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

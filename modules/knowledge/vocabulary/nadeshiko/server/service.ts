import 'server-only'

import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { DomainError } from '@/lib/errors/domain-error'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { normalizeVocabularySentenceTextKey } from '@/utils/vocabulary/sentenceQuality'
import { computeSingleSentencePronunciation } from '../../server/pronunciation-service'
import { PRONUNCIATION_VERSION } from '../../domain/pronunciation'
import { addInputSchema, searchInputSchema, nadeshikoSourceLabel } from '../domain'
import { searchNadeshiko } from './client'

async function requireVocabulary(vocabularyId: string) {
  const userId = await getCurrentUserId()
  const vocabulary = await prisma.vocabulary.findFirst({
    where: { id: vocabularyId, userId }, select: { id: true },
  })
  if (!vocabulary) throw new DomainError('NOT_FOUND', '单词不存在或无权操作')
  return userId
}

export async function searchExamples(input: unknown) {
  const { vocabularyId, query } = searchInputSchema.parse(input)
  const userId = await requireVocabulary(vocabularyId)
  const examples = await searchNadeshiko(query)
  const links = await prisma.vocabularySentenceLink.findMany({
    where: {
      vocabularyId, vocabulary: { userId },
      sentence: { provider: 'nadeshiko', externalId: { in: examples.map(item => item.externalId) } },
    },
    select: { sentence: { select: { externalId: true } } },
  })
  const added = new Set(links.map(link => link.sentence.externalId))
  return examples.map(example => ({ ...example, isAdded: added.has(example.externalId) }))
}

export async function addExample(input: unknown) {
  const { vocabularyId, query, externalId, senseId } = addInputSchema.parse(input)
  const userId = await requireVocabulary(vocabularyId)
  // Use only server-fetched content. Clients cannot author source metadata or audio URLs.
  const example = (await searchNadeshiko(query)).find(item => item.externalId === externalId)
  if (!example) throw new DomainError('NOT_FOUND', '搜索结果已失效，请重新搜索')
  const pronunciation = await computeSingleSentencePronunciation(example.sentence)
  const sourceUrl = `https://nadeshiko.co/sentence/${encodeURIComponent(externalId)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        // Serialize append order for this vocabulary, including requests from other tabs.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${vocabularyId}))`
        const owned = await tx.vocabulary.findFirst({ where: { id: vocabularyId, userId }, select: { id: true } })
        if (!owned) throw new DomainError('NOT_FOUND', '单词不存在或无权操作')
        const sense = senseId ? await tx.vocabularySense.findFirst({
          where: { id: senseId, vocabularyId }, select: { id: true, order: true },
        }) : null
        if (senseId && !sense) throw new DomainError('VALIDATION_ERROR', '义项不存在，请重新打开单词')
        const sentence = await tx.vocabularySentence.upsert({
          where: { provider_externalId: { provider: 'nadeshiko', externalId } },
          update: {},
          create: {
            provider: 'nadeshiko', externalId,
            text: example.sentence,
            normalizedText: normalizeVocabularySentenceTextKey(example.sentence),
            translation: example.translation,
            audioFile: example.audioUrl,
            source: `Nadeshiko · ${nadeshikoSourceLabel(example)}`,
            sourceUrl,
            // Canonical text, audio, identity and URL remain in their existing columns.
            sourceMetadata: {
              media: example.media, episode: example.episode,
              startTimeMs: example.startTimeMs, endTimeMs: example.endTimeMs,
              imageUrl: example.imageUrl, videoUrl: example.videoUrl,
            },
            ...(pronunciation ? {
              pronunciationData: pronunciation as unknown as Prisma.InputJsonValue,
              pronunciationVersion: PRONUNCIATION_VERSION,
            } : {}),
          },
          select: { id: true },
        })
        const last = await tx.vocabularySentenceLink.aggregate({
          where: { vocabularyId }, _max: { sortOrder: true },
        })
        return tx.vocabularySentenceLink.upsert({
          where: { vocabularyId_sentenceId: { vocabularyId, sentenceId: sentence.id } },
          update: {},
          create: {
            vocabularyId, sentenceId: sentence.id,
            senseId: sense?.id, meaningIndex: sense?.order,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
          select: { id: true },
        })
      })
    } catch (error) {
      // Two different vocabularies may create the same shared segment concurrently.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) continue
      throw error
    }
  }
  throw new DomainError('CONFLICT', '请重试添加例句')
}

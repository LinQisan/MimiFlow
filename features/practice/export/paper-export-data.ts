import { MaterialType } from '@prisma/client'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import prisma from '@/lib/prisma'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { resolveListeningSection } from '@/lib/repositories/exam'
import { readJsonRecord, readString } from '@/lib/validation/schema'
import {
  getPaperLanguageSectionGroup,
  getReadingQuestionSection,
  getVocabGrammarQuestionSection,
} from '@/features/questions/domain/paper-editor'
import { getToeicPartByQuestionType } from '@/features/questions/domain/toeic'
import { normalizeQuestionTextFields } from '@/modules/practice/domain/question-text'
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { resolvePathInsideRoot } from '@/utils/files/path'

export type PaperExportOption = {
  id: string
  text: string
  imageDataUrl: string | null
}

export type PaperExportQuestion = {
  id: string
  materialId: string
  materialType: MaterialType
  questionType: string
  targetWord: string
  prompt: string
  context: string
  analysis: string
  imageDataUrl: string | null
  options: PaperExportOption[]
  answerIds: string[]
  optionLabelFormat: OptionLabelFormat
  customOptionLabels: string[]
  sortingOrder: number[]
  sourceOrder: number
  localNumber: number
}

export type PaperExportDialogue = {
  text: string
  start: number
  sequenceId: number
}

export type PaperExportMaterial = {
  id: string
  type: MaterialType
  title: string
  passageText: string
  audioPath: string
  audioAbsolutePath: string | null
  audioExportName: string | null
  transcript: string
  dialogues: PaperExportDialogue[]
  questions: PaperExportQuestion[]
}

export type PaperExportSection = {
  key: string
  materialKey: 'TEXT_VOCAB' | 'GRAMMAR' | 'READING' | 'LISTENING'
  materialTitle: string
  sectionNumber: number
  sectionTitle: string
  heading: string
  materials: PaperExportMaterial[]
}

export type PaperExportData = {
  id: string
  title: string
  description: string
  language: string
  level: string
  questionCount: number
  generatedAt: Date
  sections: PaperExportSection[]
  audioFiles: Array<{
    sourcePath: string
    absolutePath: string
    exportName: string
  }>
  warnings: string[]
}

type LoadedPaper = Awaited<ReturnType<typeof loadPaper>>
type SourceMaterial = LoadedPaper['materials'][number]['material']

const PUBLIC_ROOT = path.join(process.cwd(), 'public')
const AUDIO_ROOT = path.join(PUBLIC_ROOT, 'audios')

const asRecords = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : []

const toAnswerIds = (value: unknown) =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )

const safeName = (value: string, fallback: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 90) || fallback

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

async function toPublicImageDataUrl(webPath: string) {
  if (!webPath.startsWith('/images/')) return null
  const absolutePath = resolvePathInsideRoot(PUBLIC_ROOT, webPath.slice(1))
  if (!absolutePath) return null
  const mime = mimeByExtension[path.extname(absolutePath).toLowerCase()]
  if (!mime) return null
  try {
    const data = await readFile(absolutePath)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

async function resolveAudioFile(webPath: string) {
  if (!webPath.startsWith('/audios/')) return null
  const absolutePath = resolvePathInsideRoot(
    AUDIO_ROOT,
    webPath.slice('/audios/'.length),
  )
  if (!absolutePath) return null
  try {
    const info = await stat(absolutePath)
    return info.isFile() ? absolutePath : null
  } catch {
    return null
  }
}

async function loadPaper(paperId: string) {
  return prisma.collection.findFirstOrThrow({
    where: { id: paperId, collectionType: 'PAPER' },
    include: {
      materials: {
        orderBy: { sortOrder: 'asc' },
        include: {
          material: {
            include: {
              questions: {
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                  id: true,
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  answer: true,
                  analysis: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

function sectionForQuestion(
  material: SourceMaterial,
  questionType: string,
  language: string | null,
) {
  const toeicPart = getToeicPartByQuestionType(questionType)
  if (toeicPart) {
    const isListening = toeicPart.part <= 4
    return {
      materialKey: isListening ? ('LISTENING' as const) : ('READING' as const),
      materialTitle: isListening ? 'Listening' : 'Reading',
      sectionNumber: toeicPart.part,
      sectionTitle: toeicPart.title,
      heading: `Part ${toeicPart.part} · ${toeicPart.title}`,
    }
  }

  if (material.type === MaterialType.LISTENING) {
    const section = resolveListeningSection({
      content: {},
      payload: decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      ),
      metadata: readJsonRecord(material.metadata),
      chapterName: material.chapterName || material.title,
      questionType: questionType as never,
      language,
    })
    const sectionNumber = section.partNumber || 1
    return {
      materialKey: 'LISTENING' as const,
      materialTitle: '聴解',
      sectionNumber,
      sectionTitle: section.title,
      heading: `問題${sectionNumber}｜${section.title}`,
    }
  }

  if (material.type === MaterialType.READING) {
    const section = getReadingQuestionSection(questionType)
    return {
      materialKey: 'READING' as const,
      materialTitle: '読解',
      sectionNumber: section.sectionNumber,
      sectionTitle: section.title,
      heading: `問題${section.sectionNumber}｜${section.title}`,
    }
  }

  const section = getVocabGrammarQuestionSection(questionType)
  const group = getPaperLanguageSectionGroup(section.sectionNumber)
  return {
    materialKey: group.key,
    materialTitle: group.title,
    sectionNumber: section.sectionNumber,
    sectionTitle: section.title,
    heading: `問題${section.sectionNumber}｜${section.title}`,
  }
}

async function buildMaterial(
  material: SourceMaterial,
  sourceOrderStart: number,
  warnings: string[],
) {
  const payload = decodeMaterialPayloadRecord(
    material.type,
    material.contentPayload,
  )
  const rawAudioPath =
    material.type === MaterialType.LISTENING
      ? readString(payload.audioFile) || readString(payload.audioUrl)
      : ''
  const audioAbsolutePath = rawAudioPath
    ? await resolveAudioFile(rawAudioPath)
    : null
  if (rawAudioPath && !audioAbsolutePath) {
    warnings.push(`音频文件缺失：${material.title}（${rawAudioPath}）`)
  }
  if (material.type === MaterialType.LISTENING && !rawAudioPath) {
    warnings.push(`听力材料没有关联音频：${material.title}`)
  }

  const dialogues = asRecords(payload.dialogues)
    .map((item, index) => ({
      text: readString(item.text),
      start: Number(item.start || 0),
      sequenceId: Number(item.sequenceId || item.id || index + 1),
    }))
    .filter(item => item.text)
    .sort((left, right) => left.sequenceId - right.sequenceId)
  const transcript = readString(payload.transcript)
  if (
    material.type === MaterialType.LISTENING &&
    dialogues.length === 0 &&
    !transcript
  ) {
    warnings.push(`听力材料没有原文：${material.title}`)
  }

  const questions = await Promise.all(
    material.questions.map(async (row, index) => {
      const content = decodeQuestionContent(row.content)
      const normalized = normalizeQuestionTextFields(row.prompt, row.context)
      const rawImageUrl = readString(content.imageUrl)
      const imageDataUrl = rawImageUrl
        ? await toPublicImageDataUrl(rawImageUrl)
        : null
      if (rawImageUrl && !imageDataUrl) {
        warnings.push(`题图无法读取：${material.title}（${rawImageUrl}）`)
      }
      const options = await Promise.all(
        asRecords(row.options).map(async (option, optionIndex) => {
          const optionImageUrl = readString(option.imageUrl)
          const optionImageDataUrl = optionImageUrl
            ? await toPublicImageDataUrl(optionImageUrl)
            : null
          if (optionImageUrl && !optionImageDataUrl) {
            warnings.push(
              `选项图片无法读取：${material.title} / 第 ${index + 1} 题（${optionImageUrl}）`,
            )
          }
          return {
            id: readString(option.id) || `opt_${optionIndex + 1}`,
            text: readString(option.text),
            imageDataUrl: optionImageDataUrl,
          }
        }),
      )
      return {
        id: row.id,
        materialId: material.id,
        materialType: material.type,
        questionType: row.questionType,
        targetWord: readString(content.targetWord),
        prompt: normalized.prompt || '',
        context: normalized.context || '',
        analysis: row.analysis || '',
        imageDataUrl,
        options,
        answerIds: toAnswerIds(row.answer),
        optionLabelFormat: normalizeOptionLabelFormat(
          content.optionLabelFormat,
          'numeric',
        ),
        customOptionLabels: parseCustomOptionLabels(
          content.customOptionLabels,
        ),
        sortingOrder: Array.isArray(content.sortingOrder)
          ? content.sortingOrder
          : [],
        sourceOrder: sourceOrderStart + index,
        localNumber: 0,
      } satisfies PaperExportQuestion
    }),
  )

  return {
    id: material.id,
    type: material.type,
    title: material.title,
    passageText:
      material.type === MaterialType.READING
        ? readString(payload.text) || readString(payload.transcript)
        : '',
    audioPath: rawAudioPath,
    audioAbsolutePath,
    audioExportName: null,
    transcript,
    dialogues,
    questions,
  } satisfies PaperExportMaterial
}

export async function getPaperExportData(
  paperId: string,
): Promise<PaperExportData | null> {
  let paper: LoadedPaper
  try {
    paper = await loadPaper(paperId)
  } catch {
    return null
  }

  const warnings: string[] = []
  const materials: PaperExportMaterial[] = []
  let sourceOrder = 0
  for (const relation of paper.materials) {
    const material = await buildMaterial(
      relation.material,
      sourceOrder,
      warnings,
    )
    sourceOrder += material.questions.length
    if (material.questions.length > 0) materials.push(material)
  }

  const sourceMaterials = new Map(
    paper.materials.map(item => [item.material.id, item.material]),
  )
  const sections = new Map<string, PaperExportSection>()
  for (const material of materials) {
    for (const question of material.questions) {
      const source = sourceMaterials.get(material.id)!
      const meta = sectionForQuestion(
        source,
        question.questionType,
        paper.language,
      )
      const key = `${meta.materialKey}:${meta.sectionNumber}`
      let section = sections.get(key)
      if (!section) {
        section = { key, ...meta, materials: [] }
        sections.set(key, section)
      }
      let sectionMaterial = section.materials.find(
        item => item.id === material.id,
      )
      if (!sectionMaterial) {
        sectionMaterial = { ...material, questions: [] }
        section.materials.push(sectionMaterial)
      }
      question.localNumber = section.materials.reduce(
        (sum, item) => sum + item.questions.length,
        1,
      )
      sectionMaterial.questions.push(question)
    }
  }

  const materialOrder = {
    TEXT_VOCAB: 0,
    GRAMMAR: 1,
    READING: 2,
    LISTENING: 3,
  }
  const orderedSections = [...sections.values()].sort(
    (left, right) =>
      materialOrder[left.materialKey] - materialOrder[right.materialKey] ||
      left.sectionNumber - right.sectionNumber,
  )

  const audioFiles: PaperExportData['audioFiles'] = []
  let audioIndex = 0
  for (const section of orderedSections) {
    for (const material of section.materials) {
      if (!material.audioPath || !material.audioAbsolutePath) continue
      const existing = audioFiles.find(
        item => item.sourcePath === material.audioPath,
      )
      if (existing) {
        material.audioExportName = existing.exportName
        continue
      }
      audioIndex += 1
      const extension =
        path.extname(material.audioAbsolutePath).toLowerCase() || '.mp3'
      const numberRange =
        material.questions.length === 1
          ? `${material.questions[0].localNumber}`
          : `${material.questions[0].localNumber}-${material.questions.at(-1)!.localNumber}`
      const exportName = `${String(audioIndex).padStart(2, '0')}-${safeName(section.heading, '听力')}-${numberRange}${extension}`
      material.audioExportName = exportName
      audioFiles.push({
        sourcePath: material.audioPath,
        absolutePath: material.audioAbsolutePath,
        exportName,
      })
    }
  }

  return {
    id: paper.id,
    title: paper.title,
    description: paper.description || '',
    language: paper.language || '',
    level: paper.level || '',
    questionCount: orderedSections.reduce(
      (sum, section) =>
        sum +
        section.materials.reduce(
          (count, material) => count + material.questions.length,
          0,
        ),
      0,
    ),
    generatedAt: new Date(),
    sections: orderedSections,
    audioFiles,
    warnings: [...new Set(warnings)],
  }
}

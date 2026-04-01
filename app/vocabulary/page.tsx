// app/vocabulary/page.tsx
import prisma from '@/lib/prisma'
import VocabularyTabs from './VocabularyTabs'
import { guessLanguageCode } from '@/utils/langDetector'
import { parseJsonStringList } from '@/utils/jsonList'
import { toVocabularyMeta } from '@/utils/vocabularyMeta'

type SentenceSource = {
  text: string
  source: string
  sourceUrl: string
  meaningIndex?: number | null
  posTags?: string[]
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

type GroupedVocabItem = {
  id: string
  word: string
  languageCode: string
  pronunciation?: string | null
  pronunciations?: string[]
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  meanings?: string[]
  folderId?: string | null
  folderName?: string | null
  createdAt: Date
  sourceType: string
  sentences: SentenceSource[]
  audioData: AudioData | null
}

type FolderItem = {
  id: string
  name: string
}

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(new Set((list || []).map(item => item.trim()).filter(Boolean))).slice(
    0,
    1,
  )

export default async function VocabularyPage() {
  // 获取生词及关联句子
  const rawVocabularies = await prisma.vocabulary.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      folder: {
        select: { id: true, name: true },
      },
    },
  })
  const folders = await prisma.vocabularyFolder.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  const vocabularyIds = rawVocabularies.map(item => item.id)
  const sentenceLinks = await prisma.vocabularySentenceLink.findMany({
    where: { vocabularyId: { in: vocabularyIds } },
    include: { sentence: true },
    orderBy: { createdAt: 'asc' },
  })
  const sentenceLinksByVocabularyId = sentenceLinks.reduce<
    Record<string, SentenceSource[]>
  >((acc, link) => {
    const posTags = normalizeSentencePosTags(parseJsonStringList(link.posTags))
    if (!acc[link.vocabularyId]) acc[link.vocabularyId] = []
    acc[link.vocabularyId].push({
      text: link.sentence.text,
      source: link.sentence.source,
      sourceUrl: link.sentence.sourceUrl,
      meaningIndex: link.meaningIndex ?? null,
      posTags,
    })
    return acc
  }, {})

  // 按来源提取 ID，后续批量查询关联数据
  const dialogueIds = rawVocabularies
    .filter(v => v.sourceType === 'AUDIO_DIALOGUE')
    .map(v => parseInt(v.sourceId))
    .filter(id => !isNaN(id))
  const articleIds = rawVocabularies
    .filter(v => v.sourceType === 'ARTICLE_TEXT')
    .map(v => v.sourceId)
  const questionIds = rawVocabularies
    .filter(v => v.sourceType === 'QUIZ_QUESTION')
    .map(v => v.sourceId)

  // 并行获取来源对象
  const [dialogues, articles, questions] = await Promise.all([
    prisma.dialogue.findMany({
      where: { id: { in: dialogueIds } },
      include: {
        lesson: { include: { category: { include: { level: true } } } },
      },
    }),
    prisma.article.findMany({
      where: { id: { in: articleIds } },
      include: { category: { include: { level: true } } },
    }),
    prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        // 独立题库来源
        quiz: {
          include: { category: { include: { level: true } } },
        },
        // 阅读题来源
        article: {
          include: { category: { include: { level: true } } },
        },
      },
    }),
  ])

  // 建立快速索引
  const dialogueMap = new Map(dialogues.map(d => [d.id, d]))
  const articleMap = new Map(articles.map(a => [a.id, a]))
  const questionMap = new Map(questions.map(q => [q.id, q]))

  const groupedData: Record<string, GroupedVocabItem[]> = {}

  // 组装页面数据
  rawVocabularies.forEach(vocab => {
    let sourceName = '未知来源'
    let levelTitle = ''
    let sourceUrl = '#'
    let audioData: AudioData | null = null

    // 解析来源信息
    if (vocab.sourceType === 'AUDIO_DIALOGUE') {
      const d = dialogueMap.get(parseInt(vocab.sourceId))
      if (d) {
        levelTitle = d.lesson.category.level?.title || ''
        sourceName = `🎧 听力：${d.lesson.title}`
        sourceUrl = `/lessons/${d.lessonId}`
        audioData = {
          audioFile: d.lesson.audioFile,
          start: d.start,
          end: d.end,
        }
      }
    } else if (vocab.sourceType === 'ARTICLE_TEXT') {
      const a = articleMap.get(vocab.sourceId)
      if (a) {
        levelTitle = a.category?.level?.title || '未分类'
        sourceName = `📄 阅读：${a.title}`
        sourceUrl = `/articles/${a.id}`
      }
    } else if (vocab.sourceType === 'QUIZ_QUESTION') {
      const q = questionMap.get(vocab.sourceId)
      if (q) {
        if (q.quiz) {
          const quizTitle = q.quiz.title || '无标题题库'
          levelTitle = q.quiz.category?.level?.title || ''
          sourceName = `📝 题目：${quizTitle}`
          sourceUrl = `/quizzes/${q.quizId}`
        } else if (q.article) {
          const articleTitle = q.article.title || '无标题文章'
          levelTitle = q.article.category?.level?.title || ''
          sourceName = `📄 阅读题目：${articleTitle}`
          sourceUrl = `/articles/${q.articleId}`
        } else {
          sourceName = '📝 练习题 (来源已失效)'
          sourceUrl = '#'
        }
      } else {
        sourceName = '📝 题目 (原题已删除)'
        sourceUrl = '#'
      }
    }

    let parsedSentences: SentenceSource[] = []
    const linkedSentences = sentenceLinksByVocabularyId[vocab.id] || []
    if (linkedSentences.length > 0) {
      parsedSentences = linkedSentences
    }

    // 分组
    const defaultLang = guessLanguageCode(vocab.word) || 'other'
    const defaultNames: Record<string, string> = {
      ja: '日语',
      en: '英语',
      ko: '韩语',
      zh: '中文',
      other: '未分类',
    }

    const finalGroupName =
      vocab.groupName || defaultNames[defaultLang] || '未分类'
    if (!groupedData[finalGroupName]) groupedData[finalGroupName] = []
    const meta = toVocabularyMeta(vocab)
    groupedData[finalGroupName].push({
      id: vocab.id,
      word: vocab.word,
      languageCode: defaultLang,
      pronunciation: meta.pronunciations[0] || null,
      pronunciations: meta.pronunciations,
      partOfSpeech: meta.partsOfSpeech[0] || null,
      partsOfSpeech: meta.partsOfSpeech,
      meanings: meta.meanings,
      folderId: vocab.folder?.id || null,
      folderName: vocab.folder?.name || null,
      createdAt: vocab.createdAt,
      sourceType: vocab.sourceType,
      sentences: parsedSentences,
      audioData,
    })
  })

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='max-w-7xl mx-auto'>
        <VocabularyTabs groupedData={groupedData} folders={folders as FolderItem[]} />
      </div>
    </main>
  )
}

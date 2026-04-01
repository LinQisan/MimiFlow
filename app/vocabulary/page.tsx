// app/vocabulary/page.tsx
import prisma from '@/lib/prisma'
import VocabularyTabs from './VocabularyTabs'
import { guessLanguageCode } from '@/utils/langDetector'

type SentenceSource = {
  text: string
  source: string
  sourceUrl: string
  meaningIndex?: number | null
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

type GroupedVocabItem = {
  id: string
  word: string
  pronunciation?: string | null
  pronunciations?: string[]
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  meanings?: string[]
  createdAt: Date
  sourceType: string
  sentences: SentenceSource[]
  audioData: AudioData | null
}

const parseJsonList = (value?: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

export default async function VocabularyPage() {
  // 1. 获取所有生词
  const rawVocabularies = await prisma.vocabulary.findMany({
    orderBy: { createdAt: 'desc' },
  })

  // 2. 提取不同来源的 ID
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

  // 3. 并行获取所有关联数据 (重点检查了 include 层级)
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
        // 🌟 核心：必须 include 到这一层，前端才能看到题目名和试卷名
        // 🌟 1. 查独立题库关联
        quiz: {
          include: { category: { include: { level: true } } },
        },
        // 🌟 2. 查阅读文章关联 (这是解决“练习题”的关键！)
        article: {
          include: { category: { include: { level: true } } },
        },
      },
    }),
  ])

  // 4. 建立快速查找索引
  const dialogueMap = new Map(dialogues.map(d => [d.id, d]))
  const articleMap = new Map(articles.map(a => [a.id, a]))
  const questionMap = new Map(questions.map(q => [q.id, q]))

  const groupedData: Record<string, GroupedVocabItem[]> = {}

  // 5. 数据清洗与组装
  rawVocabularies.forEach(vocab => {
    let sourceName = '未知来源'
    let levelTitle = ''
    let sourceUrl = '#'
    let audioData: AudioData | null = null

    // --- 分流处理来源 ---
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
          // 模式 A：来自独立题库
          const quizTitle = q.quiz.title || '无标题题库'
          levelTitle = q.quiz.category?.level?.title || ''
          sourceName = `📝 题目：${quizTitle}`
          sourceUrl = `/quizzes/${q.quizId}`
        } else if (q.article) {
          // 模式 B：来自阅读理解题目
          const articleTitle = q.article.title || '无标题文章'
          levelTitle = q.article.category?.level?.title || ''
          sourceName = `📄 阅读题目：${articleTitle}` // 这样用户能一眼看出是阅读题
          sourceUrl = `/articles/${q.articleId}` // 跳转回文章页
        } else {
          // 兜底：如果关联都断了
          sourceName = '📝 练习题 (来源已失效)'
          sourceUrl = '#'
        }
      } else {
        sourceName = '📝 题目 (原题已删除)'
        sourceUrl = '#'
      }
    }

    // --- 标准化例句对象 ---
    let parsedSentences: SentenceSource[] = []
    const defaultSourceStr = levelTitle
      ? `${levelTitle} - ${sourceName}`
      : sourceName

    try {
      const parsed = JSON.parse(vocab.contextSentence || '[]')
      if (Array.isArray(parsed)) {
        parsedSentences = parsed.map(s => {
          if (typeof s === 'string') {
            return { text: s, source: defaultSourceStr, sourceUrl }
          }
          if (s && typeof s === 'object' && 'text' in s) {
            const text = String((s as { text: unknown }).text || '')
            const sourceRaw = (s as { source?: unknown }).source
            const sourceUrlRaw = (s as { sourceUrl?: unknown }).sourceUrl
            const meaningIndexRaw = (s as { meaningIndex?: unknown }).meaningIndex
            const meaningIndex =
              typeof meaningIndexRaw === 'number' &&
              Number.isInteger(meaningIndexRaw) &&
              meaningIndexRaw >= 0
                ? meaningIndexRaw
                : null
            const sourceCandidate = String(sourceRaw || '').trim()
            const source =
              !sourceCandidate || sourceCandidate === '未知来源'
                ? defaultSourceStr
                : sourceCandidate
            const sourceUrlCandidate = String(sourceUrlRaw || '').trim()
            const sourceUrlValue =
              !sourceUrlCandidate || sourceUrlCandidate === '#'
                ? sourceUrl
                : sourceUrlCandidate
            return {
              text,
              source,
              sourceUrl: sourceUrlValue,
              meaningIndex,
            }
          }
          return { text: '', source: defaultSourceStr, sourceUrl }
        })
      } else if (vocab.contextSentence) {
        parsedSentences = [
          { text: vocab.contextSentence, source: defaultSourceStr, sourceUrl },
        ]
      }
    } catch {
      if (vocab.contextSentence) {
        parsedSentences = [
          { text: vocab.contextSentence, source: defaultSourceStr, sourceUrl },
        ]
      }
    }

    // --- 分组 ---
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
    groupedData[finalGroupName].push({
      id: vocab.id,
      word: vocab.word,
      pronunciation:
        parseJsonList(vocab.pronunciations)[0] || vocab.pronunciation || null,
      pronunciations: parseJsonList(vocab.pronunciations),
      partOfSpeech:
        parseJsonList(vocab.partsOfSpeech)[0] || vocab.partOfSpeech || null,
      partsOfSpeech: parseJsonList(vocab.partsOfSpeech),
      meanings: parseJsonList(vocab.meanings),
      createdAt: vocab.createdAt,
      sourceType: vocab.sourceType,
      sentences: parsedSentences,
      audioData,
    })
  })

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='max-w-7xl mx-auto mt-4 md:mt-6'>
        <div className='mb-8 md:mb-10'>
          <h1 className='text-3xl font-black text-gray-900 tracking-tight'>
            单词
          </h1>
          <p className='text-gray-500 mt-2'>
            按语言与分组管理生词，支持注音与音标辅助记忆。
          </p>
        </div>
        <VocabularyTabs groupedData={groupedData} />
      </div>
    </main>
  )
}

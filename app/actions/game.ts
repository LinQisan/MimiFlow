'use server'

import { revalidatePath } from 'next/cache'
import { GameDifficultyPreset, MaterialType, StudyTimeKind } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getTodayStudyPlan, type TodayTaskItem } from '@/app/actions/studyPlan'
import { getTopMaterialSnapshots } from '@/lib/repositories/materials'

const DAY = 24 * 60 * 60 * 1000
const PROFILE_ID = 'default'

const GAME_TASK_KEYS = [
  'morning_new_content',
  'morning_reading_cycle',
  'afternoon_mixed_practice',
  'evening_feynman_diary',
  'night_light_review',
  'next_morning_dictation',
] as const

const GAME_STREAK_TASK_KEYS: GameTaskKey[] = GAME_TASK_KEYS.filter(
  key => key !== 'next_morning_dictation',
)

type GameTaskKey = (typeof GAME_TASK_KEYS)[number]
type GameTaskMode = 'auto' | 'input' | 'manual'

type GameTaskDef = {
  key: GameTaskKey
  title: string
  description: string
  tip: string
  points: number
  coins: number
  phase: 'morning' | 'afternoon' | 'evening' | 'night' | 'nextMorning'
  mode: GameTaskMode
  targetValue: number
  unit: string
}

type OutputAssessmentMetrics = {
  totalScore: number
  comprehensibility: number
  accuracy: number
  complexity: number
  taskCompletion: number
  feedbackSummary: string
  actionItems: string[]
}

type RecallAssessmentMetrics = {
  totalScore: number
  accuracy: number
  coverage: number
  clarity: number
  feedbackSummary: string
  actionItems: string[]
  modelAnswer: string
}

export type GameTaskView = GameTaskDef & {
  done: boolean
  completedAt?: Date | null
  currentValue: number
  progressPct: number
  baseTargetValue: number
  targetScalePct: number
}

export type GameDashboard = {
  dateKey: string
  profile: {
    level: number
    xp: number
    xpInLevel: number
    xpToNext: number
    coins: number
    streakDays: number
    difficultyPreset: GameDifficultyPreset
  }
  summary: {
    doneCount: number
    totalCount: number
    totalPoints: number
    earnedPoints: number
    earnedCoins: number
  }
  metrics: {
    speakingMinutes: number
    readingMinutes: number
    effectiveReadingMinutes: number
    lessonUploads: number
    articleUploads: number
    quizUploads: number
    newQuestionSolved: number
    quizAttempts: number
    reviewCount: number
    mixedUnits: number
    outputWordCount: number
    outputScore: number
  }
  mixedPlan: { title: string; href: string }[]
  diary: {
    content: string
    wordCount: number
  }
  recall: {
    sourceDateKey: string
    prompt: string
    content: string
    wordCount: number
    coachPromptTemplate: string
    aiFeedbackRaw: string
    metrics: RecallAssessmentMetrics
  }
  output: {
    missionPromptTemplate: string
    coachPromptTemplate: string
    missionText: string
    learnerText: string
    aiFeedbackRaw: string
    metrics: OutputAssessmentMetrics
    updatedAt: Date | null
  }
  todayPlan: {
    tasks: TodayTaskItem[]
    startHref: string
  }
  tasks: GameTaskView[]
}

export type DiaryListEntry = {
  dateKey: string
  diaryWordCount: number
  recallWordCount: number
  diaryUpdatedAt: Date | null
  recallUpdatedAt: Date | null
}

export type GameDifficultyOption = {
  value: GameDifficultyPreset
  label: string
  hint: string
}

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const startOfDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+09:00`)

const dateRangeOf = (dateKey: string) => {
  const start = startOfDate(dateKey)
  const end = new Date(start.getTime() + DAY)
  return { start, end }
}

const previousDateKey = (dateKey: string) => {
  const start = startOfDate(dateKey)
  return toDateKey(new Date(start.getTime() - DAY))
}

const levelByXp = (xp: number) => {
  const safeXp = Math.max(0, xp)
  const level = Math.floor(safeXp / 1000) + 1
  const floor = (level - 1) * 1000
  const next = level * 1000
  return {
    level,
    xpInLevel: safeXp - floor,
    xpToNext: Math.max(0, next - safeXp),
  }
}

const OUTPUT_PLACEHOLDER_MISSION = '{{MISSION_TEXT}}'
const OUTPUT_PLACEHOLDER_LEARNER = '{{LEARNER_TEXT}}'
const RECALL_PLACEHOLDER_PROMPT = '{{RECALL_PROMPT}}'
const RECALL_PLACEHOLDER_TEXT = '{{RECALL_TEXT}}'

const clampScore = (value: unknown, fallback = 0) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.min(100, Math.round(num)))
}

const countChars = (value: string) => value.replace(/\s+/g, '').trim().length

const buildOutputMissionPromptTemplate = (
  dateKey: string,
  previous?: {
    totalScore: number
    feedbackSummary: string
    actionItems: string[]
  },
) => {
  const previousSummary = (previous?.feedbackSummary || '').trim()
  const previousActions = (previous?.actionItems || [])
    .filter(Boolean)
    .slice(0, 3)
  const previousScore = Number.isFinite(previous?.totalScore)
    ? Math.max(0, Number(previous?.totalScore || 0))
    : 0
  const adaptiveLine =
    previousScore >= 85
      ? '7) 难度自适应：昨天表现较好，请在同主题下提高半档复杂度（增加1-2个更高级连接结构）。'
      : previousScore > 0 && previousScore < 65
        ? '7) 难度自适应：昨天完成偏吃力，请降低词汇负担并先保证可理解度，再加入1个新结构。'
        : '7) 难度自适应：默认标准难度，维持 i+1（95%可理解 + 5%新结构）。'
  const carryLine =
    previousActions.length > 0
      ? `8) 必须优先纠正昨天问题：${previousActions.join('；')}。`
      : previousSummary
        ? `8) 参考昨天反馈：${previousSummary.slice(0, 80)}。`
        : '8) 若无历史反馈，可自行选择一个高频错误作为本次重点。'

  return [
    '你是我的二语教练，请按“可理解输入(i+1)→输出假设→聚焦纠错→再输出”的原则，给我今天的一次写作输出任务。',
    '约束：',
    '1) 目标语言默认日语；如果我说明其他语言，按我指定语言。',
    '2) 先判断我的当前水平；若我未提供水平，默认按 CEFR A2/B1 过渡（或日语 N3/N2 过渡）处理。',
    '3) 任务难度必须“刚好高半档”(i+1)：95%可理解 + 5%新结构，不要过难。',
    '4) 主题偏实用表达，贴近日常/工作/学习，优先口语可迁移场景。',
    '5) 输出格式必须严格为 4 段（不要给范文）：',
    '任务标题：...',
    '写作目标：...（3 条）',
    '必须使用结构：...（3-5 条语法/句式）',
    '提交要求：字数范围、时间限制、自评检查点',
    `6) 今日日期：${dateKey}`,
    adaptiveLine,
    carryLine,
    '不要输出其它解释。',
  ].join('\n')
}

const buildOutputCoachPromptTemplate = () => {
  return [
    '你是二语写作评测教练。请基于我给出的任务与作文，输出严格 JSON（不要 markdown，不要额外文字）。',
    '评改原则：优先判断“是否完成任务要求”，再给纠错建议；并在评改后提供一篇 i+1 范文供模仿输入。',
    '评分维度（0-100）：',
    '- comprehensibility（可理解度）',
    '- accuracy（准确度）',
    '- complexity（复杂度）',
    '- taskCompletion（任务完成度）',
    '- totalScore（综合分，可由你加权）',
    '请输出 JSON 结构：',
    '{',
    '  "comprehensibility": 0,',
    '  "accuracy": 0,',
    '  "complexity": 0,',
    '  "taskCompletion": 0,',
    '  "totalScore": 0,',
    '  "feedbackSummary": "50-120字的暖心反馈",',
    '  "actionItems": ["下一轮最关键的3条可执行建议"],',
    '  "lineEdits": [{"original":"原句","suggestion":"改写","why":"原因"}],',
    '  "modelEssay": "120-180字范文，难度略高于学习者当前水平（i+1）",',
    '  "modelEssayHighlights": ["3条可迁移表达：表达片段 + 中文说明 + 可替换模板"]',
    '}',
    '要求：actionItems 必须可执行、单轮可完成；lineEdits 最多 5 条，优先高频错误。',
    '要求：modelEssay 必须与本次任务同主题，控制在 95%可理解 + 5%新结构，不要明显超纲。',
    '',
    '任务：',
    OUTPUT_PLACEHOLDER_MISSION,
    '',
    '作文：',
    OUTPUT_PLACEHOLDER_LEARNER,
  ].join('\n')
}

const buildRecallCoachPromptTemplate = () => {
  return [
    '你是二语默写评测教练。请基于“默写提示”和“学习者默写内容”，输出严格 JSON（不要 markdown，不要额外文字）。',
    '评改目标：检查记忆提取质量，而不是只看语法。请给出鼓励式反馈并指出下一步最小改进点。',
    '评分维度（0-100）：',
    '- accuracy（关键信息准确）',
    '- coverage（核心点覆盖度）',
    '- clarity（表达清晰度）',
    '- totalScore（综合分）',
    '请输出 JSON 结构：',
    '{',
    '  "accuracy": 0,',
    '  "coverage": 0,',
    '  "clarity": 0,',
    '  "totalScore": 0,',
    '  "feedbackSummary": "40-100字鼓励式反馈",',
    '  "actionItems": ["下一次默写前可执行的3条动作"],',
    '  "modelAnswer": "80-140字的参考默写版本，简洁可复述"',
    '}',
    '要求：actionItems 必须具体、可立即执行；modelAnswer 要可直接朗读/默写。',
    '',
    '默写提示：',
    '{{RECALL_PROMPT}}',
    '',
    '学习者默写：',
    '{{RECALL_TEXT}}',
  ].join('\n')
}

const parseActionItems = (value: unknown, max = 6) => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max)
}

const parseOutputAssessment = (raw: string): OutputAssessmentMetrics => {
  const source = (raw || '').trim()
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const firstJson = fenced || source.match(/\{[\s\S]*\}/)?.[0] || ''
  if (!firstJson) {
    return {
      totalScore: 0,
      comprehensibility: 0,
      accuracy: 0,
      complexity: 0,
      taskCompletion: 0,
      feedbackSummary: '',
      actionItems: [],
    }
  }

  try {
    const parsed = JSON.parse(firstJson)
    const actionItems = parseActionItems(parsed.actionItems)

    return {
      totalScore: clampScore(
        parsed.totalScore ?? parsed.overall ?? parsed.score,
      ),
      comprehensibility: clampScore(
        parsed.comprehensibility ?? parsed.understandability,
      ),
      accuracy: clampScore(parsed.accuracy ?? parsed.grammarAccuracy),
      complexity: clampScore(parsed.complexity ?? parsed.lexicalComplexity),
      taskCompletion: clampScore(
        parsed.taskCompletion ?? parsed.taskAchievement,
      ),
      feedbackSummary: String(
        parsed.feedbackSummary || parsed.summary || '',
      ).trim(),
      actionItems,
    }
  } catch {
    return {
      totalScore: 0,
      comprehensibility: 0,
      accuracy: 0,
      complexity: 0,
      taskCompletion: 0,
      feedbackSummary: '',
      actionItems: [],
    }
  }
}

const parseRecallAssessment = (raw: string): RecallAssessmentMetrics => {
  const source = (raw || '').trim()
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const firstJson = fenced || source.match(/\{[\s\S]*\}/)?.[0] || ''
  if (!firstJson) {
    return {
      totalScore: 0,
      accuracy: 0,
      coverage: 0,
      clarity: 0,
      feedbackSummary: '',
      actionItems: [],
      modelAnswer: '',
    }
  }

  try {
    const parsed = JSON.parse(firstJson)
    return {
      totalScore: clampScore(
        parsed.totalScore ?? parsed.overall ?? parsed.score,
      ),
      accuracy: clampScore(parsed.accuracy),
      coverage: clampScore(parsed.coverage ?? parsed.completeness),
      clarity: clampScore(parsed.clarity ?? parsed.coherence),
      feedbackSummary: String(
        parsed.feedbackSummary || parsed.summary || '',
      ).trim(),
      actionItems: parseActionItems(parsed.actionItems),
      modelAnswer: String(
        parsed.modelAnswer || parsed.referenceAnswer || '',
      ).trim(),
    }
  } catch {
    return {
      totalScore: 0,
      accuracy: 0,
      coverage: 0,
      clarity: 0,
      feedbackSummary: '',
      actionItems: [],
      modelAnswer: '',
    }
  }
}

const gameTaskDefs = (): GameTaskDef[] => [
  {
    key: 'morning_new_content',
    title: '晨间可理解输入',
    description: '用新语料+新题建立当天输入池（i+1）。',
    tip: '输入越新、覆盖越完整，后续输出质量越高。',
    points: 130,
    coins: 12,
    phase: 'morning',
    mode: 'auto',
    targetValue: 120,
    unit: '分',
  },
  {
    key: 'morning_reading_cycle',
    title: '提取式循环（15+5）',
    description: '听力朗诵 + 阅读时长自动折算，强化“合上提取”。',
    tip: '口语权重更高：1 分钟朗诵≈2 分钟阅读。',
    points: 180,
    coins: 16,
    phase: 'morning',
    mode: 'auto',
    targetValue: 15,
    unit: '分钟',
  },
  {
    key: 'afternoon_mixed_practice',
    title: '交错练习',
    description: '系统自动混排：复习 + 刷题 + 听力/阅读。',
    tip: '复习（口语）计 2 倍权重，避免单一题型惯性。',
    points: 140,
    coins: 13,
    phase: 'afternoon',
    mode: 'auto',
    targetValue: 12,
    unit: '练习点',
  },
  {
    key: 'evening_feynman_diary',
    title: '输出任务（AI教练）',
    description: 'AI先给输出目标，你完成后再由AI量化评改。',
    tip: '系统按 AI 评分×字数自动结算，不需要手动打卡。',
    points: 150,
    coins: 10,
    phase: 'evening',
    mode: 'input',
    targetValue: 75,
    unit: '分',
  },
  {
    key: 'night_light_review',
    title: '睡前轻回放',
    description: '系统根据当日复习与输出记录自动判定完成。',
    tip: '建议只做轻回顾，不再输入新材料。',
    points: 60,
    coins: 6,
    phase: 'night',
    mode: 'auto',
    targetValue: 1,
    unit: '次',
  },
  {
    key: 'next_morning_dictation',
    title: '次日晨默写',
    description: '系统给出提示，先默写再对照。',
    tip: '建议至少 80 字，覆盖昨天三个核心点。',
    points: 120,
    coins: 12,
    phase: 'nextMorning',
    mode: 'input',
    targetValue: 80,
    unit: '字',
  },
]

const ADAPTIVE_TASK_KEYS: GameTaskKey[] = [
  'morning_new_content',
  'morning_reading_cycle',
  'afternoon_mixed_practice',
  'evening_feynman_diary',
  'next_morning_dictation',
]

const DIFFICULTY_OPTIONS: GameDifficultyOption[] = [
  {
    value: GameDifficultyPreset.CONSERVATIVE,
    label: '保守',
    hint: '更稳：目标波动更小，适合恢复节奏。',
  },
  {
    value: GameDifficultyPreset.STANDARD,
    label: '标准',
    hint: '平衡：按近期表现做正常幅度动态调整。',
  },
  {
    value: GameDifficultyPreset.AGGRESSIVE,
    label: '激进',
    hint: '进攻：目标上调更积极，冲刺强度更高。',
  },
]

const scaleByPreset = (preset: GameDifficultyPreset, rawScale: number) => {
  if (preset === GameDifficultyPreset.CONSERVATIVE) {
    return rawScale >= 1 ? 1 + (rawScale - 1) * 0.6 : 1 - (1 - rawScale) * 0.6
  }
  if (preset === GameDifficultyPreset.AGGRESSIVE) {
    return rawScale >= 1 ? 1 + (rawScale - 1) * 1.3 : 1 - (1 - rawScale) * 1.15
  }
  return rawScale
}

const getPreviousDateKeys = (dateKey: string, days: number) => {
  const base = startOfDate(dateKey)
  return Array.from({ length: days }).map((_, index) =>
    toDateKey(new Date(base.getTime() - (index + 1) * DAY)),
  )
}

const clampTarget = (key: GameTaskKey, value: number) => {
  if (key === 'morning_new_content') return Math.min(220, Math.max(80, value))
  if (key === 'morning_reading_cycle') return Math.min(30, Math.max(10, value))
  if (key === 'afternoon_mixed_practice')
    return Math.min(24, Math.max(8, value))
  if (key === 'evening_feynman_diary') return Math.min(95, Math.max(55, value))
  if (key === 'next_morning_dictation')
    return Math.min(140, Math.max(50, value))
  return value
}

const isPreviousDate = (prev: string, current: string) => {
  const prevDate = startOfDate(prev)
  const currentDate = startOfDate(current)
  return currentDate.getTime() - prevDate.getTime() === DAY
}

const ensureProfile = async () => {
  return prisma.gameProfile.upsert({
    where: { id: PROFILE_ID },
    create: { id: PROFILE_ID },
    update: {},
  })
}

type DailyMetrics = {
  lessonUploads: number
  articleUploads: number
  quizUploads: number
  newQuestionSolved: number
  speakingMinutes: number
  readingMinutes: number
  effectiveReadingMinutes: number
  quizAttempts: number
  reviewCount: number
  mixedUnits: number
  outputWordCount: number
  outputScore: number
  hasOutputPractice: boolean
  nightReviewSignal: number
}

const getDailyMetrics = async (dateKey: string): Promise<DailyMetrics> => {
  const { start, end } = dateRangeOf(dateKey)

  const [
    lessonUploads,
    articleUploads,
    quizUploads,
    speakingRow,
    readingRow,
    quizAttempts,
    reviewCount,
    groupedAttempts,
    outputPractice,
  ] = await Promise.all([
    prisma.material.count({
      where: { type: MaterialType.LISTENING, createdAt: { gte: start, lt: end } },
    }),
    prisma.material.count({
      where: { type: MaterialType.READING, createdAt: { gte: start, lt: end } },
    }),
    prisma.material.count({
      where: {
        type: MaterialType.VOCAB_GRAMMAR,
        createdAt: { gte: start, lt: end },
      },
    }),
    prisma.studyTimeDaily.findUnique({
      where: {
        dateKey_kind: {
          dateKey,
          kind: StudyTimeKind.LESSON_SPEAKING,
        },
      },
      select: { seconds: true },
    }),
    prisma.studyTimeDaily.findUnique({
      where: {
        dateKey_kind: {
          dateKey,
          kind: StudyTimeKind.ARTICLE_READING,
        },
      },
      select: { seconds: true },
    }),
    prisma.questionAttempt.count({
      where: { createdAt: { gte: start, lt: end } },
    }),
    prisma.sentenceReview.count({
      where: {
        last_review: { gte: start, lt: end },
      },
    }),
    prisma.questionAttempt.groupBy({
      by: ['questionId'],
      where: { createdAt: { lt: end } },
      _min: { createdAt: true },
    }),
    prisma.outputPractice.findUnique({
      where: {
        profileId_dateKey_practiceType: {
          profileId: PROFILE_ID,
          dateKey,
          practiceType: 'WRITING',
        },
      },
      select: {
        wordCount: true,
        totalScore: true,
      },
    }),
  ])

  const newQuestionSolved = groupedAttempts.filter(item => {
    const first = item._min.createdAt
    return Boolean(first && first >= start && first < end)
  }).length

  const speakingMinutes =
    Math.round(((speakingRow?.seconds || 0) / 60) * 10) / 10
  const readingMinutes = Math.round(((readingRow?.seconds || 0) / 60) * 10) / 10
  const effectiveReadingMinutes =
    Math.round((speakingMinutes * 2 + readingMinutes) * 10) / 10
  const mixedUnits = reviewCount * 2 + quizAttempts
  const outputWordCount = outputPractice?.wordCount || 0
  const outputScore = outputPractice?.totalScore || 0
  const hasOutputPractice = outputWordCount > 0
  const nightReviewSignal =
    hasOutputPractice && (reviewCount > 0 || quizAttempts > 0) ? 1 : 0

  return {
    lessonUploads,
    articleUploads,
    quizUploads,
    newQuestionSolved,
    speakingMinutes,
    readingMinutes,
    effectiveReadingMinutes,
    quizAttempts,
    reviewCount,
    mixedUnits,
    outputWordCount,
    outputScore,
    hasOutputPractice,
    nightReviewSignal,
  }
}

const morningScore = (metrics: DailyMetrics) => {
  return (
    metrics.lessonUploads * 60 +
    metrics.articleUploads * 30 +
    metrics.quizUploads * 20 +
    metrics.newQuestionSolved * 15
  )
}

const resolveTaskCurrentValue = (
  key: GameTaskKey,
  metrics: DailyMetrics,
  diaryChars: number,
  recallChars: number,
) => {
  if (key === 'morning_new_content') return morningScore(metrics)
  if (key === 'morning_reading_cycle') return metrics.effectiveReadingMinutes
  if (key === 'afternoon_mixed_practice') return metrics.mixedUnits
  if (key === 'evening_feynman_diary') return metrics.outputScore
  if (key === 'night_light_review') return metrics.nightReviewSignal
  if (key === 'next_morning_dictation') return recallChars

  // 明确返回 0 可以避免新增任务被误作为 recallChar 任务。
  return 0
}

const resolveAdaptiveScale = (averageRatio: number) => {
  if (averageRatio >= 1.25) return 1.2
  if (averageRatio >= 1.05) return 1.1
  if (averageRatio <= 0.45) return 0.75
  if (averageRatio <= 0.7) return 0.85
  if (averageRatio <= 0.9) return 0.95
  return 1
}

const buildAdaptiveTaskDefs = async (
  dateKey: string,
  preset: GameDifficultyPreset,
): Promise<GameTaskDef[]> => {
  const defs = gameTaskDefs()
  const prevDateKeys = getPreviousDateKeys(dateKey, 7)

  const previousMetrics = await Promise.all(
    prevDateKeys.map(async key => {
      const [metrics, diary, recall] = await Promise.all([
        getDailyMetrics(key),
        prisma.learningDiary.findUnique({
          where: { dateKey: key },
          select: { content: true },
        }),
        prisma.morningRecall.findUnique({
          where: { dateKey: key },
          select: { content: true },
        }),
      ])
      return {
        key,
        metrics,
        diaryChars: (diary?.content || '').trim().length,
        recallChars: (recall?.content || '').trim().length,
      }
    }),
  )

  return defs.map(task => {
    if (!ADAPTIVE_TASK_KEYS.includes(task.key)) return task

    const ratios = previousMetrics
      .map(day => {
        const current = resolveTaskCurrentValue(
          task.key,
          day.metrics,
          day.diaryChars,
          day.recallChars,
        )
        return current / Math.max(1, task.targetValue)
      })
      .filter(value => Number.isFinite(value))

    if (ratios.length === 0) return task

    const averageRatio =
      ratios.reduce((sum, item) => sum + item, 0) / ratios.length
    const scale = scaleByPreset(preset, resolveAdaptiveScale(averageRatio))
    const adaptiveTarget = clampTarget(
      task.key,
      Math.round(task.targetValue * scale),
    )

    return {
      ...task,
      targetValue: adaptiveTarget,
    }
  })
}

const isTaskCompleted = (
  key: GameTaskKey,
  currentValue: number,
  targetValue: number,
) => {
  if (key === 'night_light_review') return currentValue >= 1
  return currentValue >= targetValue
}

const completeTaskIfNeeded = async (payload: {
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
  dateKey: string
  task: GameTaskDef
  done: boolean
}) => {
  const { tx, dateKey, task, done } = payload
  if (!done) return { gainedXp: 0, gainedCoins: 0 }

  const existed = await tx.gameSessionLog.findUnique({
    where: {
      profileId_dateKey_taskKey: {
        profileId: PROFILE_ID,
        dateKey,
        taskKey: task.key,
      },
    },
    select: { id: true },
  })

  if (existed) return { gainedXp: 0, gainedCoins: 0 }

  await tx.gameSessionLog.create({
    data: {
      profileId: PROFILE_ID,
      dateKey,
      taskKey: task.key,
      taskTitle: task.title,
      points: task.points,
      coins: task.coins,
      durationMin: Math.max(0, Math.round(task.targetValue)),
    },
  })

  return { gainedXp: task.points, gainedCoins: task.coins }
}

const syncProgressByData = async (dateKey: string, defs: GameTaskDef[]) => {
  const profile = await ensureProfile()
  const metrics = await getDailyMetrics(dateKey)
  const diary = await prisma.learningDiary.findUnique({ where: { dateKey } })
  const recall = await prisma.morningRecall.findUnique({ where: { dateKey } })

  const diaryChars = (diary?.content || '').trim().length
  const recallChars = (recall?.content || '').trim().length

  const completionMap = new Map<GameTaskKey, boolean>()
  defs.forEach(task => {
    const current = resolveTaskCurrentValue(
      task.key,
      metrics,
      diaryChars,
      recallChars,
    )
    const done = isTaskCompleted(task.key, current, task.targetValue)
    completionMap.set(task.key, done)
  })

  const result = await prisma.$transaction(async tx => {
    let gainedXp = 0
    let gainedCoins = 0

    for (const task of defs) {
      const add = await completeTaskIfNeeded({
        tx,
        dateKey,
        task,
        done: completionMap.get(task.key) || false,
      })
      gainedXp += add.gainedXp
      gainedCoins += add.gainedCoins
    }

    let nextXp = profile.xp
    let nextCoins = profile.coins
    let nextStreak = profile.streakDays
    let nextStreakDate = profile.lastStreakDate

    if (gainedXp > 0 || gainedCoins > 0) {
      nextXp += gainedXp
      nextCoins += gainedCoins
    }

    const dayDoneCount = await tx.gameSessionLog.count({
      where: {
        profileId: PROFILE_ID,
        dateKey,
        taskKey: { in: GAME_STREAK_TASK_KEYS },
      },
    })

    if (
      dayDoneCount === GAME_STREAK_TASK_KEYS.length &&
      profile.lastStreakDate !== dateKey
    ) {
      if (
        profile.lastStreakDate &&
        isPreviousDate(profile.lastStreakDate, dateKey)
      ) {
        nextStreak = profile.streakDays + 1
      } else {
        nextStreak = 1
      }
      nextStreakDate = dateKey
    }

    const levelState = levelByXp(nextXp)
    await tx.gameProfile.update({
      where: { id: PROFILE_ID },
      data: {
        xp: nextXp,
        coins: nextCoins,
        level: levelState.level,
        streakDays: nextStreak,
        lastStreakDate: nextStreakDate,
      },
    })

    return {
      levelState,
      nextXp,
      nextCoins,
      nextStreak,
    }
  })

  return {
    metrics,
    diary,
    recall,
    profile: {
      level: result.levelState.level,
      xp: result.nextXp,
      xpInLevel: result.levelState.xpInLevel,
      xpToNext: result.levelState.xpToNext,
      coins: result.nextCoins,
      streakDays: result.nextStreak,
      difficultyPreset: profile.difficultyPreset,
    },
  }
}

const getMixedPlan = async () => {
  const [topMaterials, dueRetryCount] = await Promise.all([
    getTopMaterialSnapshots(),
    prisma.questionRetry.count({ where: { dueAt: { lte: new Date() } } }),
  ])
  const { topLesson, topArticle, topQuiz } = topMaterials

  const plan: { title: string; href: string }[] = []
  if (dueRetryCount > 0) {
    plan.push({ title: `先做错题回流（${dueRetryCount}）`, href: '/review' })
  } else {
    plan.push({ title: '先做口语复习', href: '/review' })
  }
  if (topQuiz) {
    plan.push({
      title: `刷题：${topQuiz.title || '题库'}`,
      href: `/practice`,
    })
  }
  if (topLesson) {
    plan.push({
      title: `听力朗诵：${topLesson.title}`,
      href: `/shadowing/${topLesson.id}`,
    })
  } else if (topArticle) {
    plan.push({
      title: `阅读：${topArticle.title || '文章'}`,
      href: `/articles/${topArticle.id}`,
    })
  }
  return plan
}

const buildDashboard = async (dateKey: string): Promise<GameDashboard> => {
  const profile = await ensureProfile()
  const defs = await buildAdaptiveTaskDefs(dateKey, profile.difficultyPreset)
  const baseDefs = gameTaskDefs()
  const baseMap = new Map(baseDefs.map(item => [item.key, item.targetValue]))
  const synced = await syncProgressByData(dateKey, defs)
  const [logs, mixedPlan, todayPlan] = await Promise.all([
    prisma.gameSessionLog.findMany({
      where: {
        profileId: PROFILE_ID,
        dateKey,
        taskKey: { in: defs.map(item => item.key) },
      },
      select: {
        taskKey: true,
        completedAt: true,
        points: true,
        coins: true,
      },
    }),
    getMixedPlan(),
    getTodayStudyPlan(),
  ])

  const logMap = new Map(logs.map(item => [item.taskKey, item]))
  const diaryChars = (synced.diary?.content || '').trim().length
  const recallChars = (synced.recall?.content || '').trim().length

  const tasks: GameTaskView[] = defs.map(task => {
    const log = logMap.get(task.key)
    const currentValue = resolveTaskCurrentValue(
      task.key,
      synced.metrics,
      diaryChars,
      recallChars,
    )
    const progressPct = Math.min(
      100,
      Math.round((currentValue / Math.max(1, task.targetValue)) * 100),
    )
    return {
      ...task,
      done: Boolean(log),
      completedAt: log?.completedAt || null,
      currentValue,
      progressPct,
      baseTargetValue: baseMap.get(task.key) || task.targetValue,
      targetScalePct: Math.round(
        (task.targetValue /
          Math.max(1, baseMap.get(task.key) || task.targetValue)) *
          100,
      ),
    }
  })

  const doneCount = tasks.filter(task => task.done).length
  const totalPoints = defs.reduce((sum, task) => sum + task.points, 0)
  const earnedPoints = logs.reduce((sum, item) => sum + item.points, 0)
  const earnedCoins = logs.reduce((sum, item) => sum + item.coins, 0)

  const sourceDateKey = previousDateKey(dateKey)
  const [yesterdayDiary, yesterdayOutputPractice, outputPractice] =
    await Promise.all([
      prisma.learningDiary.findUnique({
        where: { dateKey: sourceDateKey },
        select: { content: true },
      }),
      prisma.outputPractice.findUnique({
        where: {
          profileId_dateKey_practiceType: {
            profileId: PROFILE_ID,
            dateKey: sourceDateKey,
            practiceType: 'WRITING',
          },
        },
        select: {
          totalScore: true,
          feedbackSummary: true,
          actionItems: true,
        },
      }),
      prisma.outputPractice.findUnique({
        where: {
          profileId_dateKey_practiceType: {
            profileId: PROFILE_ID,
            dateKey,
            practiceType: 'WRITING',
          },
        },
        select: {
          missionText: true,
          learnerText: true,
          aiFeedbackRaw: true,
          totalScore: true,
          comprehensibility: true,
          accuracy: true,
          complexity: true,
          taskCompletion: true,
          feedbackSummary: true,
          actionItems: true,
          updatedAt: true,
        },
      }),
    ])
  const fallbackPrompt =
    '请默写昨天学习的 3 个核心点，并写出 1 个你仍不确定的地方。'
  const promptBase = (yesterdayDiary?.content || '').trim().slice(0, 120)
  const recallPrompt = promptBase
    ? `根据你昨天的复述开头继续默写：${promptBase}`
    : fallbackPrompt
  const previousOutputActionItems = yesterdayOutputPractice?.actionItems
    ? (() => {
        try {
          return parseActionItems(
            JSON.parse(yesterdayOutputPractice.actionItems),
          )
        } catch {
          return []
        }
      })()
    : []
  const missionPromptTemplate = buildOutputMissionPromptTemplate(dateKey, {
    totalScore: yesterdayOutputPractice?.totalScore || 0,
    feedbackSummary: yesterdayOutputPractice?.feedbackSummary || '',
    actionItems: previousOutputActionItems,
  })
  const coachPromptTemplate = buildOutputCoachPromptTemplate()
  const recallCoachPromptTemplate = buildRecallCoachPromptTemplate()
  const outputActionItems = outputPractice?.actionItems
    ? (() => {
        try {
          return parseActionItems(JSON.parse(outputPractice.actionItems))
        } catch {
          return []
        }
      })()
    : []
  const recallActionItems = synced.recall?.actionItems
    ? (() => {
        try {
          return parseActionItems(JSON.parse(synced.recall.actionItems))
        } catch {
          return []
        }
      })()
    : []

  return {
    dateKey,
    profile: synced.profile,
    summary: {
      doneCount,
      totalCount: tasks.length,
      totalPoints,
      earnedPoints,
      earnedCoins,
    },
    metrics: synced.metrics,
    mixedPlan,
    diary: {
      content: synced.diary?.content || '',
      wordCount: synced.diary?.wordCount || 0,
    },
    recall: {
      sourceDateKey,
      prompt: synced.recall?.prompt || recallPrompt,
      content: synced.recall?.content || '',
      wordCount: synced.recall?.wordCount || 0,
      coachPromptTemplate: recallCoachPromptTemplate,
      aiFeedbackRaw: synced.recall?.aiFeedbackRaw || '',
      metrics: {
        totalScore: synced.recall?.totalScore || 0,
        accuracy: synced.recall?.accuracy || 0,
        coverage: synced.recall?.coverage || 0,
        clarity: synced.recall?.clarity || 0,
        feedbackSummary: synced.recall?.feedbackSummary || '',
        actionItems: recallActionItems,
        modelAnswer: synced.recall?.modelAnswer || '',
      },
    },
    output: {
      missionPromptTemplate,
      coachPromptTemplate,
      missionText: outputPractice?.missionText || '',
      learnerText: outputPractice?.learnerText || '',
      aiFeedbackRaw: outputPractice?.aiFeedbackRaw || '',
      metrics: {
        totalScore: outputPractice?.totalScore || 0,
        comprehensibility: outputPractice?.comprehensibility || 0,
        accuracy: outputPractice?.accuracy || 0,
        complexity: outputPractice?.complexity || 0,
        taskCompletion: outputPractice?.taskCompletion || 0,
        feedbackSummary: outputPractice?.feedbackSummary || '',
        actionItems: outputActionItems,
      },
      updatedAt: outputPractice?.updatedAt || null,
    },
    todayPlan: {
      tasks: todayPlan.tasks,
      startHref: todayPlan.startHref,
    },
    tasks,
  }
}

export async function getGameDashboard(
  dateKey?: string,
): Promise<GameDashboard> {
  const key = dateKey || toDateKey(new Date())
  return buildDashboard(key)
}

export async function getGameDifficultySettings() {
  const profile = await ensureProfile()
  return {
    current: profile.difficultyPreset,
    options: DIFFICULTY_OPTIONS,
  }
}

export async function updateGameDifficultyPreset(preset: GameDifficultyPreset) {
  if (!Object.values(GameDifficultyPreset).includes(preset)) {
    return { success: false, message: '难度档位无效' }
  }

  try {
    await prisma.gameProfile.upsert({
      where: { id: PROFILE_ID },
      create: {
        id: PROFILE_ID,
        difficultyPreset: preset,
      },
      update: {
        difficultyPreset: preset,
      },
    })

    revalidatePath('/game')
    revalidatePath('/today')
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '更新失败' }
  }
}

export async function getDiaryEntries(limit = 60): Promise<DiaryListEntry[]> {
  const safeLimit = Math.min(180, Math.max(1, limit))
  const [diaries, recalls] = await Promise.all([
    prisma.learningDiary.findMany({
      orderBy: { dateKey: 'desc' },
      take: safeLimit,
      select: {
        dateKey: true,
        wordCount: true,
        updatedAt: true,
      },
    }),
    prisma.morningRecall.findMany({
      orderBy: { dateKey: 'desc' },
      take: safeLimit,
      select: {
        dateKey: true,
        wordCount: true,
        updatedAt: true,
      },
    }),
  ])

  const map = new Map<string, DiaryListEntry>()
  diaries.forEach(item => {
    map.set(item.dateKey, {
      dateKey: item.dateKey,
      diaryWordCount: item.wordCount,
      recallWordCount: 0,
      diaryUpdatedAt: item.updatedAt,
      recallUpdatedAt: null,
    })
  })

  recalls.forEach(item => {
    const existed = map.get(item.dateKey)
    if (!existed) {
      map.set(item.dateKey, {
        dateKey: item.dateKey,
        diaryWordCount: 0,
        recallWordCount: item.wordCount,
        diaryUpdatedAt: null,
        recallUpdatedAt: item.updatedAt,
      })
      return
    }
    existed.recallWordCount = item.wordCount
    existed.recallUpdatedAt = item.updatedAt
  })

  return Array.from(map.values()).sort((a, b) =>
    b.dateKey.localeCompare(a.dateKey),
  )
}

export async function submitFeynmanDiary(content: string, dateKey?: string) {
  const key = dateKey || toDateKey(new Date())
  const normalized = (content || '').trim()
  if (normalized.length < 30) {
    return { success: false, message: '日记太短，至少写 30 字。' }
  }
  try {
    await prisma.learningDiary.upsert({
      where: { dateKey: key },
      create: {
        dateKey: key,
        content: normalized,
        wordCount: countChars(normalized),
      },
      update: {
        content: normalized,
        wordCount: countChars(normalized),
      },
    })

    revalidatePath('/game')
    revalidatePath('/game/diaries')
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '日记保存失败' }
  }
}

export async function submitOutputPracticeEvaluation(payload: {
  missionText: string
  learnerText: string
  aiFeedbackRaw: string
  languageCode?: string
  dateKey?: string
}) {
  const key = payload.dateKey || toDateKey(new Date())
  const missionText = (payload.missionText || '').trim()
  const learnerText = (payload.learnerText || '').trim()
  const aiFeedbackRaw = (payload.aiFeedbackRaw || '').trim()
  const languageCode =
    (payload.languageCode || 'ja').trim().toLowerCase() || 'ja'

  if (missionText.length < 10) {
    return { success: false, message: '请先粘贴 AI 生成的输出目标。' }
  }
  if (learnerText.length < 30) {
    return { success: false, message: '输出内容太短，至少写 30 字。' }
  }
  if (aiFeedbackRaw.length < 20) {
    return { success: false, message: '请先粘贴 AI 评改结果（JSON）。' }
  }

  const metrics = parseOutputAssessment(aiFeedbackRaw)
  const scoreVector = [
    metrics.totalScore,
    metrics.comprehensibility,
    metrics.accuracy,
    metrics.complexity,
    metrics.taskCompletion,
  ]
  const hasAnyScore = scoreVector.some(score => score > 0)
  if (!hasAnyScore) {
    return {
      success: false,
      message: '未识别到可量化分数。请让 AI 严格按 JSON 模板输出后再粘贴。',
    }
  }

  const previousOutput = await prisma.outputPractice.findUnique({
    where: {
      profileId_dateKey_practiceType: {
        profileId: PROFILE_ID,
        dateKey: previousDateKey(key),
        practiceType: 'WRITING',
      },
    },
    select: {
      totalScore: true,
      feedbackSummary: true,
      actionItems: true,
    },
  })
  const previousActionItems = previousOutput?.actionItems
    ? (() => {
        try {
          return parseActionItems(JSON.parse(previousOutput.actionItems))
        } catch {
          return []
        }
      })()
    : []
  const missionPrompt = buildOutputMissionPromptTemplate(key, {
    totalScore: previousOutput?.totalScore || 0,
    feedbackSummary: previousOutput?.feedbackSummary || '',
    actionItems: previousActionItems,
  })
  const aiCoachPrompt = buildOutputCoachPromptTemplate()
    .replace(OUTPUT_PLACEHOLDER_MISSION, missionText)
    .replace(OUTPUT_PLACEHOLDER_LEARNER, learnerText)
  const wordCount = countChars(learnerText)

  try {
    await prisma.outputPractice.upsert({
      where: {
        profileId_dateKey_practiceType: {
          profileId: PROFILE_ID,
          dateKey: key,
          practiceType: 'WRITING',
        },
      },
      create: {
        profileId: PROFILE_ID,
        dateKey: key,
        practiceType: 'WRITING',
        languageCode,
        missionPrompt,
        missionText,
        learnerText,
        aiCoachPrompt,
        aiFeedbackRaw,
        totalScore: metrics.totalScore,
        comprehensibility: metrics.comprehensibility,
        accuracy: metrics.accuracy,
        complexity: metrics.complexity,
        taskCompletion: metrics.taskCompletion,
        feedbackSummary: metrics.feedbackSummary || null,
        actionItems: JSON.stringify(metrics.actionItems),
        wordCount,
      },
      update: {
        languageCode,
        missionPrompt,
        missionText,
        learnerText,
        aiCoachPrompt,
        aiFeedbackRaw,
        totalScore: metrics.totalScore,
        comprehensibility: metrics.comprehensibility,
        accuracy: metrics.accuracy,
        complexity: metrics.complexity,
        taskCompletion: metrics.taskCompletion,
        feedbackSummary: metrics.feedbackSummary || null,
        actionItems: JSON.stringify(metrics.actionItems),
        wordCount,
      },
    })

    // 与原“费曼复述”保持兼容：输出内容直接作为当日日记来源。
    await prisma.learningDiary.upsert({
      where: { dateKey: key },
      create: {
        dateKey: key,
        content: learnerText,
        wordCount,
      },
      update: {
        content: learnerText,
        wordCount,
      },
    })

    revalidatePath('/game')
    revalidatePath('/game/diaries')
    revalidatePath('/today')
    revalidatePath('/')

    return {
      success: true,
      metrics: {
        ...metrics,
        wordCount,
      },
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '输出评估保存失败' }
  }
}

export async function submitMorningRecall(content: string, dateKey?: string) {
  const key = dateKey || toDateKey(new Date())
  const normalized = (content || '').trim()
  if (normalized.length < 20) {
    return { success: false, message: '默写太短，至少写 20 字。' }
  }

  try {
    const sourceDateKey = previousDateKey(key)
    const yesterdayDiary = await prisma.learningDiary.findUnique({
      where: { dateKey: sourceDateKey },
      select: { content: true },
    })

    const fallbackPrompt =
      '请默写昨天学习的 3 个核心点，并写出 1 个你仍不确定的地方。'
    const promptBase = (yesterdayDiary?.content || '').trim().slice(0, 120)
    const prompt = promptBase
      ? `根据你昨天的复述开头继续默写：${promptBase}`
      : fallbackPrompt

    await prisma.morningRecall.upsert({
      where: { dateKey: key },
      create: {
        dateKey: key,
        sourceDateKey,
        prompt,
        content: normalized,
        wordCount: countChars(normalized),
      },
      update: {
        prompt,
        content: normalized,
        wordCount: countChars(normalized),
      },
    })

    revalidatePath('/game')
    revalidatePath('/game/diaries')
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '默写保存失败' }
  }
}

export async function submitMorningRecallEvaluation(payload: {
  recallText: string
  aiFeedbackRaw: string
  dateKey?: string
}) {
  const key = payload.dateKey || toDateKey(new Date())
  const recallText = (payload.recallText || '').trim()
  const aiFeedbackRaw = (payload.aiFeedbackRaw || '').trim()

  if (recallText.length < 20) {
    return { success: false, message: '请先提交至少 20 字默写内容。' }
  }
  if (aiFeedbackRaw.length < 20) {
    return { success: false, message: '请先粘贴 AI 默写评改结果（JSON）。' }
  }

  const metrics = parseRecallAssessment(aiFeedbackRaw)
  const scoreVector = [
    metrics.totalScore,
    metrics.accuracy,
    metrics.coverage,
    metrics.clarity,
  ]
  if (!scoreVector.some(score => score > 0)) {
    return {
      success: false,
      message: '未识别到默写评分。请让 AI 严格按 JSON 模板输出后再粘贴。',
    }
  }

  try {
    const sourceDateKey = previousDateKey(key)
    const yesterdayDiary = await prisma.learningDiary.findUnique({
      where: { dateKey: sourceDateKey },
      select: { content: true },
    })
    const fallbackPrompt =
      '请默写昨天学习的 3 个核心点，并写出 1 个你仍不确定的地方。'
    const promptBase = (yesterdayDiary?.content || '').trim().slice(0, 120)
    const prompt = promptBase
      ? `根据你昨天的复述开头继续默写：${promptBase}`
      : fallbackPrompt
    const coachPrompt = buildRecallCoachPromptTemplate()
      .replace(RECALL_PLACEHOLDER_PROMPT, prompt)
      .replace(RECALL_PLACEHOLDER_TEXT, recallText)

    await prisma.morningRecall.upsert({
      where: { dateKey: key },
      create: {
        dateKey: key,
        sourceDateKey,
        prompt,
        content: recallText,
        wordCount: countChars(recallText),
        aiCoachPrompt: coachPrompt,
        aiFeedbackRaw,
        totalScore: metrics.totalScore,
        accuracy: metrics.accuracy,
        coverage: metrics.coverage,
        clarity: metrics.clarity,
        feedbackSummary: metrics.feedbackSummary || null,
        actionItems: JSON.stringify(metrics.actionItems),
        modelAnswer: metrics.modelAnswer || null,
      },
      update: {
        sourceDateKey,
        prompt,
        content: recallText,
        wordCount: countChars(recallText),
        aiCoachPrompt: coachPrompt,
        aiFeedbackRaw,
        totalScore: metrics.totalScore,
        accuracy: metrics.accuracy,
        coverage: metrics.coverage,
        clarity: metrics.clarity,
        feedbackSummary: metrics.feedbackSummary || null,
        actionItems: JSON.stringify(metrics.actionItems),
        modelAnswer: metrics.modelAnswer || null,
      },
    })

    revalidatePath('/game')
    revalidatePath('/game/diaries')
    revalidatePath('/today')
    revalidatePath('/')

    return { success: true, metrics }
  } catch (error) {
    console.error(error)
    return { success: false, message: '默写评估保存失败' }
  }
}

export async function completeNightReview(dateKey?: string) {
  const key = dateKey || toDateKey(new Date())
  const task = gameTaskDefs().find(item => item.key === 'night_light_review')
  if (!task) return { success: false, message: '任务不存在' }

  try {
    const profile = await ensureProfile()
    const result = await prisma.$transaction(async tx => {
      const existed = await tx.gameSessionLog.findUnique({
        where: {
          profileId_dateKey_taskKey: {
            profileId: PROFILE_ID,
            dateKey: key,
            taskKey: task.key,
          },
        },
      })
      if (existed) return { alreadyDone: true }

      await tx.gameSessionLog.create({
        data: {
          profileId: PROFILE_ID,
          dateKey: key,
          taskKey: task.key,
          taskTitle: task.title,
          points: task.points,
          coins: task.coins,
          durationMin: 30,
        },
      })

      const nextXp = profile.xp + task.points
      const nextCoins = profile.coins + task.coins
      const levelState = levelByXp(nextXp)

      const dayDoneCount = await tx.gameSessionLog.count({
        where: {
          profileId: PROFILE_ID,
          dateKey: key,
          taskKey: { in: GAME_STREAK_TASK_KEYS as unknown as string[] },
        },
      })

      let nextStreak = profile.streakDays
      let nextStreakDate = profile.lastStreakDate
      if (
        dayDoneCount === GAME_STREAK_TASK_KEYS.length &&
        profile.lastStreakDate !== key
      ) {
        if (
          profile.lastStreakDate &&
          isPreviousDate(profile.lastStreakDate, key)
        ) {
          nextStreak = profile.streakDays + 1
        } else {
          nextStreak = 1
        }
        nextStreakDate = key
      }

      await tx.gameProfile.update({
        where: { id: PROFILE_ID },
        data: {
          xp: nextXp,
          coins: nextCoins,
          level: levelState.level,
          streakDays: nextStreak,
          lastStreakDate: nextStreakDate,
        },
      })

      return {
        alreadyDone: false,
        gainedPoints: task.points,
        gainedCoins: task.coins,
      }
    })

    revalidatePath('/game')
    revalidatePath('/')

    if (result.alreadyDone) {
      return { success: true, alreadyDone: true }
    }
    return {
      success: true,
      alreadyDone: false,
      gainedPoints: result.gainedPoints,
      gainedCoins: result.gainedCoins,
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '睡前回顾记录失败' }
  }
}

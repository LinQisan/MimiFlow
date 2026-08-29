import type { ExamScoreType } from '@prisma/client'

export const JLPT_LEVELS = ['N1', 'N2', 'N3', 'N4', 'N5'] as const
export type JlptLevel = (typeof JLPT_LEVELS)[number]

// Official new-JLPT sessions. Only completed sessions are offered because this
// feature backfills scores from tests the learner has already taken.
export const JLPT_SESSIONS = [
  { date: '2026-07-05', year: 2026, round: 1, month: 7 },
  { date: '2025-12-07', year: 2025, round: 2, month: 12 },
  { date: '2025-07-06', year: 2025, round: 1, month: 7 },
  { date: '2024-12-01', year: 2024, round: 2, month: 12 },
  { date: '2024-07-07', year: 2024, round: 1, month: 7 },
  { date: '2023-12-03', year: 2023, round: 2, month: 12 },
  { date: '2023-07-02', year: 2023, round: 1, month: 7 },
  { date: '2022-12-04', year: 2022, round: 2, month: 12 },
  { date: '2022-07-03', year: 2022, round: 1, month: 7 },
  { date: '2021-12-05', year: 2021, round: 2, month: 12 },
  { date: '2021-07-04', year: 2021, round: 1, month: 7 },
  { date: '2020-12-06', year: 2020, round: 2, month: 12 },
  // 2020-07-05 was cancelled worldwide and is intentionally omitted.
  { date: '2019-12-01', year: 2019, round: 2, month: 12 },
  { date: '2019-07-07', year: 2019, round: 1, month: 7 },
  { date: '2018-12-02', year: 2018, round: 2, month: 12 },
  { date: '2018-07-01', year: 2018, round: 1, month: 7 },
  { date: '2017-12-03', year: 2017, round: 2, month: 12 },
  { date: '2017-07-02', year: 2017, round: 1, month: 7 },
  { date: '2016-12-04', year: 2016, round: 2, month: 12 },
  { date: '2016-07-03', year: 2016, round: 1, month: 7 },
  { date: '2015-12-06', year: 2015, round: 2, month: 12 },
  { date: '2015-07-05', year: 2015, round: 1, month: 7 },
  { date: '2014-12-07', year: 2014, round: 2, month: 12 },
  { date: '2014-07-06', year: 2014, round: 1, month: 7 },
  { date: '2013-12-01', year: 2013, round: 2, month: 12 },
  { date: '2013-07-07', year: 2013, round: 1, month: 7 },
  { date: '2012-12-02', year: 2012, round: 2, month: 12 },
  { date: '2012-07-01', year: 2012, round: 1, month: 7 },
  { date: '2011-12-04', year: 2011, round: 2, month: 12 },
  { date: '2011-07-03', year: 2011, round: 1, month: 7 },
  { date: '2010-12-05', year: 2010, round: 2, month: 12 },
  { date: '2010-07-04', year: 2010, round: 1, month: 7 },
] as const

export const isJlptSessionDate = (value: string) =>
  JLPT_SESSIONS.some(session => session.date === value)

export const formatJlptSession = (session: (typeof JLPT_SESSIONS)[number]) =>
  `${session.year}年 第${session.round}回（${session.month}月${Number(session.date.slice(8, 10))}日）`

export type ExamScoreRecordView = {
  id: string
  examType: ExamScoreType
  examDate: string
  level: string | null
  languageScore: number | null
  readingScore: number
  listeningScore: number
  totalScore: number
}

export const formatExamDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`))

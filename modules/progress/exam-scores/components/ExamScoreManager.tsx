'use client'

import { ExamScoreType } from '@prisma/client'
import { useMemo, useState, useTransition } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import DatePicker from '@/components/ui/DatePicker'
import { useDialog } from '@/context/DialogContext'
import { deleteExamScore, saveExamScore } from '../actions'
import {
  JLPT_LEVELS,
  JLPT_SESSIONS,
  formatExamDate,
  formatJlptSession,
  type ExamScoreRecordView,
  type JlptLevel,
} from '../domain'

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
const LABEL_CLASS = 'block text-xs font-semibold text-slate-600'

const toScore = (value: string) => {
  const score = Number(value)
  return Number.isFinite(score) ? Math.floor(score) : 0
}

export default function ExamScoreManager({
  initialRecords,
}: {
  initialRecords: ExamScoreRecordView[]
}) {
  const dialog = useDialog()
  const [records, setRecords] = useState(initialRecords)
  const [examType, setExamType] = useState<ExamScoreType>(ExamScoreType.JLPT)
  const [examDate, setExamDate] = useState<string>(JLPT_SESSIONS[0].date)
  const [level, setLevel] = useState<JlptLevel>('N1')
  const [languageScore, setLanguageScore] = useState('')
  const [readingScore, setReadingScore] = useState('')
  const [listeningScore, setListeningScore] = useState('')
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  const numericScores = useMemo(
    () => ({
      language: examType === ExamScoreType.JLPT ? toScore(languageScore) : 0,
      reading: toScore(readingScore),
      listening: toScore(listeningScore),
    }),
    [examType, languageScore, listeningScore, readingScore],
  )
  const totalScore =
    numericScores.language + numericScores.reading + numericScores.listening

  const resetForm = () => {
    setExamDate(examType === ExamScoreType.JLPT ? JLPT_SESSIONS[0].date : '')
    setLanguageScore('')
    setReadingScore('')
    setListeningScore('')
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('')
    startTransition(async () => {
      const common = {
        examDate,
        readingScore: numericScores.reading,
        listeningScore: numericScores.listening,
      }
      const result = await saveExamScore(
        examType === ExamScoreType.JLPT
          ? {
              ...common,
              examType: ExamScoreType.JLPT,
              level,
              languageScore: numericScores.language,
            }
          : { ...common, examType: ExamScoreType.TOEIC },
      )
      if (!result.success) {
        setStatus(result.message)
        return
      }
      setRecords(current => [result.record, ...current])
      resetForm()
      setStatus(result.message)
      dialog.toast(result.message, { tone: 'success' })
    })
  }

  const handleDelete = async (record: ExamScoreRecordView) => {
    const confirmed = await dialog.confirm(
      `确定删除 ${record.examType}${record.level ? ` ${record.level}` : ''} 的这条成绩吗？`,
      { title: '删除成绩记录', confirmText: '删除', danger: true },
    )
    if (!confirmed) return
    startTransition(async () => {
      const result = await deleteExamScore(record.id)
      if (!result.success) {
        dialog.toast(result.message, { tone: 'error' })
        return
      }
      setRecords(current => current.filter(item => item.id !== record.id))
      dialog.toast(result.message, { tone: 'success' })
    })
  }

  return (
    <div className='grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]'>
      <form
        onSubmit={handleSubmit}
        className='h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_48px_-38px_rgba(15,23,42,0.55)] lg:sticky lg:top-24'>
        <h2 className='text-lg font-bold text-slate-950'>补录考试成绩</h2>
        <p className='mt-1 text-xs leading-5 text-slate-500'>总分会根据分项自动计算。</p>

        <div className='mt-5 grid grid-cols-2 gap-2'>
          {[ExamScoreType.JLPT, ExamScoreType.TOEIC].map(type => (
            <button
              key={type}
              type='button'
              aria-pressed={examType === type}
              onClick={() => {
                setExamType(type)
                setExamDate(type === ExamScoreType.JLPT ? JLPT_SESSIONS[0].date : '')
                setStatus('')
              }}
              className={`h-10 rounded-lg border text-sm font-bold transition ${
                examType === type
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-400'
              }`}>
              {type}
            </button>
          ))}
        </div>

        <div className='mt-5 space-y-4'>
          {examType === ExamScoreType.JLPT ? (
            <label className={LABEL_CLASS}>
              官方考试场次
              <CustomSelect
                required
                value={examDate}
                onChange={event => setExamDate(event.target.value)}
                className={`mt-1.5 ${INPUT_CLASS}`}>
                {JLPT_SESSIONS.map(session => (
                  <option key={session.date} value={session.date}>
                    {formatJlptSession(session)}
                  </option>
                ))}
              </CustomSelect>
              <span className='mt-1.5 block text-[10px] leading-4 text-slate-400'>新制 JLPT（2010 年起）；2020 年 7 月全球停考，已排除。</span>
            </label>
          ) : (
            <label className={LABEL_CLASS}>
              考试日期
              <DatePicker
                required
                value={examDate}
                onChange={setExamDate}
                aria-label='考试日期'
                allowClear={false}
                className='mt-1.5'
              />
            </label>
          )}

          {examType === ExamScoreType.JLPT ? (
            <label className={LABEL_CLASS}>
              级别
              <CustomSelect
                value={level}
                onChange={event => setLevel(event.target.value as JlptLevel)}
                className={`mt-1.5 ${INPUT_CLASS}`}>
                {JLPT_LEVELS.map(item => <option key={item}>{item}</option>)}
              </CustomSelect>
            </label>
          ) : null}

          <div className={`grid gap-3 ${examType === ExamScoreType.JLPT ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {examType === ExamScoreType.JLPT ? (
              <label className={LABEL_CLASS}>
                语言知识
                <input required min={0} max={60} type='number' inputMode='numeric' value={languageScore} onChange={event => setLanguageScore(event.target.value)} className={`mt-1.5 ${INPUT_CLASS}`} />
                <span className='mt-1 block text-[10px] text-slate-400'>/ 60</span>
              </label>
            ) : null}
            <label className={LABEL_CLASS}>
              阅读
              <input required min={0} max={examType === ExamScoreType.JLPT ? 60 : 495} type='number' inputMode='numeric' value={readingScore} onChange={event => setReadingScore(event.target.value)} className={`mt-1.5 ${INPUT_CLASS}`} />
              <span className='mt-1 block text-[10px] text-slate-400'>/ {examType === ExamScoreType.JLPT ? 60 : 495}</span>
            </label>
            <label className={LABEL_CLASS}>
              听力
              <input required min={0} max={examType === ExamScoreType.JLPT ? 60 : 495} type='number' inputMode='numeric' value={listeningScore} onChange={event => setListeningScore(event.target.value)} className={`mt-1.5 ${INPUT_CLASS}`} />
              <span className='mt-1 block text-[10px] text-slate-400'>/ {examType === ExamScoreType.JLPT ? 60 : 495}</span>
            </label>
          </div>

          <div className='flex items-end justify-between border-y border-slate-100 py-3'>
            <span className='text-xs font-semibold text-slate-500'>总分</span>
            <span className='text-3xl font-black tabular-nums text-slate-950'>
              {totalScore}<small className='ml-1 text-xs font-semibold text-slate-400'>/ {examType === ExamScoreType.JLPT ? 180 : 990}</small>
            </span>
          </div>

        </div>

        <div className='mt-5 flex items-center justify-between gap-3'>
          <p aria-live='polite' className='text-xs font-semibold text-slate-500'>{status}</p>
          <button disabled={isPending} type='submit' className='h-10 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:bg-slate-300'>
            {isPending ? '保存中…' : '保存成绩'}
          </button>
        </div>
      </form>

      <section>
        <div className='mb-4 flex items-end justify-between gap-3 border-b border-slate-200 pb-3'>
          <div>
            <h2 className='text-lg font-bold text-slate-950'>历史成绩</h2>
            <p className='mt-1 text-xs text-slate-500'>按考试日期从新到旧排列</p>
          </div>
          <span className='text-xs font-semibold tabular-nums text-slate-500'>{records.length} 条</span>
        </div>

        {records.length === 0 ? (
          <p className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500'>还没有考试成绩记录。</p>
        ) : (
          <div className='space-y-3'>
            {records.map(record => {
              const maxScore = record.examType === ExamScoreType.JLPT ? 180 : 990
              return (
                <article key={record.id} className='rounded-2xl border border-slate-200 bg-white p-5'>
                  <div className='flex items-start justify-between gap-4'>
                    <div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white'>{record.examType}{record.level ? ` ${record.level}` : ''}</span>
                        <time className='text-xs font-semibold text-slate-500'>{formatExamDate(record.examDate)}</time>
                      </div>
                    </div>
                    <div className='text-right'>
                      <strong className='text-3xl font-black tabular-nums text-slate-950'>{record.totalScore}</strong>
                      <span className='text-xs font-semibold text-slate-400'> / {maxScore}</span>
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-2 ${record.examType === ExamScoreType.JLPT ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {record.languageScore != null ? <ScoreItem label='语言知识' value={record.languageScore} max={60} /> : null}
                    <ScoreItem label='阅读' value={record.readingScore} max={record.examType === ExamScoreType.JLPT ? 60 : 495} />
                    <ScoreItem label='听力' value={record.listeningScore} max={record.examType === ExamScoreType.JLPT ? 60 : 495} />
                  </div>

                  <div className='mt-4 flex justify-end border-t border-slate-100 pt-3'>
                    <button type='button' disabled={isPending} onClick={() => void handleDelete(record)} className='text-xs font-semibold text-slate-400 hover:text-rose-700 disabled:opacity-50'>删除记录</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function ScoreItem({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className='rounded-xl bg-slate-50 px-3 py-2.5'>
      <p className='text-[10px] font-semibold text-slate-400'>{label}</p>
      <p className='mt-1 text-lg font-black tabular-nums text-slate-900'>{value}<span className='ml-1 text-[10px] font-semibold text-slate-400'>/ {max}</span></p>
    </div>
  )
}

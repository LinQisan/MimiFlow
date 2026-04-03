'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  getGameDashboard,
  submitOutputPracticeEvaluation,
  submitMorningRecall,
  submitMorningRecallEvaluation,
  type GameDashboard,
  type GameTaskView,
} from '@/app/actions/game'
import { useDialog } from '@/context/DialogContext'

type Props = {
  initial: GameDashboard
}

const phaseLabelMap: Record<string, string> = {
  morning: '晨间',
  afternoon: '下午',
  evening: '傍晚',
  night: '睡前',
  nextMorning: '次日晨',
}

const modeLabelMap: Record<string, string> = {
  auto: '自动统计',
  input: '文本提交',
  manual: '自觉打卡',
}

type CoachJsonPreview = {
  modelEssay: string
  modelEssayHighlights: string[]
}

type RecallJsonPreview = {
  modelAnswer: string
}

export default function GameBoardClient({ initial }: Props) {
  const dialog = useDialog()
  const [data, setData] = useState(initial)
  const [recallInput, setRecallInput] = useState(initial.recall.content || '')
  const [outputMissionInput, setOutputMissionInput] = useState('')

  const [outputLearnerInput, setOutputLearnerInput] = useState(
    initial.output.learnerText || '',
  )
  const [outputFeedbackInput, setOutputFeedbackInput] = useState(
    initial.output.aiFeedbackRaw || '',
  )
  const [recallFeedbackInput, setRecallFeedbackInput] = useState(
    initial.recall.aiFeedbackRaw || '',
  )
  const [isPending, startTransition] = useTransition()

  const progress = useMemo(() => {
    if (data.summary.totalCount === 0) return 0
    return Math.round((data.summary.doneCount / data.summary.totalCount) * 100)
  }, [data.summary.doneCount, data.summary.totalCount])

  const refreshDashboard = async () => {
    const next = await getGameDashboard(data.dateKey)
    setData(next)
    setRecallInput(next.recall.content || '')
    setOutputMissionInput(next.output.missionText || '')
    setOutputLearnerInput(next.output.learnerText || '')
    setOutputFeedbackInput(next.output.aiFeedbackRaw || '')
    setRecallFeedbackInput(next.recall.aiFeedbackRaw || '')
  }

  const fillCoachPrompt = (
    template: string,
    missionText: string,
    learnerText: string,
  ) =>
    template
      .replace('{{MISSION_TEXT}}', missionText.trim())
      .replace('{{LEARNER_TEXT}}', learnerText.trim())

  const copyText = async (text: string, okText: string) => {
    try {
      await navigator.clipboard.writeText(text)
      dialog.toast(okText, { tone: 'success' })
    } catch {
      dialog.toast('复制失败，请手动复制。', { tone: 'error' })
    }
  }

  const handleSubmitOutput = () => {
    startTransition(async () => {
      const res = await submitOutputPracticeEvaluation({
        dateKey: data.dateKey,
        missionText: outputMissionInput,
        learnerText: outputLearnerInput,
        aiFeedbackRaw: outputFeedbackInput,
      })
      if (!res.success) {
        dialog.toast(res.message || '输出评估保存失败', { tone: 'error' })
        return
      }
      dialog.toast('输出评估已保存并自动计分', { tone: 'success' })
      await refreshDashboard()
    })
  }

  const handleSubmitRecall = () => {
    startTransition(async () => {
      const res = await submitMorningRecall(recallInput, data.dateKey)
      if (!res.success) {
        dialog.toast(res.message || '默写保存失败', { tone: 'error' })
        return
      }
      dialog.toast('次日默写已保存', { tone: 'success' })
      await refreshDashboard()
    })
  }

  const handleSubmitRecallEvaluation = () => {
    startTransition(async () => {
      const res = await submitMorningRecallEvaluation({
        dateKey: data.dateKey,
        recallText: recallInput,
        aiFeedbackRaw: recallFeedbackInput,
      })
      if (!res.success) {
        dialog.toast(res.message || '默写评估保存失败', { tone: 'error' })
        return
      }
      dialog.toast('默写评估已保存并自动计分', { tone: 'success' })
      await refreshDashboard()
    })
  }

  const fillRecallCoachPrompt = (
    template: string,
    prompt: string,
    recallText: string,
  ) =>
    template
      .replace('{{RECALL_PROMPT}}', prompt.trim())
      .replace('{{RECALL_TEXT}}', recallText.trim())
  useEffect(() => {
    setOutputMissionInput(initial.output.missionText || '')
  }, [initial.output.missionText])
  return (
    <main className='min-h-screen bg-gray-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <section className='border-b border-gray-200 pb-5'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-3xl font-black text-gray-900'>
                学习任务中心
              </h1>
              <p className='mt-2 text-sm text-gray-500'>
                系统自动安排任务并计分，你只需要开始学习。
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Link href='/game/diaries' className='ui-btn ui-btn-sm'>
                查看每日日记
              </Link>
              <Link href='/today' className='ui-btn ui-btn-sm'>
                打开今日任务
              </Link>
            </div>
          </div>
        </section>

        <section className='mt-4 grid grid-cols-2 gap-3 md:grid-cols-5'>
          <Stat label='等级' value={`Lv.${data.profile.level}`} />
          <Stat label='总经验' value={`${data.profile.xp}`} />
          <Stat label='距下级' value={`${data.profile.xpToNext} XP`} />
          <Stat label='金币' value={`${data.profile.coins}`} />
          <Stat label='连胜' value={`${data.profile.streakDays} 天`} />
        </section>

        <section className='mt-4 border-b border-gray-200 pb-5'>
          <div className='mb-2 flex items-center justify-between text-xs text-gray-500'>
            <span>
              今日进度 {data.summary.doneCount}/{data.summary.totalCount}
            </span>
            <span>{progress}%</span>
          </div>
          <div className='h-2 rounded-full bg-gray-100'>
            <div
              style={{ width: `${progress}%` }}
              className='h-full rounded-full bg-indigo-500 transition-all duration-300'
            />
          </div>
          <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500'>
            <span className='ui-tag ui-tag-info'>
              今日已得 {data.summary.earnedPoints} XP
            </span>
            <span className='ui-tag ui-tag-muted'>
              今日金币 {data.summary.earnedCoins}
            </span>
            <span className='ui-tag ui-tag-warn'>
              满额 {data.summary.totalPoints} XP
            </span>
          </div>
        </section>

        <section className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-3'>
          <MetricCard
            title='输入训练'
            lines={[
              `听力朗诵 ${data.metrics.speakingMinutes} 分钟`,
              `文章阅读 ${data.metrics.readingMinutes} 分钟`,
              `折算后 ${data.metrics.effectiveReadingMinutes} 分钟（口语×2）`,
            ]}
          />
          <MetricCard
            title='新内容'
            lines={[
              `上传听力 ${data.metrics.lessonUploads} 个`,
              `上传阅读/题库 ${data.metrics.articleUploads + data.metrics.quizUploads} 个`,
              `完成新题 ${data.metrics.newQuestionSolved} 题`,
            ]}
          />
          <MetricCard
            title='输出评改'
            lines={[
              `输出字数 ${data.metrics.outputWordCount} 字`,
              `AI 综合分 ${data.metrics.outputScore} 分`,
              '评分会自动计入今日进度',
            ]}
          />
        </section>

        <section className='mt-4 border-b border-gray-200 pb-4'>
          <h2 className='text-base font-bold text-gray-900'>学习闭环</h2>
          <p className='mt-1 text-xs text-gray-500'>
            输入 → 输出 → 复练 → 次日默写，全流程自动串联。
          </p>
        </section>

        <section id='today' className='mt-4 border-b border-gray-200 pb-4'>
          <h2 className='text-base font-bold text-gray-900'>推荐练习顺序</h2>
          <p className='mt-1 text-xs text-gray-500'>
            系统按“复习→刷题→听读”自动排序。
          </p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            {data.mixedPlan.map(item => (
              <Link
                key={`${item.href}-${item.title}`}
                href={item.href}
                className='ui-btn ui-btn-sm'>
                {item.title}
              </Link>
            ))}
          </div>
        </section>

        <section className='mt-4 border-b border-gray-200 pb-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h2 className='text-base font-bold text-gray-900'>今日任务</h2>
            <Link
              href={data.todayPlan.startHref}
              className='ui-btn ui-btn-sm ui-btn-primary'>
              一键开始
            </Link>
          </div>
          <div className='mt-2 grid grid-cols-1 gap-2 md:grid-cols-2'>
            {data.todayPlan.tasks.map((task, idx) => (
              <article
                key={`today-in-game-${task.id}`}
                className='border-b border-gray-200 bg-white px-3 py-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='ui-tag ui-tag-muted'>#{idx + 1}</span>
                      <h3 className='text-sm font-bold text-gray-900'>
                        {task.title}
                      </h3>
                      <span className='ui-tag ui-tag-info'>
                        {task.targetCount}
                        {task.unit}
                      </span>
                    </div>
                    <p className='mt-1 text-xs text-gray-500'>
                      {task.description}
                    </p>
                  </div>
                  {task.disabled ? (
                    <span className='ui-btn ui-btn-sm cursor-not-allowed opacity-50'>
                      不可执行
                    </span>
                  ) : (
                    <Link href={task.href} className='ui-btn ui-btn-sm'>
                      去执行
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className='mt-4 space-y-2'>
          {data.tasks.map((task, idx) => (
            <TaskCard
              key={task.key}
              task={task}
              index={idx}
              isPending={isPending}
              recallInput={recallInput}
              recallPrompt={data.recall.prompt}
              outputMissionPrompt={data.output.missionPromptTemplate}
              outputCoachPrompt={data.output.coachPromptTemplate}
              outputMetrics={data.output.metrics}
              outputMissionInput={outputMissionInput}
              outputLearnerInput={outputLearnerInput}
              outputFeedbackInput={outputFeedbackInput}
              onOutputMissionChange={setOutputMissionInput}
              onOutputLearnerChange={setOutputLearnerInput}
              onOutputFeedbackChange={setOutputFeedbackInput}
              onCopyOutputMissionPrompt={() =>
                copyText(
                  data.output.missionPromptTemplate,
                  '已复制：输出目标生成提示词',
                )
              }
              onCopyOutputCoachPrompt={() =>
                outputMissionInput.trim() && outputLearnerInput.trim()
                  ? copyText(
                      fillCoachPrompt(
                        data.output.coachPromptTemplate,
                        outputMissionInput,
                        outputLearnerInput,
                      ),
                      '已复制：输出评改提示词',
                    )
                  : dialog.toast(
                      '请先填写“输出目标”和“作文内容”后再复制评改提示词。',
                      {
                        tone: 'info',
                      },
                    )
              }
              onSubmitOutput={handleSubmitOutput}
              onRecallChange={setRecallInput}
              onSubmitRecall={handleSubmitRecall}
              recallFeedbackInput={recallFeedbackInput}
              recallMetrics={data.recall.metrics}
              recallCoachPrompt={data.recall.coachPromptTemplate}
              onRecallFeedbackChange={setRecallFeedbackInput}
              onCopyRecallCoachPrompt={() =>
                recallInput.trim()
                  ? copyText(
                      fillRecallCoachPrompt(
                        data.recall.coachPromptTemplate,
                        data.recall.prompt,
                        recallInput,
                      ),
                      '已复制：默写评改提示词',
                    )
                  : dialog.toast('请先填写默写内容后再复制评改提示词。', {
                      tone: 'info',
                    })
              }
              onSubmitRecallEvaluation={handleSubmitRecallEvaluation}
            />
          ))}
        </section>
      </div>
    </main>
  )
}

function TaskCard({
  task,
  index,
  isPending,
  recallInput,
  recallPrompt,
  outputMissionPrompt,
  outputCoachPrompt,
  outputMetrics,
  outputMissionInput,
  outputLearnerInput,
  outputFeedbackInput,
  onOutputMissionChange,
  onOutputLearnerChange,
  onOutputFeedbackChange,
  onCopyOutputMissionPrompt,
  onCopyOutputCoachPrompt,
  onSubmitOutput,
  onRecallChange,
  onSubmitRecall,
  recallFeedbackInput,
  recallMetrics,
  recallCoachPrompt,
  onRecallFeedbackChange,
  onCopyRecallCoachPrompt,
  onSubmitRecallEvaluation,
}: {
  task: GameTaskView
  index: number
  isPending: boolean
  recallInput: string
  recallPrompt: string
  outputMissionPrompt: string
  outputCoachPrompt: string
  outputMetrics: GameDashboard['output']['metrics']
  outputMissionInput: string
  outputLearnerInput: string
  outputFeedbackInput: string
  onOutputMissionChange: (value: string) => void
  onOutputLearnerChange: (value: string) => void
  onOutputFeedbackChange: (value: string) => void
  onCopyOutputMissionPrompt: () => void
  onCopyOutputCoachPrompt: () => void
  onSubmitOutput: () => void
  onRecallChange: (value: string) => void
  onSubmitRecall: () => void
  recallFeedbackInput: string
  recallMetrics: GameDashboard['recall']['metrics']
  recallCoachPrompt: string
  onRecallFeedbackChange: (value: string) => void
  onCopyRecallCoachPrompt: () => void
  onSubmitRecallEvaluation: () => void
}) {
  const coachPreview = useMemo<CoachJsonPreview>(() => {
    const source = (outputFeedbackInput || '').trim()
    if (!source) return { modelEssay: '', modelEssayHighlights: [] }
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    const firstJson = fenced || source.match(/\{[\s\S]*\}/)?.[0] || ''
    if (!firstJson) return { modelEssay: '', modelEssayHighlights: [] }

    try {
      const parsed = JSON.parse(firstJson) as {
        modelEssay?: unknown
        modelEssayHighlights?: unknown
      }
      const modelEssay = String(parsed.modelEssay || '').trim()
      const modelEssayHighlights = Array.isArray(parsed.modelEssayHighlights)
        ? parsed.modelEssayHighlights
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 3)
        : []
      return { modelEssay, modelEssayHighlights }
    } catch {
      return { modelEssay: '', modelEssayHighlights: [] }
    }
  }, [outputFeedbackInput])
  const recallPreview = useMemo<RecallJsonPreview>(() => {
    const source = (recallFeedbackInput || '').trim()
    if (!source) return { modelAnswer: '' }
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    const firstJson = fenced || source.match(/\{[\s\S]*\}/)?.[0] || ''
    if (!firstJson) return { modelAnswer: '' }
    try {
      const parsed = JSON.parse(firstJson) as {
        modelAnswer?: unknown
        referenceAnswer?: unknown
      }
      return {
        modelAnswer: String(
          parsed.modelAnswer || parsed.referenceAnswer || '',
        ).trim(),
      }
    } catch {
      return { modelAnswer: '' }
    }
  }, [recallFeedbackInput])

  return (
    <article className='border-b border-gray-200 bg-white px-3 py-3 md:px-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='ui-tag ui-tag-muted'>#{index + 1}</span>
            <span className='ui-tag ui-tag-info'>
              {phaseLabelMap[task.phase] || task.phase}
            </span>
            <span className='ui-tag ui-tag-muted'>
              {modeLabelMap[task.mode]}
            </span>
            <h2 className='text-base font-bold text-gray-900'>{task.title}</h2>
          </div>
          <p className='mt-1 text-sm text-gray-600'>{task.description}</p>
          <p className='mt-1 text-xs text-gray-500'>{task.tip}</p>
          <div className='mt-2 flex flex-wrap items-center gap-2 text-xs'>
            <span className='ui-tag ui-tag-warn'>+{task.points} XP</span>
            <span className='ui-tag ui-tag-muted'>+{task.coins} 金币</span>
            <span className='ui-tag ui-tag-info'>
              进度 {task.currentValue}/{task.targetValue} {task.unit}
            </span>
            {task.targetScalePct !== 100 && (
              <span className='ui-tag ui-tag-muted'>
                动态目标 {task.targetScalePct > 100 ? '上调' : '下调'}至{' '}
                {task.targetScalePct}%
              </span>
            )}
            {task.done && <span className='ui-tag ui-tag-success'>已完成</span>}
          </div>
          <div className='mt-2 h-1.5 rounded-full bg-gray-100'>
            <div
              style={{ width: `${task.progressPct}%` }}
              className='h-full rounded-full bg-indigo-500/85'
            />
          </div>

          {task.key === 'evening_feynman_diary' && (
            <div className='mt-3 space-y-2'>
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={onCopyOutputMissionPrompt}
                  className='ui-btn ui-btn-sm'>
                  复制提示词①（出题）
                </button>
                <button
                  type='button'
                  onClick={onCopyOutputCoachPrompt}
                  className='ui-btn ui-btn-sm'>
                  复制提示词②（评改）
                </button>
              </div>
              <p className='text-xs text-gray-500'>
                步骤：先让 AI 出题并完成作文，再粘贴到评改提示词。
              </p>
              <textarea
                value={outputMissionInput}
                onChange={event =>
                  onOutputMissionChange(event.currentTarget.value)
                }
                rows={3}
                placeholder='粘贴 AI 给你的输出目标（任务标题、写作目标、必须使用结构、提交要求）。'
                className='w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
              />
              <textarea
                value={outputLearnerInput}
                onChange={event =>
                  onOutputLearnerChange(event.currentTarget.value)
                }
                rows={6}
                placeholder='粘贴你完成的作文内容。'
                className='w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
              />
              <textarea
                value={outputFeedbackInput}
                onChange={event =>
                  onOutputFeedbackChange(event.currentTarget.value)
                }
                rows={6}
                placeholder='粘贴 AI 返回的 JSON（含评分、建议、lineEdits、modelEssay、modelEssayHighlights）。'
                className='w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
              />
              <div className='flex flex-wrap items-center gap-2 text-xs'>
                <span className='ui-tag ui-tag-info'>
                  当前综合分 {outputMetrics.totalScore}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  可理解度 {outputMetrics.comprehensibility}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  准确度 {outputMetrics.accuracy}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  复杂度 {outputMetrics.complexity}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  完成度 {outputMetrics.taskCompletion}
                </span>
              </div>
              {outputMetrics.feedbackSummary && (
                <p className='text-xs text-gray-600'>
                  {outputMetrics.feedbackSummary}
                </p>
              )}
              {outputMetrics.actionItems.length > 0 && (
                <ul className='space-y-1 text-xs text-gray-600'>
                  {outputMetrics.actionItems
                    .slice(0, 3)
                    .map((item, itemIndex) => (
                      <li key={`output-action-${itemIndex}`}>- {item}</li>
                    ))}
                </ul>
              )}
              {coachPreview.modelEssay && (
                <section className='rounded-xl border border-indigo-100 bg-indigo-50/55 px-3 py-3'>
                  <p className='text-xs font-bold text-indigo-700'>
                    AI 范文（i+1）
                  </p>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800'>
                    {coachPreview.modelEssay}
                  </p>
                  {coachPreview.modelEssayHighlights.length > 0 && (
                    <div className='mt-2 space-y-1'>
                      {coachPreview.modelEssayHighlights.map(
                        (item, itemIndex) => (
                          <p
                            key={`coach-highlight-${itemIndex}`}
                            className='text-xs text-indigo-700/90'>
                            {item}
                          </p>
                        ),
                      )}
                    </div>
                  )}
                </section>
              )}
              <details className='rounded-lg border border-gray-200 bg-gray-50 px-3 py-2'>
                <summary className='cursor-pointer text-xs font-semibold text-gray-600'>
                  查看提示词模板
                </summary>
                <div className='mt-2 space-y-2'>
                  <pre className='overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600'>
                    {outputMissionPrompt}
                  </pre>
                  <pre className='overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600'>
                    {outputCoachPrompt}
                  </pre>
                </div>
              </details>
              <button
                type='button'
                onClick={onSubmitOutput}
                disabled={isPending}
                className='ui-btn ui-btn-sm ui-btn-primary'>
                保存输出评估并结算
              </button>
            </div>
          )}

          {task.key === 'next_morning_dictation' && (
            <div className='mt-3 space-y-2'>
              <p className='text-xs text-gray-500'>系统提示：{recallPrompt}</p>
              <textarea
                value={recallInput}
                onChange={event => onRecallChange(event.currentTarget.value)}
                rows={4}
                placeholder='请在不看资料的情况下默写，再自行对照检查。'
                className='w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
              />
              <div className='flex flex-wrap gap-2'>
                <button
                  type='button'
                  onClick={onSubmitRecall}
                  disabled={isPending}
                  className='ui-btn ui-btn-sm ui-btn-primary'>
                  保存默写
                </button>
                <button
                  type='button'
                  onClick={onCopyRecallCoachPrompt}
                  className='ui-btn ui-btn-sm'>
                  复制提示词（默写评改）
                </button>
              </div>
              <textarea
                value={recallFeedbackInput}
                onChange={event =>
                  onRecallFeedbackChange(event.currentTarget.value)
                }
                rows={5}
                placeholder='粘贴 AI 返回的默写评改 JSON（含 accuracy/coverage/clarity/totalScore/actionItems/modelAnswer）。'
                className='w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
              />
              <div className='flex flex-wrap items-center gap-2 text-xs'>
                <span className='ui-tag ui-tag-info'>
                  综合分 {recallMetrics.totalScore}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  准确度 {recallMetrics.accuracy}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  覆盖度 {recallMetrics.coverage}
                </span>
                <span className='ui-tag ui-tag-muted'>
                  清晰度 {recallMetrics.clarity}
                </span>
              </div>
              {recallMetrics.feedbackSummary && (
                <p className='text-xs text-gray-600'>
                  {recallMetrics.feedbackSummary}
                </p>
              )}
              {recallMetrics.actionItems.length > 0 && (
                <ul className='space-y-1 text-xs text-gray-600'>
                  {recallMetrics.actionItems
                    .slice(0, 3)
                    .map((item, itemIndex) => (
                      <li key={`recall-action-${itemIndex}`}>- {item}</li>
                    ))}
                </ul>
              )}
              {(recallPreview.modelAnswer || recallMetrics.modelAnswer) && (
                <section className='rounded-xl border border-indigo-100 bg-indigo-50/55 px-3 py-3'>
                  <p className='text-xs font-bold text-indigo-700'>
                    默写参考答案
                  </p>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800'>
                    {recallPreview.modelAnswer || recallMetrics.modelAnswer}
                  </p>
                </section>
              )}
              <details className='rounded-lg border border-gray-200 bg-gray-50 px-3 py-2'>
                <summary className='cursor-pointer text-xs font-semibold text-gray-600'>
                  查看默写评改提示词模板
                </summary>
                <pre className='mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600'>
                  {recallCoachPrompt}
                </pre>
              </details>
              <button
                type='button'
                onClick={onSubmitRecallEvaluation}
                disabled={isPending}
                className='ui-btn ui-btn-sm ui-btn-primary'>
                保存默写评估并结算
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='border border-gray-200 bg-white px-3 py-2'>
      <p className='text-xs text-gray-500'>{label}</p>
      <p className='mt-1 text-lg font-black text-gray-900'>{value}</p>
    </div>
  )
}

function MetricCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className='border border-gray-200 bg-white px-3 py-3'>
      <h3 className='text-sm font-bold text-gray-900'>{title}</h3>
      <div className='mt-2 space-y-1'>
        {lines.map(line => (
          <p key={`${title}-${line}`} className='text-xs text-gray-600'>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

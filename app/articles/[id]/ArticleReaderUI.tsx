// app/articles/[id]/ArticleReaderUI.tsx
'use client'

import React, { useMemo, useState, useEffect, useRef } from 'react'
import QuizEngineUI from '@/app/quizzes/QuizEngineUI'
import VocabularyTooltip, {
  TooltipSaveState,
} from '@/components/VocabularyTooltip'
import ToggleSwitch from '@/components/ToggleSwitch'
import WordMetaPanel from '@/components/WordMetaPanel'
import { saveVocabulary } from '@/app/actions/content'
import {
  annotateJapaneseHtml,
  hasJapanese,
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'

const MOBILE_COLLAPSED_HEIGHT = 72
const MOBILE_MIN_PANEL_HEIGHT = 22
const MOBILE_MAX_PANEL_HEIGHT = 82

type ArticleQuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type ArticleQuestion = {
  id: string
  questionType: string
  prompt?: string | null
  contextSentence: string
  options: ArticleQuestionOption[]
}

type ArticleData = {
  id: string
  title: string
  content: string
  category?: { name: string } | null
  questions: ArticleQuestion[]
}

type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

const splitListInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

export default function ArticleReaderUI({
  article,
  pronunciationMap,
  vocabularyMetaMap,
}: {
  article: ArticleData
  pronunciationMap: Record<string, string>
  vocabularyMetaMap: Record<string, VocabularyMeta>
}) {
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const [localPronunciationMap, setLocalPronunciationMap] = useState(pronunciationMap)
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] = useState(vocabularyMetaMap)
  const articleWordEntries = useMemo(
    () =>
      Object.entries(localVocabularyMetaMap)
        .filter(([word, meta]) => {
          if (!article.content.includes(word)) return false
          if (showPronunciation && meta.pronunciations.length > 0) return true
          if (showMeaning && meta.meanings.length > 0) return true
          return false
        })
        .sort((a, b) => b[0].length - a[0].length)
        .slice(0, 24),
    [localVocabularyMetaMap, article.content, showPronunciation, showMeaning],
  )
  const quizVocabularyMetaMapByQuestion = useMemo(
    () =>
      article.questions.reduce<
        Record<string, Record<string, VocabularyMeta>>
      >((acc, question) => {
        const entries = Object.entries(localVocabularyMetaMap).filter(([word]) =>
          question.contextSentence.includes(word),
        )
        if (entries.length === 0) return acc
        acc[question.id] = entries.reduce<Record<string, VocabularyMeta>>(
          (qAcc, [word, meta]) => {
            qAcc[word] = meta
            return qAcc
          },
          {},
        )
        return acc
      }, {}),
    [article.questions, localVocabularyMetaMap],
  )
  const hasQuestions = article.questions && article.questions.length > 0
  const [isQuizFinished, setIsQuizFinished] = useState(false)
  const [currentAnswers, setCurrentAnswers] = useState<
    Record<string, string | null>
  >({}) // 🌟 新增：记录实时答题状态
  const [gradedMap, setGradedMap] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      setIsPanelCollapsed(false)
      return
    }
    setBottomPanelHeight(prev =>
      Math.min(MOBILE_MAX_PANEL_HEIGHT, Math.max(MOBILE_MIN_PANEL_HEIGHT, prev)),
    )
  }, [isMobile])
  // ================= 🌟 1. 左侧文章原生划词逻辑 =================
  const [activeTooltip, setActiveTooltip] = useState<{
    word: string
    x: number
    y: number
    isTop: boolean
    contextSentence: string
    questionId: string
  } | null>(null)

  const [saveState, setSaveState] = useState<TooltipSaveState>('idle')
  const [saveWithPronunciation, setSaveWithPronunciation] = useState(false)
  const [saveWithMeaning, setSaveWithMeaning] = useState(false)
  const [tooltipPronunciation, setTooltipPronunciation] = useState('')
  const [tooltipPartOfSpeech, setTooltipPartOfSpeech] = useState('')
  const [tooltipMeaning, setTooltipMeaning] = useState('')

  // 分屏高度控制 (用于移动端与 PC 端的可拖拽边界)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(52) // 百分比 (dvh)
  const [isDragging, setIsDragging] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const dragHandleRef = useRef<HTMLDivElement>(null)

  // ================= 拖拽分屏逻辑 =================
  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDragging(true)
    if (isPanelCollapsed) setIsPanelCollapsed(false)
  }

  useEffect(() => {
    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      // 统一处理鼠标和触摸事件获取 Y 坐标
      let clientY = 0
      if ('touches' in e) {
        clientY = e.touches[0].clientY
      } else {
        clientY = (e as MouseEvent).clientY
      }

      const windowHeight = window.innerHeight
      // 计算底部面板应该占据的百分比：(总高度 - 当前Y坐标) / 总高度 * 100
      let newHeightPercent = ((windowHeight - clientY) / windowHeight) * 100

      // 限制拖拽范围，避免题区过高/过低挤压阅读区
      if (newHeightPercent < MOBILE_MIN_PANEL_HEIGHT)
        newHeightPercent = MOBILE_MIN_PANEL_HEIGHT
      if (newHeightPercent > MOBILE_MAX_PANEL_HEIGHT)
        newHeightPercent = MOBILE_MAX_PANEL_HEIGHT

      setBottomPanelHeight(newHeightPercent)
    }

    const stopDrag = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('touchmove', handleDrag, { passive: false })
      window.addEventListener('mouseup', stopDrag)
      window.addEventListener('touchend', stopDrag)
    }

    return () => {
      window.removeEventListener('mousemove', handleDrag)
      window.removeEventListener('touchmove', handleDrag)
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('touchend', stopDrag)
    }
  }, [isDragging])

  useEffect(() => {
    const hideTooltip = () => setActiveTooltip(null)
    window.addEventListener('scroll', hideTooltip, { passive: true })
    window.addEventListener('resize', hideTooltip)
    return () => {
      window.removeEventListener('scroll', hideTooltip)
      window.removeEventListener('resize', hideTooltip)
    }
  }, [])

  // ================= 🌟 划词寻源魔法 =================
  const handleTextSelection = () => {
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (!selection || !text || text.length === 0 || text.length > 25) {
        if (!text) setActiveTooltip(null)
        return
      }

      if (!selection.rangeCount) return
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      let y = rect.top - 10
      let isTop = true
      if (isMobile || rect.top < 60) {
        y = rect.bottom + 10
        isTop = false
      }

      // 🌟 核心修复：坚决不使用被 ( 1 ) 污染的网页 DOM 文本！
      // 直接回溯到最纯净的数据库原文 (article.content) 中寻找这句话。
      let pureContextSentence = text // 兜底文本

      if (article.content) {
        // 1. 获取用户划词周边的一点点上下文，用来做精准定位锚点
        const domContext = selection.anchorNode?.textContent?.trim() || text

        // 2. 将整篇纯净原文按句号切分成数组（保留句号）
        const rawSentences = article.content
          .replace(/([。！？\n])/g, '$1|')
          .split('|')
          .map((s: string) => s.trim())
          .filter(Boolean)

        // 3. 寻的导弹：寻找既包含“选中的词”，又和“鼠标周边文本”吻合的那句纯净原句！
        const exactMatch = rawSentences.find(
          (s: string) =>
            s.includes(text) &&
            (s.includes(domContext) ||
              domContext.includes(s) ||
              s.includes(domContext.substring(0, 5))),
        )

        // 4. 赋值：如果找不到完美匹配，就找第一句包含这个词的话
        pureContextSentence =
          exactMatch ||
          rawSentences.find((s: string) => s.includes(text)) ||
          text
      }

      setActiveTooltip({
        word: text,
        x,
        y,
        isTop,
        questionId: article.id,
        contextSentence: pureContextSentence, // 🌟 把洗得干干净净的句子传给生词本！
      })
      const existingMeta = localVocabularyMetaMap[text]
      const pronList = existingMeta?.pronunciations || []
      const partOfSpeechList = existingMeta?.partsOfSpeech || []
      const meaningList = existingMeta?.meanings || []
      setTooltipPronunciation(pronList.join('\n'))
      setTooltipPartOfSpeech(partOfSpeechList.join('\n'))
      setTooltipMeaning(meaningList.join('\n'))
      setSaveWithPronunciation(hasJapanese(text))
      setSaveWithMeaning(true)
      setSaveState('idle')
    }, 50)
  }

  const handleSaveWord = async (word: string) => {
    if (!activeTooltip) return
    setSaveState('saving')
    const pronunciationList = splitListInput(tooltipPronunciation)
    const partOfSpeechList = splitListInput(tooltipPartOfSpeech)
    const meaningList = splitListInput(tooltipMeaning)
    const firstPron = pronunciationList[0]
    // 保存来源标记为 ARTICLE
    const res = await saveVocabulary(
      word,
      activeTooltip.contextSentence,
      'ARTICLE_TEXT',
      article.id,
      saveWithPronunciation ? firstPron : undefined,
      saveWithPronunciation ? pronunciationList : [],
      saveWithMeaning ? meaningList : [],
      partOfSpeechList[0],
      partOfSpeechList,
    )
    if (!res.success && res.state === 'already_exists') {
      const existingMeta = localVocabularyMetaMap[word] || {
        pronunciations: [],
        partsOfSpeech: [],
        meanings: [],
      }
      if (saveWithPronunciation && firstPron) {
        setLocalPronunciationMap(prev => ({ ...prev, [word]: firstPron }))
      }
      if (saveWithPronunciation || saveWithMeaning) {
        setLocalVocabularyMetaMap(prev => ({
          ...prev,
          [word]: {
            pronunciations: saveWithPronunciation
              ? pronunciationList
              : existingMeta.pronunciations,
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: saveWithMeaning ? meaningList : existingMeta.meanings,
          },
        }))
      }
      setSaveState('already_exists')
      setTimeout(() => setActiveTooltip(null), 1500)
    } else if (res.success) {
      const existingMeta = localVocabularyMetaMap[word] || {
        pronunciations: [],
        partsOfSpeech: [],
        meanings: [],
      }
      if (saveWithPronunciation && firstPron) {
        setLocalPronunciationMap(prev => ({
          ...prev,
          [word]: firstPron,
        }))
      }
      setLocalVocabularyMetaMap(prev => ({
        ...prev,
        [word]: {
          pronunciations: saveWithPronunciation
            ? pronunciationList
            : existingMeta.pronunciations,
          partsOfSpeech:
            partOfSpeechList.length > 0
              ? partOfSpeechList
              : existingMeta.partsOfSpeech,
          meanings: saveWithMeaning ? meaningList : existingMeta.meanings,
        },
      }))
      setSaveState('success')
      setTimeout(() => setActiveTooltip(null), 1500)
    } else {
      setSaveState('error')
    }
  }

  // ================= 🌟 2. 文章主体内容渲染器 =================
  const ArticleContent = () => {
    let htmlContent = article.content || ''
    let counter = 1

    if (hasQuestions) {
      article.questions.forEach(q => {
        const correctOption = q.options?.find(opt => opt.isCorrect)
        const anchorSentence = q.contextSentence || q.prompt || ''

        if (
          correctOption &&
          correctOption.text &&
          anchorSentence &&
          htmlContent.includes(anchorSentence)
        ) {
          const isThisQuestionGraded = isQuizFinished || gradedMap[q.id]
          if (
            correctOption &&
            correctOption.text &&
            anchorSentence &&
            htmlContent.includes(anchorSentence)
          ) {
            let processedSentence = anchorSentence

            if (!isThisQuestionGraded) {
              // 【没批改时】：显示用户的动态填词，或者灰色留空
              const selectedOptId = currentAnswers[q.id]
              const selectedOpt = q.options?.find(o => o.id === selectedOptId)

              if (selectedOpt) {
                const filledHtml = `<span class="inline-block px-2 py-0 mx-1 bg-indigo-50 border-b-2 border-indigo-500 text-indigo-700 font-bold rounded-t-sm transition-all duration-300">${selectedOpt.text}</span>`
                processedSentence = anchorSentence.replace(
                  correctOption.text,
                  filledHtml,
                )
              } else {
                const blankHtml = `<span class="inline-block px-4 py-0.5 mx-1 bg-gray-100 border-b-2 border-gray-400 text-gray-500 font-bold rounded-t-md select-none tracking-widest">( ${counter} )</span>`
                processedSentence = anchorSentence.replace(
                  correctOption.text,
                  blankHtml,
                )
              }
            } else {
              // 🌟 【批改后】：无论用户选对还是选错，左侧文章强制显示翠绿色的正确答案！方便通读复习。
              const highlightHtml = `<u class="text-emerald-600 font-bold underline decoration-2 underline-offset-4 decoration-emerald-400 bg-emerald-50 px-1.5 py-0.5 rounded-md mx-1">${correctOption.text}</u>`
              processedSentence = anchorSentence.replace(
                correctOption.text,
                highlightHtml,
              )
            }

            htmlContent = htmlContent.replaceAll(
              anchorSentence,
              processedSentence,
            )
            counter++
          }
        }
      })
    }
    const renderedHtml = annotateJapaneseHtml(
      htmlContent,
      localPronunciationMap,
      showPronunciation,
    )

    return (
      <div className='w-full'>
        {/* 顶部信息 */}
        <div className='mb-8 pb-8 border-b border-gray-100'>
          <div className='flex items-center justify-between gap-3 mb-4'>
            <span className='text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg'>
              {article.category?.name || '未分类'}
            </span>
            <div className='flex items-center gap-2'>
              <ToggleSwitch
                label='注音'
                checked={showPronunciation}
                onChange={setShowPronunciation}
              />
              <ToggleSwitch
                label='释义'
                checked={showMeaning}
                onChange={setShowMeaning}
              />
            </div>
          </div>
          <h1 className='text-3xl md:text-4xl font-black text-gray-900 leading-snug'>
            {article.title}
          </h1>
          {showMeaning && articleWordEntries.length > 0 && (
            <WordMetaPanel
              className='mt-5 grid grid-cols-1 gap-2 md:grid-cols-2'
              entries={articleWordEntries.map(([word, meta]) => ({
                word,
                pronunciation: meta.pronunciations[0] || '',
                pronunciations: meta.pronunciations,
                partsOfSpeech: meta.partsOfSpeech,
                meanings: meta.meanings,
              }))}
              showPronunciation={showPronunciation}
              showMeaning={showMeaning}
            />
          )}
        </div>

        {/* 渲染正文 */}
        <div
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
          className='text-lg md:text-xl text-gray-800 leading-[2.2] md:leading-[2.5] whitespace-pre-wrap select-text
                     [&_u]:text-indigo-600 [&_u]:font-bold [&_u]:underline [&_u]:decoration-2 [&_u]:underline-offset-4 [&_u]:decoration-indigo-400 [&_u]:bg-indigo-50 [&_u]:px-1.5 [&_u]:py-0.5 [&_u]:rounded-md [&_rt]:text-[10px] [&_rt]:font-bold [&_rt]:text-indigo-500'
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    )
  }

  // ================= 🌟 3. 智能布局分发 =================

  // 模式 A：纯阅读模式 (单列居中)
  if (!hasQuestions) {
    return (
      <div
        className='min-h-screen bg-gray-50 p-4 md:p-12 pb-24 md:pb-32'
        onClick={() => setActiveTooltip(null)}>
        {activeTooltip && (
          <VocabularyTooltip
            {...activeTooltip}
            saveState={saveState}
            onSaveWord={handleSaveWord}
            enablePronunciation
            pronunciationValue={tooltipPronunciation}
            saveWithPronunciation={saveWithPronunciation}
            onPronunciationChange={setTooltipPronunciation}
            onSaveWithPronunciationChange={setSaveWithPronunciation}
            partOfSpeechValue={tooltipPartOfSpeech}
            onPartOfSpeechChange={setTooltipPartOfSpeech}
            meaningValue={tooltipMeaning}
            saveWithMeaning={saveWithMeaning}
            onMeaningChange={setTooltipMeaning}
            onSaveWithMeaningChange={setSaveWithMeaning}
          />
        )}

        <div className='max-w-3xl mx-auto'>
          <div className='bg-white p-5 md:p-14 rounded-3xl shadow-sm border border-gray-100'>
            <ArticleContent />
          </div>
        </div>
      </div>
    )
  }

  // 模式 B：阅读理解模式 (桌面分屏，移动端堆叠)
  return (
    <div
      className='h-full bg-gray-50 flex flex-col md:flex-row overflow-hidden'
      onClick={() => setActiveTooltip(null)}>
      {activeTooltip && (
        <VocabularyTooltip
          {...activeTooltip}
          saveState={saveState}
          onSaveWord={handleSaveWord}
          enablePronunciation
          pronunciationValue={tooltipPronunciation}
          saveWithPronunciation={saveWithPronunciation}
          onPronunciationChange={setTooltipPronunciation}
          onSaveWithPronunciationChange={setSaveWithPronunciation}
          partOfSpeechValue={tooltipPartOfSpeech}
          onPartOfSpeechChange={setTooltipPartOfSpeech}
          meaningValue={tooltipMeaning}
          saveWithMeaning={saveWithMeaning}
          onMeaningChange={setTooltipMeaning}
          onSaveWithMeaningChange={setSaveWithMeaning}
        />
      )}

      {/* 👈 左半屏：文章阅读区 (独立滚动) */}
      <div
        className='flex-1 overflow-y-auto bg-white relative transition-all duration-300'
        // 移动端根据 bottomPanelHeight 动态计算高度，PC端占满高度
        style={{
          paddingBottom:
            hasQuestions && isMobile && !isPanelCollapsed
              ? `calc(${bottomPanelHeight}dvh + env(safe-area-inset-bottom))`
              : isPanelCollapsed
                ? `calc(${MOBILE_COLLAPSED_HEIGHT}px + env(safe-area-inset-bottom))`
                : '0px',
        }}>
        <div className='max-w-2xl mx-auto px-4 md:px-0 pt-4 md:pt-8'>
          <ArticleContent />
          {/* 底部占位，防止文字被遮挡 */}
          <div className='h-24 lg:h-32'></div>
        </div>
      </div>

      {/* ================= 🌟 右/下方：题目互动区 (可拖拽面板) ================= */}
      {hasQuestions && (
        <div
          className={`flex flex-col bg-gray-50 border-gray-200 transition-all duration-300 ease-out z-30
            ${isMobile ? 'fixed bottom-0 left-0 right-0 border-t shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] rounded-t-3xl' : 'w-full md:w-112.5 lg:w-137.5 border-l h-full'}
          `}
          // 移动端根据状态设置面板高度，展开状态应用拖拽高度，收缩状态给 60px
          style={
            isMobile
              ? {
                  height: isPanelCollapsed
                    ? `calc(${MOBILE_COLLAPSED_HEIGHT}px + env(safe-area-inset-bottom))`
                    : `calc(${bottomPanelHeight}dvh + env(safe-area-inset-bottom))`,
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }
              : {}
          }>
          {/* 🌟 移动端专属拖拽把手 (Drag Handle) */}
          <div className='md:hidden flex flex-col items-center pt-2 pb-3 bg-white rounded-t-3xl shrink-0 border-b border-gray-100 shadow-sm z-40 relative'>
            {/* 隐藏/展开 快速切换按钮 (放在左侧) */}
            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className='absolute left-4 top-2.5 p-1.5 text-gray-400 hover:text-indigo-600 transition-colors'>
              {isPanelCollapsed ? (
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2.5}
                    d='M5 15l7-7 7 7'
                  />
                </svg>
              ) : (
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2.5}
                    d='M19 9l-7 7-7-7'
                  />
                </svg>
              )}
            </button>

            {/* 居中的拖拽横条 */}
            <div
              ref={dragHandleRef}
              onMouseDown={startDrag}
              onTouchStart={startDrag}
              className='w-16 h-1.5 bg-gray-300 rounded-full cursor-grab active:cursor-grabbing hover:bg-gray-400 transition-colors mt-1'
            />

            <span className='text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest'>
              {isPanelCollapsed ? '上滑或点击展开题目' : '拖拽调整阅读视野'}
            </span>
            <span className='text-[11px] font-bold text-indigo-500 mt-1'>
              共 {article.questions.length} 题
            </span>
          </div>

          {/* 题目引擎区域 (PC端完全展示，移动端仅在展开时展示) */}
          <div
            className={`flex-1 overflow-y-auto bg-gray-50 custom-scrollbar ${isPanelCollapsed && isMobile ? 'hidden' : 'block'}`}>
            <div className='p-4 md:p-6 lg:p-8 min-h-full'>
              <div className='transform md:scale-95 lg:scale-100 origin-top'>
                <QuizEngineUI
                  quiz={{ questions: article.questions }}
                  backUrl='/articles'
                  onFinish={() => setIsQuizFinished(true)}
                  onAnswerChange={answers => setCurrentAnswers(answers)}
                  onGradedChange={map => setGradedMap(map)}
                  isArticleMode={true}
                  vocabularyMetaMapByQuestion={quizVocabularyMetaMapByQuestion}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

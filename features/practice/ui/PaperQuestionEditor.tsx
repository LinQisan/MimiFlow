'use client'

import Link from 'next/link'
import { useMemo, useTransition } from 'react'
import CustomSelect from '@/components/ui/CustomSelect'
import ToggleSwitch from '@/components/ToggleSwitch'
import { useDialog } from '@/context/DialogContext'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
import {
  getReadingQuestionSection,
  getPaperLanguageSectionGroup,
  getVocabGrammarQuestionSection,
  MATERIAL_GROUPS,
  parseActiveQuestionSection,
} from '@/modules/questions/domain/paper-editor'
import { usePaperQuestionEditorState } from '@/features/questions/hooks/usePaperQuestionEditorState'
import { useQuestionEditorMutations } from '@/features/questions/hooks/useQuestionEditorMutations'
import {
  createQuestionOption,
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/modules/questions/domain/editor'
import { supportsSeparateQuestionContext } from '@/modules/practice/domain/question-text'

type EditableOption = {
  id: string
  text: string
  isCorrect: boolean
}

type EditableQuestion = {
  id: string
  questionType: string
  prompt: string
  contextSentence: string
  explanation: string
  listeningSectionTitle: string
  listeningSectionNumber: string
  listeningSectionKey: string
  optionLabelFormat: OptionLabelFormat
  customOptionLabels: string
  shuffleOptions: boolean
  sortingOrder: number[]
  sortOrder: number
  options: EditableOption[]
}

type MaterialBlock = {
  id: string
  materialType: string
  title: string
  sortOrder: number
  questionCount: number
  listeningSectionTitle: string
  listeningSectionNumber: string
  listeningSectionKey: string
  questions: EditableQuestion[]
}

type PaperQuestionEditorProps = {
  paper: {
    id: string
    title: string
    description: string | null
    language: string | null
    level: string | null
    materials: MaterialBlock[]
  }
  activeSectionKey?: string | null
  moveTargets: Array<{
    id: string
    title: string
    level: string | null
  }>
}

export default function PaperQuestionEditor({
  paper,
  activeSectionKey,
  moveTargets,
}: PaperQuestionEditorProps) {
  const dialog = useDialog()
  const { deletePaperQuestions, movePaperQuestions, updatePaperQuestion } =
    useQuestionEditorMutations()
  const {
    materials,
    setMaterials,
    savingId,
    setSavingId,
    message,
    setMessage,
    openQuestionId,
    setOpenQuestionId,
    questionQuery,
    setQuestionQuery,
    questionTypeFilter,
    setQuestionTypeFilter,
    dirtyIds,
    setDirtyIds,
    selectedQuestionIds,
    setSelectedQuestionIds,
    targetPaperId,
    setTargetPaperId,
    bulkAction,
    setBulkAction,
    bulkMessage,
    setBulkMessage,
  } = usePaperQuestionEditorState<MaterialBlock>(paper.materials)
  const [isPending, startTransition] = useTransition()
  const paperReturnHref = `/manage/practice/${encodeURIComponent(paper.id)}${
    activeSectionKey
      ? `?section=${encodeURIComponent(activeSectionKey)}`
      : ''
  }`

  const getMaterialEditor = (material: MaterialBlock) => {
    const returnQuery = `returnTo=${encodeURIComponent(paperReturnHref)}`
    if (material.materialType === 'LISTENING') {
      return {
        href: `/manage/listening/${encodeURIComponent(material.id)}?${returnQuery}`,
        label: '编辑',
        ariaLabel: `编辑听力材料：${material.title}`,
      }
    }
    if (material.materialType === 'READING') {
      return {
        href: `/manage/reading/${encodeURIComponent(material.id)}?${returnQuery}`,
        label: '编辑',
        ariaLabel: `编辑阅读材料：${material.title}`,
      }
    }
    return null
  }

  const totalQuestionCount = useMemo(
    () => materials.reduce((sum, item) => sum + item.questions.length, 0),
    [materials],
  )
  const activeSection = useMemo(
    () => parseActiveQuestionSection(activeSectionKey),
    [activeSectionKey],
  )
  const visibleMaterials = useMemo(() => {
    if (!activeSection) return materials
    return materials
      .filter(item => item.materialType === activeSection.materialType)
      .map(material => {
        if (
          activeSection.materialType !== 'LISTENING' ||
          !activeSection.listeningSectionKey
        ) {
          return material
        }
        return {
          ...material,
          questionCount: material.questions.filter(
            question =>
              question.listeningSectionKey ===
              activeSection.listeningSectionKey,
          ).length,
          questions: material.questions.filter(
            question =>
              question.listeningSectionKey ===
              activeSection.listeningSectionKey,
          ),
        }
      })
      .filter(item => {
        if (
          activeSection.materialType !== 'LISTENING' ||
          !activeSection.listeningSectionKey
        ) {
          return true
        }
        return (
          item.listeningSectionKey === activeSection.listeningSectionKey ||
          item.questions.length > 0
        )
      })
  }, [activeSection, materials])
  const questionTypes = useMemo(
    () =>
      Array.from(
        new Set(
          materials.flatMap(material =>
            material.questions.map(item => item.questionType),
          ),
        ),
      ).sort((a, b) =>
        getQuestionTypeLabel(a).localeCompare(getQuestionTypeLabel(b), 'ja'),
      ),
    [materials],
  )
  const filteredMaterials = useMemo(() => {
    const keyword = questionQuery.trim().toLowerCase()
    return visibleMaterials
      .map(material => {
        const questions = material.questions.filter(question => {
          if (
            questionTypeFilter !== 'all' &&
            question.questionType !== questionTypeFilter
          ) {
            return false
          }
          if (!keyword) return true
          return [
            question.prompt,
            question.contextSentence,
            question.explanation,
            material.title,
            getQuestionTypeLabel(question.questionType),
          ].some(value =>
            String(value || '')
              .toLowerCase()
              .includes(keyword),
          )
        })
        return { ...material, questions, questionCount: questions.length }
      })
      .filter(material => {
        if (material.questions.length > 0) return true
        return (
          !keyword &&
          questionTypeFilter === 'all' &&
          activeSection?.materialType === 'LISTENING' &&
          material.listeningSectionKey === activeSection.listeningSectionKey
        )
      })
  }, [activeSection, questionQuery, questionTypeFilter, visibleMaterials])
  const groupedMaterials = useMemo(
    () =>
      MATERIAL_GROUPS.map(group => ({
        ...group,
        materials: filteredMaterials.filter(
          item => item.materialType === group.key,
        ),
      })).filter(group => group.materials.length > 0),
    [filteredMaterials],
  )
  const questionSectionGroups = useMemo(() => {
    type SectionGroup = {
      key: string
      materialType: string
      materialTitle: string
      sectionNumber: number
      title: string
      materials: MaterialBlock[]
    }
    const sections = new Map<string, SectionGroup>()

    for (const materialGroup of groupedMaterials) {
      for (const material of materialGroup.materials) {
        for (const question of material.questions) {
          const section =
            material.materialType === 'VOCAB_GRAMMAR'
              ? getVocabGrammarQuestionSection(question.questionType)
              : material.materialType === 'READING'
                ? getReadingQuestionSection(question.questionType)
                : material.materialType === 'LISTENING'
                  ? {
                      sectionNumber:
                        Number(question.listeningSectionNumber) ||
                        Number(material.listeningSectionNumber) ||
                        1,
                      title:
                        question.listeningSectionTitle ||
                        material.listeningSectionTitle ||
                        '聴解',
                    }
                  : {
                      sectionNumber: 1,
                      title: getQuestionTypeLabel(question.questionType),
                    }
          const key = `${material.materialType}:${section.sectionNumber}`
          let current = sections.get(key)
          if (!current) {
            current = {
              key,
              materialType: material.materialType,
              materialTitle:
                section.sectionNumber <= 7
                  ? getPaperLanguageSectionGroup(section.sectionNumber).title
                  : materialGroup.title,
              sectionNumber: section.sectionNumber,
              title: section.title,
              materials: [],
            }
            sections.set(key, current)
          }

          let sectionMaterial = current.materials.find(
            item => item.id === material.id,
          )
          if (!sectionMaterial) {
            sectionMaterial = {
              ...material,
              questions: [],
              questionCount: 0,
            }
            current.materials.push(sectionMaterial)
          }
          sectionMaterial.questions.push(question)
          sectionMaterial.questionCount = sectionMaterial.questions.length
        }
      }
    }

    const materialOrder = new Map<string, number>(
      MATERIAL_GROUPS.map((group, index) => [group.key, index]),
    )
    return [...sections.values()].sort(
      (a, b) =>
        (materialOrder.get(a.materialType) ?? Number.MAX_SAFE_INTEGER) -
          (materialOrder.get(b.materialType) ?? Number.MAX_SAFE_INTEGER) ||
        a.sectionNumber - b.sectionNumber,
    )
  }, [groupedMaterials])
  const visibleQuestionCount = filteredMaterials.reduce(
    (sum, material) => sum + material.questions.length,
    0,
  )
  const visibleQuestionIds = useMemo(
    () =>
      filteredMaterials.flatMap(material =>
        material.questions.map(question => question.id),
      ),
    [filteredMaterials],
  )
  const selectedCount = selectedQuestionIds.size
  const allVisibleSelected =
    visibleQuestionIds.length > 0 &&
    visibleQuestionIds.every(questionId => selectedQuestionIds.has(questionId))
  const vocabGrammarQuestionNumbers = useMemo(() => {
    const counters = new Map<number, number>()
    const numbers = new Map<
      string,
      { sectionNumber: number; questionNumber: number; title: string }
    >()
    for (const material of materials) {
      if (material.materialType !== 'VOCAB_GRAMMAR') continue
      for (const question of material.questions) {
        const section = getVocabGrammarQuestionSection(question.questionType)
        const questionNumber = (counters.get(section.sectionNumber) || 0) + 1
        counters.set(section.sectionNumber, questionNumber)
        numbers.set(question.id, { ...section, questionNumber })
      }
    }
    return numbers
  }, [materials])
  const readingQuestionNumbers = useMemo(() => {
    const counters = new Map<number, number>()
    const numbers = new Map<
      string,
      { sectionNumber: number; questionNumber: number; title: string }
    >()
    for (const material of materials) {
      if (material.materialType !== 'READING') continue
      for (const question of material.questions) {
        const section = getReadingQuestionSection(question.questionType)
        const questionNumber = (counters.get(section.sectionNumber) || 0) + 1
        counters.set(section.sectionNumber, questionNumber)
        numbers.set(question.id, { ...section, questionNumber })
      }
    }
    return numbers
  }, [materials])
  const activeSectionLabel = useMemo(() => {
    if (!activeSection) return ''
    if (
      activeSection.materialType === 'LISTENING' &&
      activeSection.listeningSectionKey
    ) {
      const material = materials.find(
        item => item.listeningSectionKey === activeSection.listeningSectionKey,
      )
      const question = materials
        .flatMap(item => item.questions)
        .find(
          item =>
            item.listeningSectionKey === activeSection.listeningSectionKey,
        )
      const sectionNumber =
        question?.listeningSectionNumber || material?.listeningSectionNumber
      const sectionTitle =
        question?.listeningSectionTitle || material?.listeningSectionTitle
      return sectionNumber
        ? `問題${sectionNumber}${sectionTitle ? `｜${sectionTitle}` : ''}`
        : '聴解'
    }
    return (
      MATERIAL_GROUPS.find(group => group.key === activeSection.materialType)
        ?.title || ''
    )
  }, [activeSection, materials])

  const setQuestionField = (
    materialId: string,
    questionId: string,
    field:
      | 'prompt'
      | 'contextSentence'
      | 'explanation'
      | 'listeningSectionNumber'
      | 'optionLabelFormat'
      | 'customOptionLabels',
    value: string,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(prev =>
      prev.map(material => {
        if (material.id !== materialId) return material
        return {
          ...material,
          questions: material.questions.map(question =>
            question.id === questionId
              ? { ...question, [field]: value }
              : question,
          ),
        }
      }),
    )
  }

  const setOptionField = (
    materialId: string,
    questionId: string,
    optionId: string,
    field: 'text' | 'isCorrect',
    value: string | boolean,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(prev =>
      prev.map(material => {
        if (material.id !== materialId) return material
        return {
          ...material,
          questions: material.questions.map(question => {
            if (question.id !== questionId) return question
            return {
              ...question,
              sortingOrder:
                question.questionType === 'SORTING'
                  ? []
                  : question.sortingOrder,
              options: question.options.map(option => {
                if (option.id !== optionId) return option
                if (field === 'isCorrect') {
                  return {
                    ...option,
                    isCorrect: Boolean(value),
                  }
                }
                return {
                  ...option,
                  text: String(value),
                }
              }),
            }
          }),
        }
      }),
    )
  }

  const selectSortingOption = (
    materialId: string,
    questionId: string,
    optionIndex: number,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(previous =>
      previous.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question => {
                if (question.id !== questionId) return question
                const currentOrder = question.sortingOrder || []
                if (currentOrder.includes(optionIndex)) return question
                const sortingOrder = [...currentOrder, optionIndex]
                const slots = question.prompt.match(/[＿_]{2,}|[★＊]/g) || []
                const starIndex = Math.max(
                  0,
                  slots.findIndex(slot => /[★＊]/.test(slot)),
                )
                return {
                  ...question,
                  sortingOrder,
                  options: question.options.map((option, index) => ({
                    ...option,
                    isCorrect:
                      sortingOrder.length === question.options.length &&
                      index === sortingOrder[starIndex],
                  })),
                }
              }),
            },
      ),
    )
  }

  const resetSortingOrder = (materialId: string, questionId: string) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(previous =>
      previous.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question =>
                question.id === questionId
                  ? { ...question, sortingOrder: [] }
                  : question,
              ),
            },
      ),
    )
  }

  const setQuestionShuffle = (
    materialId: string,
    questionId: string,
    shuffleOptions: boolean,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(prev =>
      prev.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question =>
                question.id === questionId
                  ? { ...question, shuffleOptions }
                  : question,
              ),
            },
      ),
    )
  }

  const setCorrectOption = (
    materialId: string,
    questionId: string,
    optionId: string,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(prev =>
      prev.map(material => {
        if (material.id !== materialId) return material
        return {
          ...material,
          questions: material.questions.map(question => {
            if (question.id !== questionId) return question
            return {
              ...question,
              options: question.options.map(option => ({
                ...option,
                isCorrect: option.id === optionId,
              })),
            }
          }),
        }
      }),
    )
  }

  const addOption = (materialId: string, questionId: string) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(previous =>
      previous.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question =>
                question.id !== questionId
                  ? question
                  : {
                      ...question,
                      sortingOrder: [],
                      options: [
                        ...question.options,
                        createQuestionOption(`${question.id}_opt`),
                      ],
                    },
              ),
            },
      ),
    )
  }

  const removeOption = (
    materialId: string,
    questionId: string,
    optionIndex: number,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(previous =>
      previous.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question =>
                question.id !== questionId
                  ? question
                  : {
                      ...question,
                      sortingOrder: [],
                      options: removeQuestionOptionAt(
                        question.options,
                        optionIndex,
                      ),
                    },
              ),
            },
      ),
    )
  }

  const saveQuestion = (materialId: string, questionId: string) => {
    const material = materials.find(item => item.id === materialId)
    const question = material?.questions.find(item => item.id === questionId)
    if (!material || !question) return

    setSavingId(questionId)
    setMessage(prev => ({ ...prev, [questionId]: '' }))

    startTransition(async () => {
      const result = await updatePaperQuestion({
        questionId: question.id,
        prompt: question.prompt,
        contextSentence: question.contextSentence,
        explanation: question.explanation,
        listeningSectionNumber: question.listeningSectionNumber,
        optionLabelFormat: question.optionLabelFormat,
        customOptionLabels: question.customOptionLabels,
        shuffleOptions: question.shuffleOptions,
        sortingOrder: question.sortingOrder,
        options: question.options,
      })
      setSavingId(null)
      if (result.success) {
        setDirtyIds(current => {
          const next = new Set(current)
          next.delete(questionId)
          return next
        })
      }
      setMessage(prev => ({
        ...prev,
        [questionId]:
          result.message || (result.success ? '已保存。' : '保存失败。'),
      }))
    })
  }

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds(current => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const toggleVisibleQuestions = () => {
    setSelectedQuestionIds(current => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleQuestionIds.forEach(questionId => next.delete(questionId))
      } else {
        visibleQuestionIds.forEach(questionId => next.add(questionId))
      }
      return next
    })
  }

  const clearQuestionSelection = () => {
    setSelectedQuestionIds(new Set())
    setTargetPaperId('')
  }

  const removeSelectedQuestionsFromState = (removeEmptyMaterials: boolean) => {
    setMaterials(current => {
      const next = current.map(material => {
        const questions = material.questions.filter(
          question => !selectedQuestionIds.has(question.id),
        )
        return { ...material, questions, questionCount: questions.length }
      })
      return removeEmptyMaterials
        ? next.filter(material => material.questions.length > 0)
        : next
    })
    setDirtyIds(current => {
      const next = new Set(current)
      selectedQuestionIds.forEach(questionId => next.delete(questionId))
      return next
    })
    setMessage(current =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([questionId]) => !selectedQuestionIds.has(questionId),
        ),
      ),
    )
    if (openQuestionId && selectedQuestionIds.has(openQuestionId)) {
      setOpenQuestionId(null)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedCount === 0 || bulkAction) return
    const confirmed = await dialog.confirm(
      `确定删除所选 ${selectedCount} 道题吗？相关答题记录和错题记录也会一并删除。`,
      {
        title: '删除题目',
        confirmText: '删除',
        danger: true,
      },
    )
    if (!confirmed) return

    setBulkAction('delete')
    setBulkMessage('')
    const result = await deletePaperQuestions({
      paperId: paper.id,
      questionIds: Array.from(selectedQuestionIds),
    })
    setBulkAction(null)
    setBulkMessage(
      result.message || (result.success ? '题目已删除。' : '删除失败。'),
    )
    if (!result.success) return
    removeSelectedQuestionsFromState(false)
    setSelectedQuestionIds(new Set())
    dialog.toast(result.message || '题目已删除。', { tone: 'success' })
  }

  const handleMoveSelected = async () => {
    if (selectedCount === 0 || !targetPaperId || bulkAction) return
    const target = moveTargets.find(item => item.id === targetPaperId)
    const confirmed = await dialog.confirm(
      `将所选 ${selectedCount} 道题移动到“${target?.title || '目标试卷'}”？`,
      { title: '移动题目', confirmText: '移动' },
    )
    if (!confirmed) return

    setBulkAction('move')
    setBulkMessage('')
    const result = await movePaperQuestions({
      paperId: paper.id,
      targetPaperId,
      questionIds: Array.from(selectedQuestionIds),
    })
    setBulkAction(null)
    setBulkMessage(
      result.message || (result.success ? '题目已移动。' : '移动失败。'),
    )
    if (!result.success) return
    removeSelectedQuestionsFromState(true)
    setSelectedQuestionIds(new Set())
    setTargetPaperId('')
    dialog.toast(result.message || '题目已移动。', { tone: 'success' })
  }

  return (
    <main
      className={`min-h-screen bg-[#f6f5f1] px-3 py-4 md:px-6 md:py-6 ${selectedCount > 0 ? 'pb-28' : ''}`}>
      <div className='mx-auto max-w-6xl space-y-5'>
        <header className='space-y-4 border-b border-slate-200 pb-5'>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <Link
              href='/manage/practice'
              className='text-xs font-bold text-slate-500 hover:text-slate-900'>
              ← 试卷
            </Link>
            <div className='min-w-0 flex-1'>
              <div className='flex min-w-0 items-baseline gap-3'>
                <h1 className='truncate text-xl font-bold text-slate-950 md:text-2xl'>
                  {paper.title}
                </h1>
                <p className='shrink-0 text-xs text-slate-500'>
                  {activeSection ? `${activeSectionLabel} · ` : ''}
                  {visibleQuestionCount} / {totalQuestionCount} 题
                  {dirtyIds.size > 0 ? ` · ${dirtyIds.size} 项未保存` : ''}
                </p>
              </div>
            </div>
            <a
              href={`/api/manage/practice/${encodeURIComponent(paper.id)}/export`}
              target='_blank'
              rel='noreferrer'
              className='ui-btn ui-btn-sm'
              title='下载试题、答案、听力原文和音频压缩包'>
              导出 ZIP
            </a>
            {activeSection ? (
              <Link
                href={`/manage/practice/${encodeURIComponent(paper.id)}`}
                className='ui-btn ui-btn-sm'>
                整卷
              </Link>
            ) : null}
          </div>
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px_auto]'>
            <input
              type='search'
              value={questionQuery}
              onChange={event => setQuestionQuery(event.target.value)}
              placeholder='搜索题目'
              aria-label='搜索题目'
              className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
            />
            <CustomSelect
              value={questionTypeFilter}
              onChange={event => setQuestionTypeFilter(event.target.value)}
              aria-label='筛选题型'
              className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm'>
              <option value='all'>全部题型</option>
              {questionTypes.map(type => (
                <option key={type} value={type}>
                  {getQuestionTypeLabel(type)}
                </option>
              ))}
            </CustomSelect>
            <label className='inline-flex h-9 cursor-pointer items-center justify-center gap-2 border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 sm:justify-start'>
              <input
                type='checkbox'
                checked={allVisibleSelected}
                onChange={toggleVisibleQuestions}
                disabled={
                  visibleQuestionIds.length === 0 || Boolean(bulkAction)
                }
                className='h-4 w-4 rounded border-slate-300 accent-slate-900'
              />
              全选 {visibleQuestionCount}
            </label>
          </div>
          {bulkMessage ? (
            <p
              role='status'
              className={`text-xs font-semibold ${
                bulkMessage.includes('失败') || bulkMessage.includes('不存在')
                  ? 'text-rose-600'
                  : 'text-emerald-700'
              }`}>
              {bulkMessage}
            </p>
          ) : null}
        </header>

        {questionSectionGroups.length > 1 ? (
          <nav
            aria-label='题目分区'
            className='flex gap-1 overflow-x-auto border-b border-slate-200 pb-2'>
            {questionSectionGroups.map(group => (
              <a
                key={group.key}
                href={`#question-section-${group.key}`}
                className='inline-flex shrink-0 items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-950'>
                問題{group.sectionNumber}
                <span className='font-medium text-slate-400'>
                  {group.materials.reduce(
                    (sum, material) => sum + material.questions.length,
                    0,
                  )}
                </span>
              </a>
            ))}
          </nav>
        ) : null}

        {questionSectionGroups.length === 0 ? (
          <section className='rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500'>
            暂无题目
          </section>
        ) : (
          questionSectionGroups.map(group => (
            <section
              key={group.key}
              id={`question-section-${group.key}`}
              className='scroll-mt-24 space-y-1'>
              <div className='sticky top-16 z-10 flex items-center gap-3 border-b border-slate-300 bg-[#f6f5f1]/95 py-2.5 backdrop-blur-sm'>
                <h2 className='text-sm font-bold text-slate-900'>
                  問題{group.sectionNumber}｜{group.title}
                </h2>
                <span className='text-xs text-slate-400'>
                  {group.materials.reduce(
                    (sum, material) => sum + material.questions.length,
                    0,
                  )}
                </span>
                <span className='ml-auto text-[10px] font-bold tracking-[0.12em] text-slate-400'>
                  {group.materialTitle}
                </span>
              </div>

              <div className='border-t border-slate-200'>
                {group.materials.map((material, materialIndex) => (
                  <div key={material.id} className='contents'>
                    {material.materialType !== 'VOCAB_GRAMMAR' ? (
                      <div className='border-b border-slate-200 bg-white/70 px-3 py-2.5'>
                        <div className='flex min-w-0 items-center justify-between gap-2'>
                          <div className='min-w-0'>
                            <h3 className='truncate text-sm font-bold text-slate-900'>
                              {material.title}
                            </h3>
                            <p className='mt-0.5 text-[11px] font-medium text-slate-400'>
                              {material.materialType === 'READING'
                                ? `阅读文章 ${materialIndex + 1}`
                                : '听力材料'}
                              {' · '}
                              {material.questionCount} 题
                            </p>
                          </div>
                          {(() => {
                            const editor = getMaterialEditor(material)
                            return editor ? (
                              <Link
                                href={editor.href}
                                aria-label={editor.ariaLabel}
                                className='ui-btn ui-btn-sm shrink-0 px-4'>
                                {editor.label}
                                <span aria-hidden='true'>→</span>
                              </Link>
                            ) : null
                          })()}
                        </div>
                      </div>
                    ) : null}

                    <div className={'contents'}>
                      {material.questions.length === 0 ? (
                        <div className='flex items-center justify-between gap-3 px-3 py-3'>
                          <span className='text-sm text-slate-500'>
                            暂无题目
                          </span>
                          {material.materialType !== 'LISTENING' &&
                          material.materialType !== 'READING' ? (
                            <Link
                              href={`/manage/listening/${encodeURIComponent(material.id)}#questions`}
                              className='ui-btn ui-btn-primary ui-btn-sm'>
                              添加题目
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                      {material.questions.map((question, index) => {
                        const statusText = message[question.id] || ''
                        const isSaving = savingId === question.id && isPending
                        const isOpen = openQuestionId === question.id
                        const typeLabel = getQuestionTypeLabel(
                          question.questionType,
                        )
                        const vocabGrammarNumber =
                          vocabGrammarQuestionNumbers.get(question.id)
                        const readingNumber = readingQuestionNumbers.get(
                          question.id,
                        )
                        const summaryText =
                          question.prompt || question.contextSentence

                        return (
                          <article
                            key={question.id}
                            className={`paper-question-row overflow-hidden border-b border-slate-200 bg-transparent ${
                              dirtyIds.has(question.id) ? 'bg-amber-50/40' : ''
                            }`}>
                            <div className='flex min-h-12 items-center gap-2 px-3 py-2'>
                              <input
                                type='checkbox'
                                checked={selectedQuestionIds.has(question.id)}
                                onChange={() =>
                                  toggleQuestionSelection(question.id)
                                }
                                disabled={Boolean(bulkAction)}
                                aria-label={`选择题目 ${question.sortOrder || index + 1}`}
                                className='h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900'
                              />
                              <div className='flex min-w-0 flex-1 items-center gap-2.5'>
                                {material.materialType !== 'LISTENING' &&
                                material.materialType !== 'VOCAB_GRAMMAR' &&
                                material.materialType !== 'READING' ? (
                                  <span className='inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 px-1.5 text-xs font-bold text-white'>
                                    {question.sortOrder || index + 1}
                                  </span>
                                ) : null}
                                <div className='min-w-0'>
                                  {(material.materialType === 'LISTENING' &&
                                    material.questions.length === 1) ||
                                  material.materialType === 'VOCAB_GRAMMAR' ||
                                  material.materialType === 'READING' ? (
                                    <div className='flex flex-wrap items-center gap-2'>
                                      <h3 className='truncate text-sm font-bold text-slate-900'>
                                        {material.materialType ===
                                          'VOCAB_GRAMMAR' && vocabGrammarNumber
                                          ? `問題${vocabGrammarNumber.sectionNumber}-${String(vocabGrammarNumber.questionNumber).padStart(2, '0')}｜${vocabGrammarNumber.title}`
                                          : material.materialType ===
                                                'READING' && readingNumber
                                            ? `問題${readingNumber.sectionNumber}-${String(readingNumber.questionNumber).padStart(2, '0')}｜${readingNumber.title}`
                                            : material.title}
                                      </h3>
                                      {dirtyIds.has(question.id) ? (
                                        <span className='text-[10px] font-bold text-amber-700'>
                                          未保存
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <>
                                      <div className='flex flex-wrap items-center gap-2'>
                                        <span className='text-[11px] font-bold text-slate-500'>
                                          {typeLabel}
                                        </span>
                                        {dirtyIds.has(question.id) ? (
                                          <span className='text-[10px] font-bold text-amber-700'>
                                            未保存
                                          </span>
                                        ) : null}
                                      </div>
                                      {summaryText ? (
                                        <p className='mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-slate-800'>
                                          {summaryText}
                                        </p>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </div>
                              {material.materialType !== 'LISTENING' &&
                              material.materialType !== 'READING' ? (
                                <div className='flex shrink-0 items-center gap-1.5'>
                                  <button
                                    type='button'
                                    onClick={() =>
                                      setOpenQuestionId(
                                        isOpen ? null : question.id,
                                      )
                                    }
                                    className='ui-btn ui-btn-sm'>
                                    {isOpen ? '收起' : '编辑'}
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {isOpen ? (
                              <div className='border-t border-slate-200 bg-slate-100/70 p-3 md:p-4'>
                                <div className='grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]'>
                                  <section className='space-y-4 rounded-xl border border-slate-200 bg-white p-4'>
                                    <div className='flex items-center justify-between gap-3'>
                                      <h4 className='text-sm font-bold text-slate-900'>
                                        题目内容
                                      </h4>
                                      {material.materialType === 'LISTENING' ? (
                                        <label className='flex items-center gap-2 text-xs font-semibold text-slate-500'>
                                          所属問題
                                          <input
                                            type='number'
                                            min='1'
                                            step='1'
                                            value={
                                              question.listeningSectionNumber
                                            }
                                            onChange={event =>
                                              setQuestionField(
                                                material.id,
                                                question.id,
                                                'listeningSectionNumber',
                                                event.target.value,
                                              )
                                            }
                                            aria-label='所属問題'
                                            className='h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-slate-400'
                                          />
                                        </label>
                                      ) : null}
                                    </div>

                                    <label className='block space-y-1.5'>
                                      <span className='text-xs font-bold text-slate-600'>
                                        题干
                                      </span>
                                      <textarea
                                        value={question.prompt}
                                        onChange={event =>
                                          setQuestionField(
                                            material.id,
                                            question.id,
                                            'prompt',
                                            event.target.value,
                                          )
                                        }
                                        rows={4}
                                        className='w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                      />
                                    </label>

                                    {supportsSeparateQuestionContext(
                                      question.questionType,
                                    ) ? (
                                      <details
                                        key={`${question.id}-${question.contextSentence ? 'with-context' : 'empty-context'}`}
                                        open={
                                          material.materialType !==
                                            'LISTENING' ||
                                          Boolean(question.contextSentence)
                                        }
                                        className='rounded-lg border border-slate-200 bg-slate-50/70'>
                                        <summary className='cursor-pointer list-none px-3 py-2 text-xs font-bold text-slate-600'>
                                          {question.questionType ===
                                          'FILL_BLANK'
                                            ? '定位句（可选，保留空位）'
                                            : question.questionType ===
                                                'READING_COMPREHENSION'
                                              ? '引用原文（可选）'
                                              : '语境句（可选）'}
                                        </summary>
                                        <div className='border-t border-slate-200 p-2'>
                                          <textarea
                                            value={question.contextSentence}
                                            onChange={event =>
                                              setQuestionField(
                                                material.id,
                                                question.id,
                                                'contextSentence',
                                                event.target.value,
                                              )
                                            }
                                            rows={3}
                                            aria-label='语境句'
                                            placeholder='仅在内容与题干不同时填写'
                                            className='w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                          />
                                        </div>
                                      </details>
                                    ) : null}

                                    <label className='block space-y-1.5'>
                                      <span className='text-xs font-bold text-slate-600'>
                                        解析（可选）
                                      </span>
                                      <textarea
                                        value={question.explanation}
                                        onChange={event =>
                                          setQuestionField(
                                            material.id,
                                            question.id,
                                            'explanation',
                                            event.target.value,
                                          )
                                        }
                                        rows={3}
                                        className='w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                      />
                                    </label>
                                  </section>

                                  <section className='rounded-xl border border-slate-200 bg-white p-4'>
                                    <div className='flex flex-wrap items-center justify-between gap-2'>
                                      <div>
                                        <h4 className='text-sm font-bold text-slate-900'>
                                          选项与答案
                                        </h4>
                                        <p className='mt-0.5 text-xs text-slate-400'>
                                          {question.options.length} 个选项
                                        </p>
                                      </div>
                                      <div className='flex items-center gap-2'>
                                        {material.materialType ===
                                        'LISTENING' ? (
                                          <ToggleSwitch
                                            label='选项乱序'
                                            checked={
                                              question.listeningSectionNumber !==
                                                '3' && question.shuffleOptions
                                            }
                                            disabled={
                                              question.listeningSectionNumber ===
                                              '3'
                                            }
                                            onChange={checked =>
                                              setQuestionShuffle(
                                                material.id,
                                                question.id,
                                                checked,
                                              )
                                            }
                                          />
                                        ) : null}
                                        <button
                                          type='button'
                                          onClick={() =>
                                            addOption(material.id, question.id)
                                          }
                                          className='ui-btn ui-btn-sm'>
                                          添加选项
                                        </button>
                                      </div>
                                    </div>

                                    {question.questionType === 'SORTING' ? (
                                      <div className='mt-4 border-y border-slate-200 py-4'>
                                        <div className='mb-3 flex items-center justify-between gap-3'>
                                          <span className='text-xs font-bold text-slate-700'>
                                            按正确语序点击选项
                                          </span>
                                          {question.sortingOrder.length > 0 ? (
                                            <button
                                              type='button'
                                              onClick={() =>
                                                resetSortingOrder(
                                                  material.id,
                                                  question.id,
                                                )
                                              }
                                              className='text-xs font-semibold text-slate-500 hover:text-slate-900'>
                                              重置
                                            </button>
                                          ) : null}
                                        </div>
                                        <div className='flex flex-wrap gap-2'>
                                          {question.options.map(
                                            (option, optionIndex) => {
                                              const position =
                                                question.sortingOrder.indexOf(
                                                  optionIndex,
                                                )
                                              return (
                                                <button
                                                  key={`paper-sorting-${question.id}-${option.id}`}
                                                  type='button'
                                                  disabled={
                                                    position >= 0 ||
                                                    !option.text.trim()
                                                  }
                                                  onClick={() =>
                                                    selectSortingOption(
                                                      material.id,
                                                      question.id,
                                                      optionIndex,
                                                    )
                                                  }
                                                  className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400'>
                                                  {position >= 0
                                                    ? `${position + 1}. `
                                                    : ''}
                                                  {option.text ||
                                                    `选项 ${optionIndex + 1}`}
                                                </button>
                                              )
                                            },
                                          )}
                                        </div>
                                      </div>
                                    ) : null}

                                    <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                                      <label className='space-y-1'>
                                        <span className='text-[11px] font-semibold text-slate-500'>
                                          序号
                                        </span>
                                        <CustomSelect
                                          value={
                                            question.optionLabelFormat ||
                                            'numeric'
                                          }
                                          onChange={event =>
                                            setQuestionField(
                                              material.id,
                                              question.id,
                                              'optionLabelFormat',
                                              event.target.value,
                                            )
                                          }
                                          className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm'>
                                          <option value='numeric'>
                                            1、2、3、4
                                          </option>
                                          <option value='upper-alpha'>
                                            A、B、C、D
                                          </option>
                                          <option value='circled-number'>
                                            ①、②、③、④
                                          </option>
                                          <option value='katakana'>
                                            ア、イ、ウ、エ
                                          </option>
                                          <option value='custom'>自定义</option>
                                        </CustomSelect>
                                      </label>
                                      {question.optionLabelFormat ===
                                      'custom' ? (
                                        <label className='space-y-1'>
                                          <span className='text-[11px] font-semibold text-slate-500'>
                                            自定义序号
                                          </span>
                                          <input
                                            value={
                                              question.customOptionLabels || ''
                                            }
                                            onChange={event =>
                                              setQuestionField(
                                                material.id,
                                                question.id,
                                                'customOptionLabels',
                                                event.target.value,
                                              )
                                            }
                                            placeholder='Ⅰ|Ⅱ|Ⅲ|Ⅳ'
                                            className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400'
                                          />
                                        </label>
                                      ) : null}
                                    </div>

                                    <div className='mt-4 space-y-2'>
                                      {question.options.map(
                                        (option, optionIndex) => {
                                          const optionLabel = formatOptionLabel(
                                            optionIndex,
                                            normalizeOptionLabelFormat(
                                              question.optionLabelFormat,
                                              'numeric',
                                            ),
                                            parseCustomOptionLabels(
                                              question.customOptionLabels,
                                            ),
                                          )

                                          return (
                                            <div
                                              key={option.id}
                                              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 ${
                                                option.isCorrect
                                                  ? 'border-emerald-300 bg-emerald-50/70'
                                                  : 'border-slate-200 bg-slate-50/60'
                                              }`}>
                                              <span className='inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-white px-1.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200'>
                                                {optionLabel}
                                              </span>
                                              <input
                                                value={option.text}
                                                onChange={event =>
                                                  setOptionField(
                                                    material.id,
                                                    question.id,
                                                    option.id,
                                                    'text',
                                                    event.target.value,
                                                  )
                                                }
                                                aria-label={`选项 ${optionLabel}`}
                                                className='h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400'
                                              />
                                              <div className='flex items-center gap-1'>
                                                <label
                                                  className={`flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-bold ${
                                                    option.isCorrect
                                                      ? 'bg-emerald-100 text-emerald-800'
                                                      : 'text-slate-500 hover:bg-white'
                                                  }`}>
                                                  <input
                                                    type='radio'
                                                    name={`correct-${question.id}`}
                                                    checked={option.isCorrect}
                                                    onChange={() =>
                                                      setCorrectOption(
                                                        material.id,
                                                        question.id,
                                                        option.id,
                                                      )
                                                    }
                                                    className='h-3.5 w-3.5'
                                                  />
                                                  正确
                                                </label>
                                                <button
                                                  type='button'
                                                  disabled={
                                                    question.options.length <=
                                                    MIN_QUESTION_OPTION_COUNT
                                                  }
                                                  onClick={() =>
                                                    removeOption(
                                                      material.id,
                                                      question.id,
                                                      optionIndex,
                                                    )
                                                  }
                                                  aria-label={`删除选项 ${optionIndex + 1}`}
                                                  className='h-8 rounded-md px-2 text-[11px] font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-25'>
                                                  移除
                                                </button>
                                              </div>
                                            </div>
                                          )
                                        },
                                      )}
                                    </div>
                                  </section>
                                </div>

                                <div className='mt-3 flex flex-wrap items-center justify-end gap-3'>
                                  {statusText ? (
                                    <p
                                      role='status'
                                      className={`mr-auto text-xs font-semibold ${
                                        statusText.includes('已保存')
                                          ? 'text-emerald-700'
                                          : 'text-rose-600'
                                      }`}>
                                      {statusText}
                                    </p>
                                  ) : null}
                                  <button
                                    type='button'
                                    onClick={() =>
                                      saveQuestion(material.id, question.id)
                                    }
                                    disabled={isSaving}
                                    className='ui-btn ui-btn-primary min-w-24 disabled:opacity-50'>
                                    {isSaving ? '保存中…' : '保存题目'}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {selectedCount > 0 ? (
        <div className='fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-[#f6f5f1]/95 px-3 py-2.5 shadow-[0_-14px_35px_-28px_rgba(15,23,42,0.45)] backdrop-blur-md'>
          <div className='mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center'>
            <div className='flex items-center justify-between gap-3 sm:shrink-0'>
              <span className='px-1 text-sm font-bold text-slate-900'>
                已选 {selectedCount} 题
              </span>
              <button
                type='button'
                onClick={clearQuestionSelection}
                disabled={Boolean(bulkAction)}
                className='px-1 text-xs font-semibold text-slate-400 hover:text-slate-800 sm:hidden'>
                取消选择
              </button>
            </div>
            <CustomSelect
              value={targetPaperId}
              onChange={event => setTargetPaperId(event.target.value)}
              aria-label='移动到试卷'
              disabled={moveTargets.length === 0 || Boolean(bulkAction)}
              className='h-9 min-w-0 flex-1 border border-slate-200 bg-white px-3 text-sm'>
              <option value=''>移动到其他试卷…</option>
              {moveTargets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.level ? `${target.level} · ` : ''}
                  {target.title}
                </option>
              ))}
            </CustomSelect>
            <div className='flex gap-2 sm:shrink-0'>
              <button
                type='button'
                onClick={clearQuestionSelection}
                disabled={Boolean(bulkAction)}
                className='ui-btn ui-btn-sm hidden sm:inline-flex'>
                取消
              </button>
              <button
                type='button'
                onClick={() => void handleMoveSelected()}
                disabled={!targetPaperId || Boolean(bulkAction)}
                className='ui-btn ui-btn-sm flex-1 disabled:opacity-40 sm:flex-none'>
                {bulkAction === 'move' ? '移动中…' : '移动'}
              </button>
              <button
                type='button'
                onClick={() => void handleDeleteSelected()}
                disabled={Boolean(bulkAction)}
                className='ui-btn ui-btn-sm flex-1 text-rose-600 hover:bg-rose-50 disabled:opacity-40 sm:flex-none'>
                {bulkAction === 'delete' ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

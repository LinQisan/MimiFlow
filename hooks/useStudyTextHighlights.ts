'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { LearningPointCategory, SourceType } from '@prisma/client'
import { listExpressionHighlights } from '@/modules/knowledge/vocabulary/expression-highlight-actions'
import { mergeInlineHighlightRects } from '@/utils/text/inlineHighlightRects'
import {
  resolveJlptHighlightSlot,
  resolvePrimaryJlpt,
} from '@/features/reading/domain/wordbook-highlight-groups'

export type LearningPointHighlight = {
  id: string
  annotationLabel?: string
  title: string
  category: LearningPointCategory | null
  fragments: string[]
  note: string | null
  sentenceText: string
  sourceType: SourceType
  sourceId: string
}

export type LearningPointSelection = {
  points: LearningPointHighlight[]
  range: Range
  wordbook?: { word: string; wordbookId: string; x: number; y: number }
}

type LearningPointMatch = { point: LearningPointHighlight; range: Range }

export type WordbookHighlightGroup = {
  id: string
  label: string
  words: string[]
  canonicalWords?: string[]
  jlptByWord?: Record<string, string[]>
  wordbookIdsByWord?: Record<string, string[]>
  aliases?: Record<string, string>
  variants?: Record<string, string>
  priority?: number
  slot?: number
}

const LEARNING_POINT_HIGHLIGHT_NAMES: Record<LearningPointCategory, string> = {
  GRAMMAR: 'learning-point-grammar',
  PATTERN: 'learning-point-pattern',
  IDIOM: 'learning-point-idiom',
  PARAPHRASE: 'learning-point-paraphrase',
  DISTRACTOR: 'learning-point-distractor',
  OTHER: 'learning-point-other',
}
const WORD_BOOK_SLOT_COUNT = 6
const RECT_KEY_PRECISION = 100
const JAPANESE_COMPOUND_PREFIX_REGEX = /[\p{Script=Han}\p{Script=Katakana}ー々]$/u
const JAPANESE_COMPOUND_START_REGEX = /^[\p{Script=Han}\p{Script=Katakana}ー々]/u

const sourceKey = (sourceType: string, sourceId: string) =>
  `${sourceType}\u0000${sourceId}`

function listSourceElements(root: HTMLElement) {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>('[data-source-type][data-source-id]'),
  )
  if (root.matches('[data-source-type][data-source-id]')) elements.unshift(root)
  return elements
}

// Learning-point fragments are authored text ranges and are kept separate
// from the vocabulary-token path below. Wordbook highlights must never infer
// source offsets from rendered ruby DOM; they only decorate existing tokens.
function buildLearningPointTextIndex(element: HTMLElement) {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (
        !parent ||
        parent.closest(
          'rt, script, style, textarea, input, button:not([data-selection-text="true"]), [data-context-ignore], [data-highlight-ignore]',
        )
      ) {
        return NodeFilter.FILTER_REJECT
      }
      return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  const offsets: Array<{ node: Text; start: number; end: number; nodeOffset: number }> = []
  let text = ''
  nodes.forEach(node => {
    const value = node.textContent || ''
    for (let i = 0; i < value.length; i++) {
      if (/\s/u.test(value[i])) continue
      const start = text.length
      text += value[i]
      offsets.push({ node, start, end: start + 1, nodeOffset: i })
    }
  })
  return { comparableText: text.toLocaleLowerCase('ja'), offsets }
}

type TextIndex = ReturnType<typeof buildLearningPointTextIndex>
type MatchedTextRange = {
  range: Range
  word: string
  segments: Array<{ node: Text; start: number; end: number }>
}

function offsetAt(index: TextIndex, position: number, isEnd = false) {
  let low = 0
  let high = index.offsets.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const item = index.offsets[middle]
    if (position < item.start || (isEnd && position === item.start)) high = middle - 1
    else if (position > item.end || (!isEnd && position === item.end)) low = middle + 1
    else return item
  }
  return undefined
}

function rangesForNeedles(index: TextIndex, needles: string[]) {
  const { comparableText } = index
  const ranges: MatchedTextRange[] = []
  const claimedOffsets: Array<{ start: number; end: number }> = []

  needles
    .map(needle => needle.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .forEach(needle => {
      const comparableNeedle = needle.toLocaleLowerCase('ja').replace(/\s/gu, '')
      let from = 0
      while (from < comparableText.length) {
        const start = comparableText.indexOf(comparableNeedle, from)
        if (start < 0) break
        const end = start + comparableNeedle.length
        const hasCompoundPrefix =
          JAPANESE_COMPOUND_START_REGEX.test(comparableNeedle) &&
          JAPANESE_COMPOUND_PREFIX_REGEX.test(comparableText.slice(0, start))
        if (hasCompoundPrefix) {
          from = Math.max(end, start + 1)
          continue
        }
        const startNode = offsetAt(index, start)
        const endNode = offsetAt(index, end, true)
        const overlaps = claimedOffsets.some(
          offset => start < offset.end && end > offset.start,
        )
        if (!overlaps && startNode && endNode) {
          const range = document.createRange()
          range.setStart(startNode.node, start - startNode.start + startNode.nodeOffset)
          range.setEnd(endNode.node, end - endNode.start + endNode.nodeOffset)
          const segments = index.offsets.flatMap(offset => {
            const segmentStart = Math.max(start, offset.start)
            const segmentEnd = Math.min(end, offset.end)
            return segmentStart < segmentEnd
              ? [{
                  node: offset.node,
                  start: segmentStart - offset.start + offset.nodeOffset,
                  end: segmentEnd - offset.start + offset.nodeOffset,
                }]
              : []
          })
          ranges.push({ range, word: needle, segments })
          claimedOffsets.push({ start, end })
        }
        from = Math.max(end, start + 1)
      }
    })

  return ranges
}

type WordbookTokenDecoration = {
  token: HTMLElement
  word: string
  wordbookId: string
  wordbookIds: string[]
  slot: number
}

const VOCAB_TOKEN_SELECTOR = '[data-vocab-token="true"]'

function listVocabTokenElements(element: HTMLElement) {
  const tokens = Array.from(
    element.querySelectorAll<HTMLElement>(VOCAB_TOKEN_SELECTOR),
  )
  if (element.matches(VOCAB_TOKEN_SELECTOR)) tokens.unshift(element)
  return tokens
}

const normalizeVocabTokenSurface = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('ja')

function vocabTokenSurface(token: HTMLElement) {
  return (
    token.dataset.vocabSurface || token.dataset.sudachiSurface || ''
  ).trim()
}

function mountWordbookTokenUnderlines(
  decorations: WordbookTokenDecoration[],
) {
  const originalAttributes = new Map<
    HTMLElement,
    {
      className: string
      wordbookHighlight: string | null
      wordbookWord: string | null
      wordbookId: string | null
      wordbookIds: string | null
    }
  >()

  decorations.forEach(decoration => {
    const { token } = decoration
    if (!originalAttributes.has(token)) {
      originalAttributes.set(token, {
        className: token.className,
        wordbookHighlight: token.getAttribute('data-wordbook-highlight'),
        wordbookWord: token.getAttribute('data-wordbook-word'),
        wordbookId: token.getAttribute('data-wordbook-id'),
        wordbookIds: token.getAttribute('data-wordbook-ids'),
      })
    }
    token.classList.add(
      'study-wordbook-underline',
      `wordbook-slot-${decoration.slot}`,
    )
    token.dataset.wordbookHighlight = 'true'
    token.dataset.wordbookWord = decoration.word
    token.dataset.wordbookId = decoration.wordbookId
    token.dataset.wordbookIds = decoration.wordbookIds.join(' ')
  })

  return () => {
    originalAttributes.forEach((attributes, token) => {
      token.className = attributes.className
      const restoreAttribute = (name: string, value: string | null) => {
        if (value === null) token.removeAttribute(name)
        else token.setAttribute(name, value)
      }
      restoreAttribute('data-wordbook-highlight', attributes.wordbookHighlight)
      restoreAttribute('data-wordbook-word', attributes.wordbookWord)
      restoreAttribute('data-wordbook-id', attributes.wordbookId)
      restoreAttribute('data-wordbook-ids', attributes.wordbookIds)
    })
  }
}

function clientRectKey(
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
) {
  return [rect.left, rect.top, rect.right, rect.bottom]
    .map(value => Math.round(value * RECT_KEY_PRECISION))
    .join(':')
}

function mountHighlightOverlay(
  rangesByName: Map<string, Range[]>,
  observedRoot: HTMLElement,
) {
  const previousPosition = observedRoot.style.position
  if (getComputedStyle(observedRoot).position === 'static') {
    observedRoot.style.position = 'relative'
  }
  const overlay = document.createElement('div')
  overlay.dataset.studyTextHighlightOverlay = 'true'
  overlay.className = 'pointer-events-none absolute inset-0 z-20'
  overlay.style.setProperty('margin', '0', 'important')
  observedRoot.prepend(overlay)
  let frameId: number | null = null

  const render = () => {
    frameId = null
    const rootRect = observedRoot.getBoundingClientRect()
    const markers: Array<{
      className: string
      left: number
      top: number
      width: number
      height: number
    }> = []
    rangesByName.forEach((ranges, name) => {
      const renderedRects = new Set<string>()
      ranges.forEach(range => {
        const rects = Array.from(range.getClientRects())
        const maximumHeight = Math.max(0, ...rects.map(rect => rect.height))
        mergeInlineHighlightRects(
          rects.filter(
            rect =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.height >= maximumHeight * 0.72,
          ),
        ).forEach(rect => {
          const key = clientRectKey(rect)
          if (renderedRects.has(key)) return
          renderedRects.add(key)
          markers.push({
            className: `study-learning-point-highlight ${name}`,
            left: rect.left - rootRect.left + observedRoot.scrollLeft,
            top: rect.top + 1 - rootRect.top + observedRoot.scrollTop,
            width: rect.width,
            height: Math.max(2, rect.height - 2),
          })
        })
      })
    })

    markers.forEach((item, index) => {
      const marker =
        (overlay.children.item(index) as HTMLSpanElement | null) ||
        document.createElement('span')
      if (!marker.isConnected) overlay.appendChild(marker)
      if (marker.className !== item.className) marker.className = item.className
      const nextStyle = `left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px`
      if (marker.dataset.highlightLayout !== nextStyle) {
        marker.dataset.highlightLayout = nextStyle
        marker.style.cssText = nextStyle
      }
    })
    while (overlay.children.length > markers.length) {
      overlay.lastElementChild?.remove()
    }
  }
  const scheduleRender = () => {
    if (frameId !== null) return
    frameId = window.requestAnimationFrame(render)
  }
  const resizeObserver = new ResizeObserver(scheduleRender)

  render()
  resizeObserver.observe(observedRoot)
  window.addEventListener('resize', scheduleRender)

  return () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    resizeObserver.disconnect()
    window.removeEventListener('resize', scheduleRender)
    overlay.remove()
    observedRoot.style.position = previousPosition
  }
}

export function useStudyTextHighlights({
  rootRef,
  contentKey,
  showLearningPoints,
  showWordbooks = false,
  wordbookGroups = [],
  onWordbookWordClick,
}: {
  rootRef: RefObject<HTMLElement | null>
  contentKey: string | number
  showLearningPoints: boolean
  showWordbooks?: boolean
  wordbookGroups?: WordbookHighlightGroup[]
  onWordbookWordClick?: (payload: {
    word: string
    wordbookId: string
    x: number
    y: number
  }) => void
}) {
  const [learningPoints, setLearningPoints] = useState<LearningPointHighlight[]>([])
  const [isLoadingLearningPoints, setIsLoadingLearningPoints] = useState(false)
  const [learningPointSelection, setLearningPointSelection] = useState<LearningPointSelection | null>(null)
  const [recordRevision, setRecordRevision] = useState(0)
  useEffect(() => {
    const refresh = () => { setRecordRevision(value => value + 1); setLearningPointSelection(null) }
    window.addEventListener('learning-records-changed', refresh)
    window.addEventListener('vocabulary-attributes-changed', refresh)
    return () => { window.removeEventListener('learning-records-changed', refresh); window.removeEventListener('vocabulary-attributes-changed', refresh) }
  }, [])
  const learningPointMatches = useRef<LearningPointMatch[]>([])
  const closeLearningPoint = useCallback(() => setLearningPointSelection(null), [])
  const inspectLearningPoint = useCallback((id: string) => {
    const match = learningPointMatches.current.find(item => item.point.id === id)
    if (!match) return
    match.range.startContainer.parentElement?.scrollIntoView({ block: 'center' })
    setLearningPointSelection({ points: [match.point], range: match.range })
  }, [])
  const inspectLearningPointWord = useCallback(() => {
    if (!learningPointSelection?.wordbook || !onWordbookWordClick) return
    onWordbookWordClick(learningPointSelection.wordbook)
    setLearningPointSelection(null)
  }, [learningPointSelection, onWordbookWordClick])

  useEffect(() => {
    setLearningPointSelection(null)
  }, [contentKey, showLearningPoints, showWordbooks])

  useEffect(() => {
    if ((!showLearningPoints && !showWordbooks) || !rootRef.current) {
      setLearningPoints([])
      setIsLoadingLearningPoints(false)
      return
    }
    const sources = Array.from(
      new Map(
        listSourceElements(rootRef.current).flatMap(element => {
          const sourceType = element.dataset.sourceType
          const sourceId = element.dataset.sourceId
          return sourceType && sourceId
            ? [[sourceKey(sourceType, sourceId), { sourceType, sourceId }] as const]
            : []
        }),
      ).values(),
    )
    if (sources.length === 0) {
      setLearningPoints([])
      setIsLoadingLearningPoints(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingLearningPoints(true)
    void Promise.all([showLearningPoints ? fetch('/api/learning-points/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as { highlights: LearningPointHighlight[] }
      })
      : Promise.resolve({ highlights: [] as LearningPointHighlight[] }),
      showWordbooks ? listExpressionHighlights(sources) : Promise.resolve([]),
    ]).then(([result, expressions]) => {
        if (controller.signal.aborted) return
        setLearningPoints([...result.highlights, ...expressions])
        setIsLoadingLearningPoints(false)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLearningPoints([])
        setIsLoadingLearningPoints(false)
      })
    return () => controller.abort()
  }, [contentKey, rootRef, showLearningPoints, showWordbooks, recordRevision])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sourceElements = listSourceElements(root)
    const sourceIndexes = showLearningPoints || showWordbooks
      ? sourceElements.map(buildLearningPointTextIndex)
      : []
    const allRangesByName = new Map<string, Range[]>()
    const pointMatches: LearningPointMatch[] = []
    const wordbookDecorations: WordbookTokenDecoration[] = []

    if (showWordbooks) {
      const tokenBySurface = new Map<string, HTMLElement[]>()
      listVocabTokenElements(root).forEach(token => {
        const surface = vocabTokenSurface(token)
        const normalizedSurface = normalizeVocabTokenSurface(surface)
        if (!normalizedSurface) return
        const tokens = tokenBySurface.get(normalizedSurface) || []
        tokens.push(token)
        tokenBySurface.set(normalizedSurface, tokens)
      })
      const candidatesBySurface = new Map<
        string,
        Array<{
          word: string
          sourceId: string
          wordbookId: string
          wordbookIds: string[]
          slot: number
        }>
      >()
      ;[...wordbookGroups]
        .sort(
          (left, right) =>
            (left.priority ?? Number.MAX_SAFE_INTEGER) -
            (right.priority ?? Number.MAX_SAFE_INTEGER) ||
            left.label.localeCompare(right.label, 'ja'),
        )
        .forEach(group => {
          const fallbackSlot =
            (group.slot ?? WORD_BOOK_SLOT_COUNT - 1) % WORD_BOOK_SLOT_COUNT
          const words = Array.from(new Set(group.words)).filter(word => {
            const normalized = normalizeVocabTokenSurface(word)
            return Boolean(normalized && tokenBySurface.has(normalized))
          })
          words.forEach(word => {
            const normalized = normalizeVocabTokenSurface(word)
            const candidates = candidatesBySurface.get(normalized) || []
            if (candidates.some(candidate => candidate.sourceId === group.id)) {
              return
            }
            const jlptLevels =
              group.jlptByWord?.[word] || group.jlptByWord?.[normalized] || []
            const wordbookIds = Array.from(
              new Set(group.wordbookIdsByWord?.[word] || [group.id]),
            )
            const primaryJlpt = resolvePrimaryJlpt(jlptLevels)
            candidates.push({
              word,
              sourceId: group.id,
              wordbookId: wordbookIds[0] || group.id,
              wordbookIds,
              slot: primaryJlpt
                ? resolveJlptHighlightSlot(primaryJlpt)
                : fallbackSlot,
            })
            candidatesBySurface.set(normalized, candidates)
          })
        })
      candidatesBySurface.forEach(candidates => {
        const primary = candidates[0]
        if (!primary) return
        const tokens =
          tokenBySurface.get(normalizeVocabTokenSurface(primary.word)) || []
        const wordbookIds = Array.from(
          new Set(candidates.flatMap(candidate => candidate.wordbookIds)),
        )
        tokens.forEach(token => {
          wordbookDecorations.push({
            token,
            word: primary.word,
            wordbookId: primary.wordbookId,
            wordbookIds,
            slot: primary.slot,
          })
        })
      })
    }

    if (showLearningPoints || showWordbooks) {
      const pointsBySource = learningPoints.filter(point => point.annotationLabel ? showWordbooks : showLearningPoints).reduce((map, point) => {
        const key = sourceKey(point.sourceType, point.sourceId)
        map.set(key, [...(map.get(key) || []), point])
        return map
      }, new Map<string, LearningPointHighlight[]>())
      const rangesByName = new Map<string, Range[]>()
      sourceElements.forEach((element, sourceIndex) => {
        const type = element.dataset.sourceType
        const id = element.dataset.sourceId
        if (!type || !id) return
        ;(pointsBySource.get(sourceKey(type, id)) || []).forEach(point => {
          const category = point.category || 'OTHER'
          const name = LEARNING_POINT_HIGHLIGHT_NAMES[category]
          const ranges = rangesByName.get(name) || []
          const matches = rangesForNeedles(sourceIndexes[sourceIndex], point.fragments)
          ranges.push(...matches.map(match => match.range))
          pointMatches.push(...matches.map(match => ({ point, range: match.range })))
          rangesByName.set(name, ranges)
        })
      })
      rangesByName.forEach((ranges, name) => allRangesByName.set(name, ranges))
    }

    learningPointMatches.current = pointMatches
    const unmountUnderlines = mountWordbookTokenUnderlines(wordbookDecorations)
    const unmountHighlights = allRangesByName.size
      ? mountHighlightOverlay(allRangesByName, root)
      : () => {}
    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(
        'button:not([data-selection-text="true"]), a, input, textarea, [data-highlight-ignore], [data-pronunciation-editable]',
      )) return
      const selectedText = window.getSelection()?.toString().trim()
      if (selectedText) return
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-wordbook-highlight]')
          : null
      const word = target?.dataset.wordbookWord
      const wordbookId = target?.dataset.wordbookId
      const wordbook = showWordbooks && onWordbookWordClick && word && wordbookId
        ? { word, wordbookId, x: event.clientX, y: event.clientY }
        : undefined
      const matches = pointMatches.filter(match =>
        Array.from(match.range.getClientRects()).some(rect =>
          event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom,
        ),
      )
      if (matches.length) {
        event.preventDefault()
        event.stopPropagation()
        setLearningPointSelection({
          points: [...new Map(matches.map(match => [match.point.id, match.point])).values()],
          range: matches[0].range,
          wordbook,
        })
        return
      }
      if (!wordbook || !onWordbookWordClick) return
      event.preventDefault()
      event.stopPropagation()
      onWordbookWordClick(wordbook)
    }
    root.addEventListener('click', handleClick, true)

    return () => {
      learningPointMatches.current = []
      root.removeEventListener('click', handleClick, true)
      unmountHighlights()
      unmountUnderlines()
    }
  }, [
    contentKey,
    learningPoints,
    onWordbookWordClick,
    rootRef,
    showLearningPoints,
    showWordbooks,
    wordbookGroups,
  ])

  return {
    learningPointSelection,
    closeLearningPoint,
    inspectLearningPoint,
    inspectLearningPointWord,
    learningPointCount: learningPoints.length,
    learningPoints,
    isLoadingLearningPoints,
  }
}

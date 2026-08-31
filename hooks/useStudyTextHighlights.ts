'use client'

import { useEffect, useState, type RefObject } from 'react'
import type { LearningPointCategory, SourceType } from '@prisma/client'

export type LearningPointHighlight = {
  id: string
  title: string
  category: LearningPointCategory | null
  fragments: string[]
  note: string | null
  sentenceText: string
  sourceType: SourceType
  sourceId: string
}

export type WordbookHighlightGroup = {
  id: string
  label: string
  words: string[]
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

const sourceKey = (sourceType: string, sourceId: string) =>
  `${sourceType}\u0000${sourceId}`

function listSourceElements(root: HTMLElement) {
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>('[data-source-type][data-source-id]'),
  )
  if (root.matches('[data-source-type][data-source-id]')) elements.unshift(root)
  return elements
}

function buildTextIndex(element: HTMLElement) {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (
        !parent ||
        parent.closest(
          'rt, script, style, textarea, input, button, [data-context-ignore], [data-highlight-ignore]',
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
  const offsets: Array<{ node: Text; start: number; end: number }> = []
  let text = ''
  nodes.forEach(node => {
    const value = node.textContent || ''
    const start = text.length
    text += value
    offsets.push({ node, start, end: start + value.length })
  })
  return { comparableText: text.toLocaleLowerCase('ja'), offsets }
}

type TextIndex = ReturnType<typeof buildTextIndex>
type MatchedTextRange = { range: Range; word: string }

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
  const seen = new Set<string>()

  needles
    .map(needle => needle.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .forEach(needle => {
      const comparableNeedle = needle.toLocaleLowerCase('ja')
      let from = 0
      while (from < comparableText.length) {
        const start = comparableText.indexOf(comparableNeedle, from)
        if (start < 0) break
        const end = start + comparableNeedle.length
        const rangeKey = `${start}:${end}`
        const startNode = offsetAt(index, start)
        const endNode = offsetAt(index, end, true)
        if (!seen.has(rangeKey) && startNode && endNode) {
          const range = document.createRange()
          range.setStart(startNode.node, start - startNode.start)
          range.setEnd(endNode.node, end - endNode.start)
          ranges.push({ range, word: needle })
          seen.add(rangeKey)
        }
        from = Math.max(end, start + 1)
      }
    })

  return ranges
}

function mountHighlightOverlay(
  rangesByName: Map<string, Range[]>,
  observedRoot: HTMLElement,
) {
  const overlay = document.createElement('div')
  overlay.dataset.studyTextHighlightOverlay = 'true'
  overlay.className = 'pointer-events-none absolute left-0 top-0 z-20'
  document.body.appendChild(overlay)
  let frameId: number | null = null

  const render = () => {
    frameId = null
    overlay.replaceChildren()
    rangesByName.forEach((ranges, name) => {
      ranges.forEach(range => {
        const rects = Array.from(range.getClientRects())
        const maximumHeight = Math.max(0, ...rects.map(rect => rect.height))
        rects
          .filter(rect => rect.height >= maximumHeight * 0.72)
          .forEach(rect => {
          if (rect.width <= 0 || rect.height <= 0) return
          const marker = document.createElement('span')
          const isWordbook = name.startsWith('wordbook-slot-')
          marker.className = isWordbook
            ? `study-wordbook-highlight ${name}`
            : `study-learning-point-highlight ${name}`
          marker.style.left = `${rect.left + window.scrollX}px`
          marker.style.top = `${(isWordbook ? rect.bottom - 2 : rect.top + 1) + window.scrollY}px`
          marker.style.width = `${rect.width}px`
          marker.style.height = `${isWordbook ? 2 : Math.max(2, rect.height - 2)}px`
          overlay.appendChild(marker)
          })
      })
    })
  }
  const scheduleRender = () => {
    if (frameId !== null) return
    frameId = window.requestAnimationFrame(render)
  }
  const handleScroll = (event: Event) => {
    if (event.target === document || event.target === document.scrollingElement) return
    scheduleRender()
  }
  const resizeObserver = new ResizeObserver(scheduleRender)
  const layoutRoot = observedRoot.closest('section') || observedRoot.parentElement
  const mutationObserver = new MutationObserver(scheduleRender)

  render()
  resizeObserver.observe(observedRoot)
  if (layoutRoot) {
    mutationObserver.observe(layoutRoot, { childList: true, subtree: true })
  }
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', scheduleRender)
  return () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    resizeObserver.disconnect()
    mutationObserver.disconnect()
    window.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('resize', scheduleRender)
    overlay.remove()
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
  onWordbookWordClick?: (payload: { word: string; x: number; y: number }) => void
}) {
  const [learningPoints, setLearningPoints] = useState<LearningPointHighlight[]>([])
  const [isLoadingLearningPoints, setIsLoadingLearningPoints] = useState(false)

  useEffect(() => {
    if (!showLearningPoints || !rootRef.current) {
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
    void fetch('/api/learning-points/highlights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as { highlights: LearningPointHighlight[] }
      })
      .then(result => {
        setLearningPoints(result.highlights)
        setIsLoadingLearningPoints(false)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLearningPoints([])
        setIsLoadingLearningPoints(false)
      })
    return () => controller.abort()
  }, [contentKey, rootRef, showLearningPoints])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sourceElements = listSourceElements(root)
    const sourceIndexes = sourceElements.map(buildTextIndex)
    const allRangesByName = new Map<string, Range[]>()
    const clickableWordRanges: MatchedTextRange[] = []

    if (showWordbooks) {
      const claimedWords = new Set<string>()
      const rangesBySlot = new Map<number, Range[]>()
      wordbookGroups.forEach((group, index) => {
        const words = group.words.filter(word => {
          const normalized = word.toLocaleLowerCase('ja')
          if (claimedWords.has(normalized)) return false
          claimedWords.add(normalized)
          return true
        })
        const matches = sourceIndexes.flatMap(index =>
          rangesForNeedles(index, words),
        )
        const ranges = matches.map(match => match.range)
        clickableWordRanges.push(...matches)
        const slot = (group.slot ?? index) % WORD_BOOK_SLOT_COUNT
        rangesBySlot.set(slot, [...(rangesBySlot.get(slot) || []), ...ranges])
      })
      rangesBySlot.forEach((ranges, slot) => {
        allRangesByName.set(`wordbook-slot-${slot}`, ranges)
      })
    }

    if (showLearningPoints) {
      const pointsBySource = learningPoints.reduce((map, point) => {
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
          ranges.push(
            ...rangesForNeedles(sourceIndexes[sourceIndex], point.fragments).map(match => match.range),
          )
          rangesByName.set(name, ranges)
        })
      })
      rangesByName.forEach((ranges, name) => allRangesByName.set(name, ranges))
    }

    const unmountOverlay = mountHighlightOverlay(allRangesByName, root)
    const handleClick = (event: MouseEvent) => {
      if (!showWordbooks || !onWordbookWordClick) return
      const selectedText = window.getSelection()?.toString().trim()
      if (selectedText) return
      const hit = clickableWordRanges.find(item =>
        Array.from(item.range.getClientRects()).some(
          rect =>
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom,
        ),
      )
      if (hit) {
        onWordbookWordClick({
          word: hit.word,
          x: event.clientX,
          y: event.clientY,
        })
      }
    }
    root.addEventListener('click', handleClick)

    return () => {
      root.removeEventListener('click', handleClick)
      unmountOverlay()
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
    learningPointCount: learningPoints.length,
    learningPoints,
    isLoadingLearningPoints,
  }
}

export const wordbookHighlightKeyClass = (index: number) =>
  `wordbook-highlight-key-${index % WORD_BOOK_SLOT_COUNT}`

const JLPT_WORD_BOOK_SLOTS: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
}

export function resolveWordbookHighlightSlot(label: string) {
  const level = label.toUpperCase().match(/(?:^|[^A-Z0-9])(N[1-5])(?:$|[^A-Z0-9])/)?.[1]
  return level ? JLPT_WORD_BOOK_SLOTS[level] : 5
}

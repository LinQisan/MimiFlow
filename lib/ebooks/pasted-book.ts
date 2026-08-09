import type { EbookChapter } from './chapter-display'

const CHAPTER_HEADING = /^(?:#{1,3}\s+(.+)|((?:第[0-9０-９一二三四五六七八九十百]+[章节部篇]|序章|前言|序言|付録|附录)(?:[\s　：:].*)?))$/

export type ParsedPastedBook = {
  chapters: EbookChapter[]
  text: string
  chapterCount: number
  displayMathCount: number
  inlineMathCount: number
}

export function parsePastedBookText(raw: string, bookTitle = ''): ParsedPastedBook {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) {
    return {
      chapters: [],
      text: '',
      chapterCount: 0,
      displayMathCount: 0,
      inlineMathCount: 0,
    }
  }

  const sections: Array<{ title: string; lines: string[] }> = []
  let current = { title: '', lines: [] as string[] }
  let inDisplayMath = false

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    const wasInDisplayMath = inDisplayMath
    if (inDisplayMath && (/\$\$$/.test(trimmed) || /\\\]$/.test(trimmed))) {
      inDisplayMath = false
    } else if (!inDisplayMath && (/^\$\$/.test(trimmed) || /^\\\[/.test(trimmed))) {
      inDisplayMath = !(
        (trimmed.match(/\$\$/g)?.length || 0) >= 2 ||
        (/^\\\[/.test(trimmed) && /\\\]$/.test(trimmed))
      )
    }

    const heading = !wasInDisplayMath && !inDisplayMath
      ? trimmed.match(CHAPTER_HEADING)
      : null
    if (heading) {
      if (current.lines.some(item => item.trim())) sections.push(current)
      current = { title: (heading[1] || heading[2] || '').trim(), lines: [] }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.some(item => item.trim()) || current.title) sections.push(current)

  const chapters = sections.map((section, index) => ({
    id: `pasted-${index + 1}`,
    title:
      section.title ||
      (sections.length === 1 ? bookTitle.trim() || '正文' : index === 0 ? '前言' : `章节 ${index + 1}`),
    text: section.lines.join('\n').trim(),
    href: '',
  }))

  return {
    chapters,
    text: chapters.map(chapter => chapter.text).filter(Boolean).join('\n\n'),
    chapterCount: chapters.length,
    displayMathCount:
      (normalized.match(/\$\$[\s\S]*?\$\$/g)?.length || 0) +
      (normalized.match(/\\\[[\s\S]*?\\\]/g)?.length || 0),
    inlineMathCount:
      (normalized.match(/\\\([\s\S]*?\\\)/g)?.length || 0) +
      (normalized.match(/(?<!\$)\$(?!\$)[^\n$]+\$(?!\$)/g)?.length || 0),
  }
}

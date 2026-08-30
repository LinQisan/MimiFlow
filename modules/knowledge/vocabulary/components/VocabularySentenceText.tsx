import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
  escapeHtml,
  type JapaneseRubyLexeme,
} from '@/utils/language/japaneseRuby'

export default function VocabularySentenceText({
  text,
  word,
  pronunciation,
  highlightClass,
  showPronunciation,
  pronunciationSource = 'personal',
  sudachiLexicon = {},
}: {
  text: string
  word: string
  pronunciation: string
  highlightClass: string
  showPronunciation: boolean
  pronunciationSource?: 'sudachi' | 'personal'
  sudachiLexicon?: Record<string, JapaneseRubyLexeme>
}) {
  if (!word) return <span>{text}</span>

  if (
    showPronunciation &&
    pronunciationSource === 'sudachi' &&
    Object.keys(sudachiLexicon).length > 0
  ) {
    const annotate = (value: string) =>
      annotateJapaneseTextWithSudachi(value, sudachiLexicon, {
        useSudachiReading: true,
        rubyEnabled: true,
        rubyClassName: 'jp-ruby',
        rtClassName: 'jp-ruby-rt text-[9px] font-semibold text-slate-500',
      })
    const highlightedWord = annotate(word)
    const html = text
      .split(word)
      .map(annotate)
      .join(
        `<span class="inline-block align-baseline rounded-sm px-1 py-0.5 ${highlightClass}">${highlightedWord}</span>`,
      )

    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  const highlightedWord =
    showPronunciation && pronunciation
      ? buildJapaneseRubyHtml(word, pronunciation, {
          rubyClassName: 'jp-ruby font-semibold text-slate-900',
          rtClassName: 'jp-ruby-rt text-[9px] font-semibold text-slate-500',
        })
      : escapeHtml(word)
  const className =
    showPronunciation && pronunciation
      ? `inline-block align-baseline rounded-sm px-1 py-0.5 ${highlightClass}`
      : `rounded px-1 py-0.5 font-semibold ${highlightClass}`
  const html = text
    .split(word)
    .map(escapeHtml)
    .join(`<span class="${className}">${highlightedWord}</span>`)

  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

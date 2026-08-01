import {
  buildJapaneseRubyHtml,
  escapeHtml,
} from '@/utils/language/japaneseRuby'

export default function VocabularySentenceText({
  text,
  word,
  pronunciation,
  highlightClass,
  showPronunciation,
}: {
  text: string
  word: string
  pronunciation: string
  highlightClass: string
  showPronunciation: boolean
}) {
  if (!word) return <span>{text}</span>

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

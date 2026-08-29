import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  buildVocabularyCandidates,
  buildWordFrequency,
  isSudachiContentWord,
  mergeWordFrequencyRows,
  sortWordFrequencyRows,
} from '../features/reading/domain/sudachi.ts'
import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
  formatJapaneseTextWithSudachiRubyNotation,
} from '../utils/language/japaneseRuby.ts'
const ROOT = process.cwd()

test('article reading wires SudachiPy as an optional pronunciation source', async () => {
  const requirements = await readFile(path.join(ROOT, 'requirements.txt'), 'utf8')
  const articlePage = await readFile(
    path.join(ROOT, 'app/(library)/reading/articles/[id]/page.tsx'),
    'utf8',
  )
  const ebookPage = await readFile(
    path.join(ROOT, 'app/(library)/reading/ebooks/[id]/page.tsx'),
    'utf8',
  )
  const reader = await readFile(
    path.join(ROOT, 'features/reading/ui/ArticleReaderClient.tsx'),
    'utf8',
  )
  const sourceSelector = await readFile(
    path.join(
      ROOT,
      'features/reading/ui/PronunciationSourceSelector.tsx',
    ),
    'utf8',
  )
  const readingCenter = await readFile(
    path.join(ROOT, 'app/(library)/reading/page.tsx'),
    'utf8',
  )
  const readingCenterClient = await readFile(
    path.join(ROOT, 'app/(library)/reading/ReadingCenterClient.tsx'),
    'utf8',
  )
  const frequencyDialog = await readFile(
    path.join(ROOT, 'features/reading/ui/WordFrequencyDialog.tsx'),
    'utf8',
  )
  const frequencyServer = await readFile(
    path.join(ROOT, 'features/reading/server/word-frequency.ts'),
    'utf8',
  )
  const frequencyRoute = await readFile(
    path.join(ROOT, 'app/api/reading/word-frequency/route.ts'),
    'utf8',
  )
  const selectionHook = await readFile(
    path.join(ROOT, 'hooks/useTextSelection.ts'),
    'utf8',
  )

  assert.match(requirements, /SudachiPy==/)
  assert.match(requirements, /SudachiDict-full==/)
  assert.doesNotMatch(requirements, /SudachiDict-core==/)
  assert.match(articlePage, /getSudachiPronunciationMap/)
  assert.doesNotMatch(ebookPage, /getSudachiPronunciationMap/)
  assert.match(reader, /PronunciationSourceSelector/)
  assert.match(sourceSelector, />\s*默认\s*</)
  assert.match(sourceSelector, />\s*我的\s*</)
  assert.match(reader, /annotateJapaneseTextWithSudachi/)
  assert.match(reader, /ExtractVocabularyPanel/)
  assert.match(selectionHook, /data-sudachi-lemma/)
  assert.doesNotMatch(readingCenter, /getSudachiPronunciationMap/)
  assert.match(readingCenter, /frequencyMaterialCount/)
  assert.match(readingCenter, /collectionType === 'PAPER'/)
  assert.match(readingCenterClient, /WordFrequencyDialog/)
  assert.match(readingCenterClient, /筛选阅读/)
  assert.match(frequencyServer, /getSudachiPronunciationMap/)
  assert.match(frequencyServer, /buildWordFrequency/)
  assert.match(frequencyRoute, /buildReadingFrequencyMaterials/)
  assert.match(frequencyDialog, /阅读词频/)
  assert.match(frequencyDialog, /api\/reading\/word-frequency/)
  assert.match(frequencyDialog, /正在按需统计词频/)
  assert.match(frequencyDialog, /仅新闻/)
  assert.match(frequencyDialog, /仅真题文章/)
  assert.match(frequencyDialog, /全部年份/)
})

test(
  'SudachiPy produces hiragana readings for Japanese compounds',
  { skip: !existsSync(path.join(ROOT, '.venv/bin/python')) },
  () => {
    const result = spawnSync(
      path.join(ROOT, '.venv/bin/python'),
      [path.join(ROOT, 'scripts/sudachi_pronunciation.py')],
      {
        cwd: ROOT,
        input: JSON.stringify({ texts: ['今日は日本語を勉強しながら考えている。'] }),
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 0, result.stderr)
    const payload = JSON.parse(result.stdout)

    assert.equal(payload.pronunciationMap['今日'], 'きょう')
    assert.equal(payload.pronunciationMap['日本語'], 'にほんご')
    assert.equal(payload.pronunciationMap['勉強'], 'べんきょう')
    const inflected = payload.tokens.find(item => item.surface === '考え')
    assert.equal(inflected.dictionaryForm, '考える')
    assert.equal(inflected.dictionaryReading, 'かんがえる')
    assert.equal(inflected.partsOfSpeech[0], '動詞')
    assert.equal(payload.lexicon['考え'].dictionaryForm, '考える')
  },
)

test('Sudachi ruby excludes symbols, katakana and numbers from annotations', () => {
  const lexicon = Object.fromEntries(
    [
      ['（', 'きごう', ['補助記号', '括弧開']],
      ['パートナー', 'ぱーとなー', ['名詞']],
      ['）', 'きごう', ['補助記号', '括弧閉']],
      ['２０３０', 'にれいさんれい', ['名詞', '数詞']],
      ['年', 'ねん', ['名詞']],
      ['浸透', 'しんとう', ['名詞']],
      ['子ども', 'こども', ['名詞']],
    ].map(([surface, reading, partsOfSpeech]) => [
      surface,
      {
        surface,
        dictionaryForm: surface,
        normalizedForm: surface,
        reading,
        dictionaryReading: reading,
        partsOfSpeech,
      },
    ]),
  )
  const text = '（パートナー）は２０３０年、子どもに浸透する。'
  const html = annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: true,
    rubyEnabled: true,
  })

  assert.equal((html.match(/<ruby/g) || []).length, 3)
  assert.doesNotMatch(html, /<ruby[^>]*>（/)
  assert.doesNotMatch(html, /<ruby[^>]*>パートナー/)
  assert.doesNotMatch(html, /<ruby[^>]*>２０３０/)
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation(text, lexicon),
    '（パートナー）は２０３０{年|ねん}、{子|こ}どもに{浸透|しんとう}する。',
  )
})

test('mixed katakana and kanji annotate only the kanji reading', () => {
  const lexicon = {
    'サービス提供': {
      surface: 'サービス提供',
      dictionaryForm: 'サービス提供',
      normalizedForm: 'サービス提供',
      reading: 'さーびすていきょう',
      dictionaryReading: 'さーびすていきょう',
      partsOfSpeech: ['名詞'],
    },
    者: {
      surface: '者',
      dictionaryForm: '者',
      normalizedForm: '者',
      reading: 'しゃ',
      dictionaryReading: 'しゃ',
      partsOfSpeech: ['接尾辞'],
    },
  }
  const html = buildJapaneseRubyHtml(
    'サービス提供',
    'さーびすていきょう',
    { groupKanji: true },
  )

  assert.match(html, /^サービス<ruby>提供<rt[^>]*>ていきょう<\/rt><\/ruby>$/)
  assert.doesNotMatch(html, /さーびすていきょう/)
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation(
      'サービス提供者',
      lexicon,
    ),
    'サービス{提供|ていきょう}{者|しゃ}',
  )
})

test('Sudachi ruby annotates numeric units and excludes okurigana', () => {
  const lexicon = Object.fromEntries(
    [
      ['１０万', 'いちれいまん', ['名詞', '数詞']],
      ['人', 'にん', ['接尾辞']],
      ['辿っ', 'たどっ', ['動詞']],
      ['て', 'て', ['助詞']],
    ].map(([surface, reading, partsOfSpeech]) => [
      surface,
      {
        surface,
        dictionaryForm: surface === '辿っ' ? '辿る' : surface,
        normalizedForm: surface,
        reading,
        dictionaryReading: surface === '辿っ' ? 'たどる' : reading,
        partsOfSpeech,
      },
    ]),
  )
  const text = '１０万人が辿ってきた。'
  const html = annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: true,
    rubyEnabled: true,
  })

  assert.doesNotMatch(html, /<ruby[^>]*>１０万/)
  assert.match(
    html,
    /１０<ruby>万<rt[^>]*>まん<\/rt><\/ruby><\/span><span[^>]*><ruby>人<rt[^>]*>にん<\/rt><\/ruby>/,
  )
  assert.match(html, /<ruby>辿<rt[^>]*>たど<\/rt><\/ruby>っ/)
  assert.doesNotMatch(html, /<rt[^>]*>たどっ<\/rt>/)
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation(text, lexicon),
    '１０{万|まん}{人|にん}が{辿|たど}ってきた。',
  )
})

test('Sudachi ruby adopts an inline parenthetical reading without the okurigana', () => {
  const surface = '辿（たど）っ'
  const lexicon = {
    [surface]: {
      surface,
      dictionaryForm: '辿る',
      normalizedForm: '辿る',
      reading: 'たどっ',
      dictionaryReading: 'たどる',
      partsOfSpeech: ['動詞'],
    },
  }
  const text = '道を辿（たど）っている。'
  const html = annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: true,
    rubyEnabled: true,
  })

  assert.match(html, /<ruby>辿<rt[^>]*>たど<\/rt><\/ruby>（たど）っ/)
  assert.doesNotMatch(html, /<rt[^>]*>たどっ<\/rt>/)
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation(text, lexicon),
    '道を{辿|たど}（たど）っている。',
  )
})

test('word extraction and frequency merge inflections by dictionary form', () => {
  assert.equal(
    isSudachiContentWord({
      surface: '頑丈',
      dictionaryForm: '頑丈',
      normalizedForm: '頑丈',
      reading: 'がんじょう',
      dictionaryReading: 'がんじょう',
      partsOfSpeech: ['形状詞'],
    }),
    true,
  )
  const tokens = [
    {
      surface: '考え',
      dictionaryForm: '考える',
      normalizedForm: '考える',
      reading: 'かんがえ',
      dictionaryReading: 'かんがえる',
      partsOfSpeech: ['動詞'],
      textIndex: 0,
      begin: 0,
      end: 2,
    },
    {
      surface: '考える',
      dictionaryForm: '考える',
      normalizedForm: '考える',
      reading: 'かんがえる',
      dictionaryReading: 'かんがえる',
      partsOfSpeech: ['動詞'],
      textIndex: 1,
      begin: 0,
      end: 3,
    },
    {
      surface: 'を',
      dictionaryForm: 'を',
      normalizedForm: 'を',
      reading: 'を',
      dictionaryReading: 'を',
      partsOfSpeech: ['助詞'],
      textIndex: 1,
      begin: 3,
      end: 4,
    },
  ]

  assert.deepEqual(buildVocabularyCandidates(tokens), [
    {
      word: '考える',
      surface: '考え',
      reading: 'かんがえる',
      partOfSpeech: '动词',
      count: 2,
    },
  ])
  assert.deepEqual(buildWordFrequency(tokens), [
    {
      word: '考える',
      surface: '考え',
      reading: 'かんがえる',
      partOfSpeech: '动词',
      count: 2,
      documentCount: 2,
    },
  ])
  const merged = mergeWordFrequencyRows([
    [{ ...buildWordFrequency(tokens)[0], count: 1, documentCount: 1 }],
    [{ ...buildWordFrequency(tokens)[0], count: 3, documentCount: 1 }],
  ])
  assert.equal(merged[0].count, 4)
  assert.equal(merged[0].documentCount, 2)
})

test('learning ranking lowers foundational words and ignores internal markers', () => {
  const makeToken = (word, count, partsOfSpeech = ['名詞']) =>
    Array.from({ length: count }, (_, index) => ({
      surface: word,
      dictionaryForm: word,
      normalizedForm: word,
      reading: word,
      dictionaryReading: word,
      partsOfSpeech,
      textIndex: index,
      begin: 0,
      end: word.length,
    }))
  const rows = buildWordFrequency([
    ...makeToken('こと', 20),
    ...makeToken('頑丈', 3, ['形状詞']),
    ...makeToken('sort', 10),
    ...makeToken('注', 10),
  ])

  assert.deepEqual(rows.map(row => row.word), ['頑丈', 'こと'])
  assert.deepEqual(rows.map(row => row.partOfSpeech), ['形容动词', '名词'])
  assert.deepEqual(
    sortWordFrequencyRows(rows, 'frequency').map(row => row.word),
    ['こと', '頑丈'],
  )
})

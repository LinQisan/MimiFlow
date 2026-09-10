import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'
import test from 'node:test'
import {
  buildWordFrequency,
  isSudachiContentWord,
  mergeWordFrequencyRows,
  normalizeSudachiTokenReadings,
  sortWordFrequencyRows,
} from '../modules/language/domain/sudachi.ts'
import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
  formatJapaneseTextWithSudachiRubyNotation,
} from '../utils/language/japaneseRuby.ts'
import { filterReadingFrequencyRowsByWordbooks } from '../features/reading/domain/word-frequency.ts'
import { resolveWordbookFilterIds } from '../modules/knowledge/vocabulary/domain/wordbook-list.ts'
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
  const pronunciationRoute = await readFile(
    path.join(ROOT, 'app/api/pronunciation/route.ts'),
    'utf8',
  )
  const sourceSelector = await readFile(
    path.join(
      ROOT,
      'components/ui/PronunciationSourceSelector.tsx',
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
  assert.doesNotMatch(articlePage, /getSudachiPronunciationMap/)
  assert.match(reader, /fetch\('\/api\/pronunciation'/)
  assert.match(reader, /includeWordbookAnalysis: true/)
  assert.match(pronunciationRoute, /buildWordFrequency/)
  assert.doesNotMatch(ebookPage, /getSudachiPronunciationMap/)
  assert.match(reader, /PronunciationSourceSelector/)
  assert.match(sourceSelector, />\s*默认\s*</)
  assert.match(sourceSelector, />\s*我的\s*</)
  assert.match(reader, /annotateJapaneseTextWithSudachi/)
  assert.doesNotMatch(reader, /ExtractVocabularyPanel|提取生词/)
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
  assert.match(frequencyDialog, /WordbookScopeFilter/)
})

test('reading frequency can be scoped to selected wordbooks and uncollected words', () => {
  const rows = [
    { word: '準備', reading: 'じゅんび', partOfSpeech: '名詞', count: 2, documentCount: 1, learningScore: 1 },
    { word: '確認', reading: 'かくにん', partOfSpeech: '名詞', count: 1, documentCount: 1, learningScore: 1 },
    { word: '未収録', reading: 'みしゅうろく', partOfSpeech: '名詞', count: 1, documentCount: 1, learningScore: 1 },
  ]
  const wordbooks = [
    { id: 'red-book', matchedWords: ['準備'] },
    { id: 'blue-book', matchedWords: ['確認'] },
  ]

  assert.deepEqual(
    filterReadingFrequencyRowsByWordbooks(
      rows,
      new Set(['red-book']),
      false,
      wordbooks,
      ['未収録'],
    ).map(row => row.word),
    ['準備'],
  )
  assert.deepEqual(
    filterReadingFrequencyRowsByWordbooks(
      rows,
      new Set(['red-book']),
      true,
      wordbooks,
      ['未収録'],
    ).map(row => row.word),
    ['準備', '未収録'],
  )
})

test('wordbook series filter selects every leaf wordbook in the series', () => {
  const wordbooks = [
    { id: 'n1', pathLabel: '红宝书 / N1' },
    { id: 'n2', pathLabel: '红宝书 / N2' },
    { id: 'unit-1', pathLabel: 'N2語彙トレーニング / Unit01' },
  ]

  assert.deepEqual(
    [...resolveWordbookFilterIds(wordbooks, 'series:红宝书')],
    ['n1', 'n2'],
  )
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

test('Sudachi contextual normalization corrects 交通の便 per occurrence', () => {
  const token = (surface, reading, textIndex, begin, end) => ({
    surface,
    dictionaryForm: surface,
    normalizedForm: surface,
    reading,
    dictionaryReading: reading,
    partsOfSpeech: ['名詞'],
    textIndex,
    begin,
    end,
  })
  const tokens = [
    token('交通', 'こうつう', 0, 0, 2),
    token('の', 'の', 0, 2, 3),
    token('便', 'びん', 0, 3, 4),
    token('郵便', 'ゆうびん', 1, 0, 2),
    token('の', 'の', 1, 2, 3),
    token('便', 'びん', 1, 3, 4),
  ]

  assert.deepEqual(
    normalizeSudachiTokenReadings(tokens).map(item => item.reading),
    ['こうつう', 'の', 'べん', 'ゆうびん', 'の', 'びん'],
  )
})

test(
  'Sudachi persistent worker initializes once and serves newline-delimited requests',
  { skip: !existsSync(path.join(ROOT, '.venv/bin/python')) },
  async () => {
    const child = spawn(
      path.join(ROOT, '.venv/bin/python'),
      [path.join(ROOT, 'scripts/sudachi_pronunciation.py'), '--worker'],
      { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    child.stdout.setEncoding('utf8')
    let buffer = ''
    const queued = []
    const waiters = []
    const flush = () => {
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.trim()) {
          const message = JSON.parse(line)
          const waiter = waiters.shift()
          if (waiter) waiter(message)
          else queued.push(message)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }
    child.stdout.on('data', chunk => {
      buffer += chunk
      flush()
    })

    const nextMessage = () => {
      if (queued.length > 0) return Promise.resolve(queued.shift())
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Sudachi worker test timed out')),
          15_000,
        )
        waiters.push(message => {
          clearTimeout(timeout)
          resolve(message)
        })
      })
    }

    try {
      const ready = await nextMessage()
      assert.equal(ready.type, 'ready')
      assert.equal(typeof ready.timings.sudachiImportMs, 'number')
      assert.equal(typeof ready.timings.dictionaryInitializationMs, 'number')

      child.stdin.write(
        `${JSON.stringify({ id: 'first', texts: ['今日は日本語を勉強します。'] })}\n`,
      )
      const first = await nextMessage()
      assert.equal(first.type, 'result')
      assert.equal(first.id, 'first')
      assert.equal(first.pronunciationMap['日本語'], 'にほんご')
      assert.equal(first.timings.worker, true)

      child.stdin.write(
        `${JSON.stringify({ id: 'second', texts: ['日本語を復習します。'] })}\n`,
      )
      const second = await nextMessage()
      assert.equal(second.type, 'result')
      assert.equal(second.id, 'second')
      assert.equal(second.timings.sudachiImportMs, 0)
      assert.equal(second.timings.dictionaryInitializationMs, 0)
    } finally {
      child.stdin.end()
      await once(child, 'close')
    }
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

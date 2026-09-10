import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRONUNCIATION_VERSION,
  isPronunciationUpToDate,
  normalizePronunciationData,
  parseRubyNotationToSegments,
  renderRubySegmentsHtml,
} from '../modules/knowledge/vocabulary/domain/pronunciation.ts'
import { formatJapaneseTextWithSudachiTokens } from '../modules/language/domain/sudachi-ruby.ts'

test('pronunciation domain: parseRubyNotationToSegments', () => {
  const segments = parseRubyNotationToSegments('{辿|たど}り{着|つ}く')
  assert.deepEqual(segments, [
    { text: '辿', reading: 'たど' },
    { text: 'り' },
    { text: '着', reading: 'つ' },
    { text: 'く' },
  ])
})

test('pronunciation domain: parseRubyNotationToSegments with plain text', () => {
  const segments = parseRubyNotationToSegments('すばらしい')
  assert.deepEqual(segments, [{ text: 'すばらしい' }])
})

test('pronunciation domain: sentence tokens preserve occurrence readings', () => {
  const text = '交通の便と朝一番の便。'
  const token = (surface, reading, begin, end) => ({
    surface,
    dictionaryForm: surface,
    normalizedForm: surface,
    reading,
    dictionaryReading: reading,
    partsOfSpeech: [],
    textIndex: 0,
    begin,
    end,
  })
  const tokens = [
    token('交通', 'こうつう', 0, 2),
    token('の', 'の', 2, 3),
    token('便', 'べん', 3, 4),
    token('と', 'と', 4, 5),
    token('朝一番', 'あさいちばん', 5, 8),
    token('の', 'の', 8, 9),
    token('便', 'びん', 9, 10),
    token('。', '。', 10, 11),
  ]
  const notation = formatJapaneseTextWithSudachiTokens(
    text,
    tokens,
    0,
    {
      便: {
        surface: '便',
        dictionaryForm: '便',
        normalizedForm: '便',
        reading: 'びん',
        dictionaryReading: 'びん',
        partsOfSpeech: ['名詞'],
      },
    },
  )

  assert.equal(
    notation,
    '{交通|こうつう}の{便|べん}と{朝一番|あさいちばん}の{便|びん}。',
  )
  assert.deepEqual(
    parseRubyNotationToSegments(notation).filter(segment => segment.text === '便'),
    [
      { text: '便', reading: 'べん' },
      { text: '便', reading: 'びん' },
    ],
  )
  assert.equal(
    parseRubyNotationToSegments(notation)
      .map(segment => segment.text)
      .join(''),
    text,
  )
})

test('pronunciation domain: invalid token offsets fall back without changing source text', () => {
  const text = '交通の便'
  const notation = formatJapaneseTextWithSudachiTokens(
    text,
    [
      {
        surface: '便',
        dictionaryForm: '便',
        normalizedForm: '便',
        reading: 'べん',
        dictionaryReading: 'べん',
        partsOfSpeech: ['名詞'],
        textIndex: 0,
        begin: 3,
        end: 5,
      },
    ],
    0,
    {
      便: {
        surface: '便',
        dictionaryForm: '便',
        normalizedForm: '便',
        reading: 'びん',
        dictionaryReading: 'びん',
        partsOfSpeech: ['名詞'],
      },
    },
  )

  assert.equal(notation, '交通の{便|びん}')
  assert.equal(
    parseRubyNotationToSegments(notation).map(segment => segment.text).join(''),
    text,
  )
})

test('pronunciation domain: literal braces survive fallback parsing', () => {
  const text = '前{後}便'
  const notation = formatJapaneseTextWithSudachiTokens(
    text,
    [
      {
        surface: '違う',
        dictionaryForm: '違う',
        normalizedForm: '違う',
        reading: 'ちがう',
        dictionaryReading: 'ちがう',
        partsOfSpeech: ['動詞'],
        textIndex: 0,
        begin: 0,
        end: 2,
      },
    ],
    0,
    {},
  )

  assert.equal(notation, text)
  assert.equal(
    parseRubyNotationToSegments(notation).map(segment => segment.text).join(''),
    text,
  )
})

test('pronunciation domain: renderRubySegmentsHtml produces valid ruby markup', () => {
  const html = renderRubySegmentsHtml([
    { text: '辿', reading: 'たど' },
    { text: 'り' },
    { text: '着', reading: 'つ' },
    { text: 'く' },
  ])
  assert.equal(
    html,
    '<ruby>辿<rt aria-hidden="true" data-context-ignore="true">たど</rt></ruby>り<ruby>着<rt aria-hidden="true" data-context-ignore="true">つ</rt></ruby>く',
  )
})

test('pronunciation domain: cached readings align ruby to kanji only', () => {
  const ruby = (text, reading) =>
    `<ruby>${text}<rt aria-hidden="true" data-context-ignore="true">${reading}</rt></ruby>`
  const cases = [
    ['当たり', 'あたり', `${ruby('当', 'あ')}たり`],
    ['宝くじ', 'たからくじ', `${ruby('宝', 'たから')}くじ`],
    ['憧れる', 'あこがれる', `${ruby('憧', 'あこが')}れる`],
    ['食べる', 'たべる', `${ruby('食', 'た')}べる`],
    ['食べ物', 'たべもの', `${ruby('食', 'た')}べ${ruby('物', 'もの')}`],
    ['取り扱う', 'とりあつかう', `${ruby('取', 'と')}り${ruby('扱', 'あつか')}う`],
    ['お茶', 'おちゃ', `お${ruby('茶', 'ちゃ')}`],
    ['申し込む', 'もうしこむ', `${ruby('申', 'もう')}し${ruby('込', 'こ')}む`],
    ['サービス提供', 'さーびすていきょう', `サービス${ruby('提供', 'ていきょう')}`],
  ]

  for (const [surface, reading, expected] of cases) {
    const html = renderRubySegmentsHtml([{ text: surface, reading }])
    assert.equal(html, expected, `${surface} should align kana anchors`)
    assert.equal(
      html.replace(/<rt[^>]*>.*?<\/rt>/gu, '').replace(/<[^>]*>/gu, ''),
      surface,
    )
  }
})

test('pronunciation domain: materialized sentence ruby keeps vocabulary highlights', () => {
  const html = renderRubySegmentsHtml(
    [
      { text: '「すみません、' },
      { text: '今', reading: 'いま' },
      { text: 'は名刺を' },
      { text: '持', reading: 'も' },
      { text: 'ち' },
      { text: '合', reading: 'あ' },
      { text: 'わせておりませんで」' },
    ],
    {
      rubyClassName: 'jp-ruby',
      rtClassName: 'jp-ruby-rt',
      highlightClassName: 'vocab-highlight',
      highlightRanges: [{ start: 12, end: 18 }],
    },
  )

  assert.match(html, /<ruby class="jp-ruby">今<rt class="jp-ruby-rt"/)
  assert.match(html, /<span class="vocab-highlight">持<ruby|<span class="vocab-highlight"><ruby/)
  assert.match(html, /<span class="vocab-highlight">わせて<\/span>/)
  assert.doesNotMatch(html, /<ruby[^>]*>すみません/)
})

test('pronunciation domain: isPronunciationUpToDate validates version and payload', () => {
  assert.equal(
    isPronunciationUpToDate({
      pronunciationData: { segments: [{ text: '猫', reading: 'ねこ' }] },
      pronunciationVersion: PRONUNCIATION_VERSION,
    }),
    true,
  )

  // Older or missing version is NOT up to date
  assert.equal(
    isPronunciationUpToDate({
      pronunciationData: { segments: [{ text: '猫', reading: 'ねこ' }] },
      pronunciationVersion: 0,
    }),
    false,
  )
  assert.equal(
    isPronunciationUpToDate({
      pronunciationData: { segments: [{ text: '猫', reading: 'ねこ' }] },
      pronunciationVersion: null,
    }),
    false,
  )

  // Missing data is NOT up to date
  assert.equal(
    isPronunciationUpToDate({
      pronunciationData: null,
      pronunciationVersion: PRONUNCIATION_VERSION,
    }),
    false,
  )
})

test('pronunciation domain: normalizePronunciationData handles JSON string and objects', () => {
  const raw = JSON.stringify({
    segments: [{ text: '猫', reading: 'ねこ' }],
    reading: 'ねこ',
  })
  const normalized = normalizePronunciationData(raw)
  assert.deepEqual(normalized, {
    segments: [{ text: '猫', reading: 'ねこ' }],
    reading: 'ねこ',
  })

  // Invalid data returns null
  assert.equal(normalizePronunciationData('invalid-json{'), null)
  assert.equal(normalizePronunciationData({ segments: 'not-an-array' }), null)
})

test('pronunciation domain: zero request guarantee when cache is populated', () => {
  const visibleList = [
    {
      id: 'v1',
      word: '食べる',
      pronunciationData: {
        segments: [{ text: '食', reading: 'た' }, { text: 'べる' }],
      },
      pronunciationVersion: PRONUNCIATION_VERSION,
      sentences: [
        {
          id: 's1',
          text: 'ご飯を食べる。',
          pronunciationData: {
            segments: [
              { text: 'ご飯', reading: 'ごはん' },
              { text: 'を' },
              { text: '食', reading: 'た' },
              { text: 'べる。' },
            ],
          },
          pronunciationVersion: PRONUNCIATION_VERSION,
        },
      ],
    },
    {
      id: 'v2',
      word: '本',
      pronunciationData: {
        segments: [{ text: '本', reading: 'ほん' }],
      },
      pronunciationVersion: PRONUNCIATION_VERSION,
      sentences: [],
    },
  ]

  // Filter misses as useVocabularyPronunciation does
  const missingVocabIds = visibleList
    .filter(v => !isPronunciationUpToDate(v))
    .map(v => v.id)
  const missingSentenceIds = visibleList
    .flatMap(v => v.sentences || [])
    .filter(s => !isPronunciationUpToDate(s))
    .map(s => s.id)

  assert.equal(missingVocabIds.length, 0, 'No vocab misses on fully cached page')
  assert.equal(missingSentenceIds.length, 0, 'No sentence misses on fully cached page')
})

test('pronunciation cache version invalidates pre-contextual sentence data', () => {
  const data = { segments: [{ text: '便', reading: 'びん' }] }
  assert.equal(
    isPronunciationUpToDate({ pronunciationData: data, pronunciationVersion: 2 }),
    false,
  )
  assert.equal(
    isPronunciationUpToDate({
      pronunciationData: data,
      pronunciationVersion: PRONUNCIATION_VERSION,
    }),
    true,
  )
})

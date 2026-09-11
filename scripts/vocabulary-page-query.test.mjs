import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import {
  vocabularyGroupPageSql,
  vocabularySqlSourceTypes,
} from '../modules/knowledge/vocabulary/server/group-page-query.ts'
import { parseJsonStringList } from '../utils/text/jsonList.ts'
import {
  getVocabularyPartOfSpeechFilterOptions,
  matchesVocabularyPartsOfSpeech,
} from '../utils/vocabulary/partOfSpeech.ts'
import { normalizeVocabularyWord } from '../modules/knowledge/vocabulary/domain/normalized-word.ts'

const aliasHook = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@/')
      ? pathToFileURL(path.resolve(specifier.slice(2) + '.ts')).href
      : specifier, context)
  },
})
const { resolveVocabularyGroupName } = await import('../modules/knowledge/vocabulary/domain/language.ts')
aliasHook.deregister()

const defaults = {
  wordbookFilter: 'all', seriesFilter: '', tagFilter: 'all', keyword: '',
  groupFilter: '', posFilter: 'all', page: 1, pageSize: 30, focusId: '',
}
const samples = { kana: 'あ', hangul: '한', han: '中', cyrillic: 'я', other: 'a' }
const languageGroups = Object.fromEntries(Object.entries(samples).map(([script, word]) =>
  [script, resolveVocabularyGroupName({ word, sourceType: 'ARTICLE_TEXT' })],
))

test('every current source type uses the same language classification, independent of readings', () => {
  for (const sourceType of vocabularySqlSourceTypes) {
    for (const [script, word] of Object.entries(samples)) {
      for (const pronunciations of [[], ['せきゆ'], ['reading']]) {
        assert.equal(resolveVocabularyGroupName({ word, sourceType, pronunciations }), languageGroups[script])
      }
    }
  }
})

test('SQL binds user input instead of interpolating filter text', () => {
  const malicious = "x' OR true --"
  const query = vocabularyGroupPageSql(malicious, {
    ...defaults, keyword: malicious, tagFilter: malicious, wordbookFilter: malicious,
    groupFilter: malicious, posFilter: malicious, focusId: malicious,
  }, [{ raw: malicious, options: [malicious] }], languageGroups)
  assert.equal(query.text.includes(malicious), false)
  assert.ok(query.values.includes(malicious))
})

const normalizeWord = normalizeVocabularyWord

test('vocabulary grouping keys are materialized with JavaScript NFKC semantics', () => {
  assert.equal(normalizeVocabularyWord('\ufeff ＡＢＣ\u00a0'), 'abc')
  assert.equal(normalizeVocabularyWord('ｶﾀｶﾅ'), 'カタカナ')
  const query = vocabularyGroupPageSql('user', defaults, [], languageGroups)
  assert.match(query.text, /normalized_word/)
  assert.doesNotMatch(query.text, /normalize\s*\(/i)
})

function reference(rows, input) {
  const groups = new Map()
  for (const row of rows) {
    const key = normalizeWord(row.word)
    const partsOfSpeech = parseJsonStringList(row.partsOfSpeech)
    const current = groups.get(key)
    if (current) {
      current.ids.push(row.id)
      current.partsOfSpeech = [...new Set([...current.partsOfSpeech, ...partsOfSpeech])]
    } else {
      groups.set(key, {
        word: row.word, ids: [row.id], partsOfSpeech,
        groupName: resolveVocabularyGroupName({ ...row, pronunciations: parseJsonStringList(row.pronunciations) }),
      })
    }
  }
  const all = [...groups.values()]
  const availablePosFilters = getVocabularyPartOfSpeechFilterOptions(all
    .filter(group => !input.groupFilter || group.groupName === input.groupFilter)
    .flatMap(group => group.partsOfSpeech)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  const posFilter = input.posFilter === 'all' || availablePosFilters.includes(input.posFilter) ? input.posFilter : 'all'
  const posFiltered = all.filter(group => matchesVocabularyPartsOfSpeech(group.partsOfSpeech, posFilter))
  const totalsMap = new Map()
  for (const group of posFiltered) totalsMap.set(group.groupName, (totalsMap.get(group.groupName) || 0) + 1)
  const visible = posFiltered.filter(group => !input.groupFilter || group.groupName === input.groupFilter)
  const focusIndex = input.focusId ? visible.findIndex(group => group.ids.includes(input.focusId)) : -1
  const normalizedPage = focusIndex >= 0 ? Math.floor(focusIndex / input.pageSize) + 1
    : Math.min(input.page, Math.max(1, Math.ceil(visible.length / input.pageSize)))
  return {
    pageGroups: visible.slice((normalizedPage - 1) * input.pageSize, normalizedPage * input.pageSize).map(({ word }) => ({ word })),
    totals: [...totalsMap].map(([groupName, count]) => ({ groupName, count })),
    availablePosFilters, posFilter, totalCount: visible.length, normalizedPage, scannedRows: rows.length,
  }
}

// Opt-in integration checks use session-local temporary tables only. They never
// mutate the application's rows and run on PostgreSQL's actual Unicode/SQL engine.
test('PostgreSQL pagination matches the original grouping and filtering semantics', {
  skip: process.env.VOCABULARY_QUERY_DATABASE_TEST !== '1',
}, async t => {
  const { default: dotenv } = await import('dotenv')
  const { default: pg } = await import('pg')
  dotenv.config({ path: ['.env.local', '.env'], quiet: true })
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    for (const table of ['Vocabulary', 'wordbook_series', 'wordbooks', 'wordbook_vocabularies', 'VocabularyTag', 'VocabularyTagOnVocabulary']) {
      await client.query(`CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS) ON COMMIT DROP`)
    }
    const words = [
      'ＡＢＣ', 'abc', 'ｶﾀｶﾅ', 'カタカナ', 'ΟΣ', 'ος', 'İ', 'i\u0307', '𐐀', '𐐨',
      '\ufeffWord\u00a0', 'word', '神', '神', '\u3040', '\u30ff', '\uac00', '\ud7af',
      '\u4e00', '\u9fff', '\u0400', '\u04ff', '', '😀', '石油',
      ...Array.from({ length: 70 }, (_, i) => `単語${i}`),
    ]
    const posValues = [null, '["名词"]', '["複合動詞"]', '["い形容詞"]', '["な形容詞"]',
      '[" 名詞 ","副詞"]', 'bad-json', 'null', '[null,42,true,{},["名词"]]', '["all"]']
    const records = words.map((word, i) => ({
      id: `fixture-${i}`, userId: 'default', word,
      partsOfSpeech: posValues[i % posValues.length],
      sourceType: vocabularySqlSourceTypes[i % vocabularySqlSourceTypes.length],
      pronunciations: '["あ"]', meanings: i % 2 ? '["meaning"]' : null,
      createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, i)),
      entryOrder: 100 - i,
      books: i % 3 === 0 ? (i % 6 === 0 ? ['book', 'book-next'] : ['book']) : i % 3 === 1 ? ['book-next'] : [],
      tags: i % 2 ? ['tag'] : [],
    }))
    records.push({ ...records[0], id: 'other-user', userId: 'mine', word: 'PRIVATE' })
    for (const record of records) {
      await client.query(`INSERT INTO "Vocabulary" (id, user_id, word, normalized_word, "sourceType", "sourceId", pronunciations, "partsOfSpeech", meanings, "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5,'fixture',$6,$7,$8,$9,$9)`, [record.id, record.userId, record.word, normalizeWord(record.word), record.sourceType, record.pronunciations, record.partsOfSpeech, record.meanings, record.createdAt])
    }
    await client.query(`INSERT INTO wordbook_series (id,user_id,title,"updatedAt") VALUES ('series','default','Series',now())`)
    for (const id of ['book', 'book-next']) {
      await client.query('INSERT INTO wordbooks (id,user_id,title,series_id,"updatedAt") VALUES ($1,\'default\',$1,\'series\',now())', [id])
    }
    await client.query(`UPDATE wordbooks SET "sortOrder" = 1 WHERE id = 'book-next'`)
    await client.query(`INSERT INTO "VocabularyTag" (id,user_id,name) VALUES ('tag','default','tag')`)
    for (const record of records) {
      for (const book of record.books) await client.query('INSERT INTO wordbook_vocabularies (id,wordbook_id,vocabulary_id,sort_order,updated_at) VALUES ($1,$2,$3,$4,now())', [`${record.id}-${book}`, book, record.id, record.entryOrder])
      for (const tag of record.tags) await client.query('INSERT INTO "VocabularyTagOnVocabulary" ("vocabularyId","tagId") VALUES ($1,$2)', [record.id, tag])
    }
    const scenarios = [
      {}, { page: 2 }, { page: 999 }, { page: 1e20 }, { focusId: 'fixture-0' },
      { focusId: 'fixture-1' }, { focusId: 'fixture-70' },
      { focusId: 'not-found' }, { focusId: 'other-user' },
      ...['日语', '英语', '中文', '韩语', '未分类', 'missing'].map(groupFilter => ({ groupFilter })),
      ...['名詞', '動詞', '形容詞', 'い形容詞', 'unknown'].map(posFilter => ({ posFilter })),
      { groupFilter: '英语', posFilter: '形容詞' },
      { wordbookFilter: 'none' }, { wordbookFilter: 'book' }, { wordbookFilter: 'book-next' },
      { wordbookFilter: 'series:series', seriesFilter: 'series' }, { wordbookFilter: 'missing' },
      { tagFilter: 'tag' }, { tagFilter: 'missing' }, { keyword: 'meaning' },
      { keyword: 'あ' }, { keyword: '%' }, { keyword: '_' }, { keyword: 'unmatched' },
      { wordbookFilter: 'book', focusId: 'fixture-69' },
      { wordbookFilter: 'book', tagFilter: 'tag', keyword: '単語', posFilter: '名詞', focusId: 'fixture-75' },
    ]
    const like = (text, keyword) => {
      const pattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('%', '.*').replaceAll('_', '.')
      return text !== null && new RegExp(pattern, 's').test(text)
    }
    for (const userId of ['default', 'mine', 'missing']) {
      for (const scenario of scenarios) {
        await t.test(`${userId}: ${JSON.stringify(scenario)}`, async () => {
          const input = { ...defaults, ...scenario }
          const rows = records.filter(row => row.userId === userId)
            .filter(row => input.wordbookFilter === 'all' || (input.wordbookFilter === 'none'
              ? row.books.length === 0
              : input.seriesFilter ? row.books.length > 0 : userId === 'default' && row.books.includes(input.wordbookFilter)))
            .filter(row => input.tagFilter === 'all' || row.tags.includes(input.tagFilter))
            .filter(row => !input.keyword || [row.word, row.pronunciations, row.meanings].some(value => like(value, input.keyword)))
            .sort((a, b) => {
              const rank = row => {
                if (userId !== 'default') return Number.MAX_SAFE_INTEGER
                const book = ['book', 'book-next'].findIndex(id => row.books.includes(id))
                return book < 0 ? Number.MAX_SAFE_INTEGER : book * 10000 + row.entryOrder
              }
              const order = input.wordbookFilter === 'all' || input.seriesFilter
                ? rank(a) - rank(b)
                : input.wordbookFilter !== 'none' ? a.entryOrder - b.entryOrder : 0
              return order || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
            })
          const dictionary = [...new Set(rows.map(row => row.partsOfSpeech))].map(raw => ({
            raw, options: getVocabularyPartOfSpeechFilterOptions(parseJsonStringList(raw)),
          }))
          const query = vocabularyGroupPageSql(userId, input, dictionary, languageGroups)
          const { rows: [actual] } = await client.query(query.text, query.values)
          actual.availablePosFilters.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
          assert.deepEqual(actual, reference(rows, input))
        })
      }
    }
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { formatQuestionSectionHeading, normalizeQuestionSectionTitle } from '../modules/questions/domain/section-heading.ts'
import { buildAnswerCardSections } from '../modules/practice/domain/answer-card-sections.ts'

test('section headings display the number once for bare, imported and repeated titles', () => {
  for (const title of ['概要理解', '問題3 · 概要理解', '問題3｜概要理解', '問題3｜問題3 · 概要理解', '問題３：概要理解', '问题3・概要理解']) {
    assert.equal(formatQuestionSectionHeading(title, 3), '問題3｜概要理解')
    assert.equal(normalizeQuestionSectionTitle(title, 3), '概要理解')
  }
  assert.equal(formatQuestionSectionHeading('問題3', 3), '問題3')
})

test('custom names, different numbers and English titles remain intact', () => {
  assert.equal(normalizeQuestionSectionTitle('問題30 · 独自題型', 3), '問題30 · 独自題型')
  assert.equal(normalizeQuestionSectionTitle('問題3｜内容理解（短文）', 3), '内容理解（短文）')
  assert.equal(formatQuestionSectionHeading('Part 3 · Conversations', null), 'Part 3 · Conversations')
  assert.equal(formatQuestionSectionHeading('独自題型', null), '独自題型')
})

test('answer card shares clean titles without changing question order or local numbers', () => {
  const questions = [1, 2].map(i => ({id: `q${i}`, questionType: 'LISTENING', lessonId: `l${i}`, lesson: {sectionNumber: 3, sectionTitle: '問題3 · 概要理解'}}))
  const [section] = buildAnswerCardSections(questions, 'ja')
  assert.equal(section.sectionTitle, '概要理解')
  assert.deepEqual(section.items.map(item => [item.question.id, item.localNumber]), [['q1', 1], ['q2', 2]])
  const [english] = buildAnswerCardSections([{id:'en', questionType:'TOEIC_CONVERSATIONS', lessonId:'en'}], 'en')
  assert.equal(english.sectionTitle, 'Part 3 · Conversations')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { evaluateSelectedOption } from '../modules/practice/domain/evaluate-attempt.ts'
import { evaluateSortingOrder, resolveCorrectOrderIds } from '../modules/questions/domain/sorting.ts'
import { parseSortingPrompt } from '../modules/practice/domain/question-text.ts'

const source = await readFile(new URL('../modules/practice/server/attempt-service.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
function harness() {
  let state = { session: { id: 'session', userId: 'alice', questionIds: ['q1', 'q2', 'qsort'], completedAt: null, answers: {}, sortingOrders: {} }, attempts: [], retries: 0 }
  let fail = false
  let queue = Promise.resolve()
  const db = {
    customPracticeSession: { findFirst: async ({where}) => state.session.userId === where.userId && state.session.id === where.id ? structuredClone(state.session) : null },
    question: { findMany: async ({where}) => where.id.in.map(id => id === 'qsort'
      ? {id,questionType:'SORTING',prompt:'[[sort]][[sort:star]][[sort]]',content:{sortingOrder:[2,0,1]},options:[{id:'piece-b'},{id:'piece-c'},{id:'piece-a'}]}
      : {id,options:[{id:'yes',isCorrect:true},{id:'no',isCorrect:false}]}) },
    $transaction: operation => {
      const result = queue.then(async () => {
        const before = structuredClone(state)
        try {
          return await operation({
            customPracticeSession: {updateMany: async ({where,data}) => {
              assert.equal(where.userId, 'alice')
              assert.equal(where.completedAt, null)
              if (state.session.completedAt) return {count:0}
              Object.assign(state.session, data)
              return {count:1}
            }},
            questionAttempt: {createMany: async ({data}) => {
              if (fail) throw new Error('database unavailable')
              assert.ok(data.every(item => item.userId === 'alice'))
              state.attempts.push(...data)
            }},
            questionRetry: {upsert: async () => { state.retries++ }},
          })
        } catch (error) { state = before; throw error }
      })
      queue = result.catch(() => {})
      return result
    },
  }
  const exports = {}
  vm.runInNewContext(compiled, {exports, require: name => {
    if (name === '@/lib/prisma') return {default:db, __esModule:true}
    if (name === '@/modules/users/server/current-user') return {getCurrentUserId:async () => 'alice'}
    if (name === '@/lib/repositories/materials') return {normalizeQuestionOptions: options => options}
    if (name === '@/modules/practice/domain/evaluate-attempt') return {evaluateSelectedOption}
    if (name === '@/modules/questions/domain/sorting') return {evaluateSortingOrder,resolveCorrectOrderIds}
    if (name === '@/modules/practice/domain/question-text') return {parseSortingPrompt}
    if (name === '@/lib/codecs/question-content') return {decodeQuestionContent:value => value}
    return {}
  }, Date, Map, Set})
  return {record: inputs => exports.recordQuizAttempts(inputs, {customSessionId:'session'}), state: () => state, fail: value => {fail=value}}
}
const answer = (questionId='q1', selectedOptionId='yes') => ({questionId,selectedOptionId,timeSpentMs:100})
test('completion retains partial answers and repeated submission creates no duplicate history', async () => {
  const h = harness()
  await h.record([answer()])
  assert.ok(h.state().session.completedAt)
  assert.equal(h.state().session.answers.q1,'yes')
  assert.equal(h.state().session.answers.q2,undefined)
  assert.equal((await h.record([answer()])).alreadyCompleted,true)
  assert.equal(h.state().attempts.length,1)
})
test('concurrent submission records attempts and retry counts once', async () => {
  const h = harness()
  await Promise.all([h.record([answer('q1','no')]),h.record([answer('q1','no')])])
  assert.equal(h.state().attempts.length,1)
  assert.equal(h.state().retries,1)
})
test('database failure rolls back completion and permits retry', async () => {
  const h=harness(); h.fail(true)
  await assert.rejects(h.record([answer()]),/database unavailable/)
  assert.equal(h.state().session.completedAt,null)
  assert.equal(h.state().attempts.length,0)
  h.fail(false); await h.record([answer()])
  assert.ok(h.state().session.completedAt)
})
test('foreign sessions, foreign questions and invalid options cannot be completed', async () => {
  const h=harness()
  h.state().session.userId='bob'
  await assert.rejects(h.record([answer()]),/自定义练习不存在/)
  h.state().session.userId='alice'
  await assert.rejects(h.record([answer('other')]),/不属于/)
  await assert.rejects(h.record([answer('q1','invalid')]),/答案无效/)
  assert.equal(h.state().session.completedAt,null)
})
test('empty submission is completed without inventing answers', async () => {
  const h=harness(); await h.record([])
  assert.ok(h.state().session.completedAt)
  assert.equal(Object.keys(h.state().session.answers).length,0)
  assert.equal(h.state().attempts.length,0)
})
test('sorting submission derives the starred option from the complete option-id order', async () => {
  const h = harness()
  const selectedOrder = ['piece-a', 'piece-b', 'piece-c']
  const result = await h.record([{questionId:'qsort',selectedOptionId:'piece-c',selectedOrder,timeSpentMs:100}])
  assert.equal(result.results[0].isCorrect,true)
  assert.equal(result.results[0].selectedOptionId,'piece-b')
  assert.deepEqual(h.state().session.sortingOrders.qsort,selectedOrder)
  assert.deepEqual(h.state().attempts[0].selectedOrder,selectedOrder)
})

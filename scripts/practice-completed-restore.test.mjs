import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { summarizePracticeSubmission } from '../modules/practice/domain/submission-summary.ts'
const source=await readFile(new URL('../modules/practice/hooks/usePracticeSession.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function restore(initialSubmitted) {
  const effects=[], states=[]
  let reads=0
  const react={
    useState: initial => {const index=states.length; states.push(initial); return [initial,value=>{states[index]=value}]},
    useCallback: fn=>fn, useMemo: fn=>fn(),useRef: value=>({current:value}),useEffect: fn=>{effects.push(fn)},
  }
  const exports={}
  vm.runInNewContext(compiled,{exports,Date,Set,window:{localStorage:{removeItem(){},setItem(){}}},require:name=>{
    if(name==='react') return react
    if(name.includes('submission-summary')) return {summarizePracticeSubmission}
    if(name.includes('UserContext')) return {useCurrentUser:()=>({id:'alice'}),userStorageKey:(id,key)=>`${id}:${key}`,readUserStorageValue:id=>{
      assert.equal(id,'alice');reads++;return JSON.stringify({version:2,answers:{q1:'old'},currentQuestionId:'q2'})
    }}
    throw new Error(name)
  }})
  const session=exports.usePracticeSession([{id:'q1',options:[{id:'old'},{id:'saved',isCorrect:true}]},{id:'q2',options:[]}],0,{draftKey:'custom:session',initialSubmitted,initialAnswers:{q1:'saved'}})
  effects[0]()
  return {session,states,reads}
}
test('completed server answers take priority over stale local drafts on refresh',()=>{
  const {session,states,reads}=restore(true)
  assert.equal(reads,0)
  assert.equal(states[1].q1,'saved')
  assert.equal(session.isSubmitted,true)
  assert.equal(session.submittedCount,1)
  assert.equal(session.unansweredCount,1)
  assert.equal(session.isQuestionSubmitted('q1'),true)
  assert.equal(session.isQuestionSubmitted('q2'),false)
})
test('unfinished practice still restores the current user draft',()=>{
  const {states,reads}=restore(false)
  assert.equal(reads,1)
  assert.equal(states[1].q1,'old')
  assert.equal(states[0],1)
})

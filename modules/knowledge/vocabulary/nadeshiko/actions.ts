'use server'

import { revalidatePath } from 'next/cache'
import { actionSuccess, executeAction } from '@/lib/actions/result'
import { addExample, searchExamples } from './server/service'
import { NadeshikoError } from './server/client'
import type { NadeshikoSearchItem, NadeshikoSearchState } from './domain'

export async function searchNadeshikoExamples(input: unknown): Promise<{
  state: NadeshikoSearchState
  examples: NadeshikoSearchItem[]
  message?: string
}> {
  try {
    const examples = await searchExamples(input)
    return { state: examples.length ? 'success' : 'empty', examples }
  } catch (error) {
    return {
      state: error instanceof NadeshikoError ? error.state : 'error',
      examples: [],
      message: error instanceof NadeshikoError ? error.message : '无法获取动漫例句',
    }
  }
}

export async function addNadeshikoExample(input: unknown) {
  const result = await executeAction(async () => {
    const link = await addExample(input)
    return { linkId: link.id }
  }, { fallbackMessage: '无法添加例句，请重新搜索后重试' })
  if (!result.success) return result
  revalidatePath('/vocabulary')
  return actionSuccess({ linkId: result.linkId })
}

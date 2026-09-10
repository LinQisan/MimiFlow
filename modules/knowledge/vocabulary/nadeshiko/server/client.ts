import 'server-only'

import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { mapNadeshikoResponse, type NadeshikoExample } from '../domain'

export class NadeshikoError extends Error {
  constructor(readonly state: 'error' | 'not-configured' | 'rate-limited', message: string) {
    super(message)
  }
}

// Cache only successful external results, never database membership or failures.
// Match the repository's existing Next cache setup; Cache Components is not enabled.
// Hash the credential to isolate changed API accounts without putting a key in cache arguments.
export async function searchNadeshiko(query: string): Promise<NadeshikoExample[]> {
  const apiKey = process.env.NADESHIKO_API_KEY?.trim()
  if (!apiKey) throw new NadeshikoError('not-configured', 'Nadeshiko API 尚未配置')
  const credentialScope = createHash('sha256').update(apiKey).digest('hex')
  const search = unstable_cache(async (searchTerm: string) => {
    try {
      const response = await fetch('https://api.nadeshiko.co/v1/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: { search: searchTerm, exactMatch: false },
          take: 20,
          filters: { languages: [] },
          include: ['media'],
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
      if (response.status === 429) {
        throw new NadeshikoError('rate-limited', '请求次数已达到限制，请稍后再试')
      }
      if (response.status === 401 || response.status === 403) {
        throw new NadeshikoError('error', 'Nadeshiko 认证失败，请检查 API Key 配置')
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return mapNadeshikoResponse(await response.json())
    } catch (error) {
      if (error instanceof NadeshikoError) throw error
      // Do not log response bodies, requests, credentials, or arbitrary error messages.
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Nadeshiko] Search failed:', error instanceof Error ? error.name : 'UnknownError')
      }
      throw new NadeshikoError('error', '无法获取动漫例句，请稍后再试')
    }
  }, ['nadeshiko-search-v1', credentialScope], { revalidate: 6 * 60 * 60 })
  return search(query.trim())
}

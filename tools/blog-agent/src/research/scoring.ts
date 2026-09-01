import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { paths } from '../config/paths.js'
import type { CollectedTopic } from './sources.js'

export type KeywordMap = Record<string, string[]>

export async function readDiscoveryKeywords(
  file = path.join(paths.agent, 'config', 'discovery-keywords.json')
): Promise<KeywordMap> {
  return JSON.parse(await readFile(file, 'utf8')) as KeywordMap
}

export function scoreCollectedTopic(
  item: CollectedTopic,
  keywords: KeywordMap,
  now = new Date()
): CollectedTopic {
  const haystack = item.title.toLowerCase()
  const categoryKeywords = keywords[item.category] ?? []
  const matches = categoryKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase()))
  const allMatches = Object.values(keywords)
    .flat()
    .filter((keyword) => haystack.includes(keyword.toLowerCase()))
  const ageHours = item.publishedAt
    ? Math.max(0, (now.getTime() - Date.parse(item.publishedAt)) / 3_600_000)
    : 72
  const freshness = Math.max(0, 20 - Math.min(20, ageHours / 16))
  const specificity = Math.min(15, Math.max(0, item.title.split(/\s+/).length - 4))
  const score = Math.min(
    100,
    Math.round(
      item.trustWeight * 35 + matches.length * 12 + allMatches.length * 4 + freshness + specificity
    )
  )
  return { ...item, relevanceScore: score }
}

export function filterAndScoreTopics(
  items: readonly CollectedTopic[],
  keywords: KeywordMap,
  now = new Date(),
  minimumScore = 30
): CollectedTopic[] {
  return items
    .map((item) => scoreCollectedTopic(item, keywords, now))
    .filter((item) => item.relevanceScore >= minimumScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
}

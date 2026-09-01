import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { paths } from '../config/paths.js'

export interface TopicSourceConfig {
  name: string
  url: string
  type: 'rss' | 'json'
  category: string
  enabled: boolean
  trustWeight: number
  maxItems?: number
}

export interface CollectedTopic {
  title: string
  url: string
  sourceName: string
  category: string
  publishedAt?: string
  trustWeight: number
  relevanceScore: number
}

export interface SourceCollectionResult {
  items: CollectedTopic[]
  attempted: number
  succeeded: number
  failures: string[]
  allFailed: boolean
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_AGE_DAYS = 14
const DEFAULT_MAX_ITEMS = 12

const decodeXml = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim()

const tag = (block: string, name: string): string | undefined => {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return match?.[1] ? decodeXml(match[1]) : undefined
}

function normalizeUrl(value: string, base: string): string | undefined {
  try {
    const url = new URL(value, base)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function parseRss(text: string, source: TopicSourceConfig): CollectedTopic[] {
  const blocks = [...text.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map(
    (m) => m[0]
  )
  return blocks.flatMap((block) => {
    const title = tag(block, 'title')
    const href = tag(block, 'link') ?? block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]
    const url = href ? normalizeUrl(href, source.url) : undefined
    if (!title || !url) return []
    const date =
      tag(block, 'published') ??
      tag(block, 'updated') ??
      tag(block, 'pubDate') ??
      tag(block, 'dc:date')
    return [
      {
        title,
        url,
        sourceName: source.name,
        category: source.category,
        publishedAt: date,
        trustWeight: source.trustWeight,
        relevanceScore: 0,
      },
    ]
  })
}

function parseJson(text: string, source: TopicSourceConfig): CollectedTopic[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const records = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? ((parsed as { items?: unknown[]; entries?: unknown[] }).items ??
        (parsed as { entries?: unknown[] }).entries ??
        [])
      : []
  return records.flatMap((record) => {
    if (!record || typeof record !== 'object') return []
    const item = record as Record<string, unknown>
    const title =
      typeof item.title === 'string'
        ? item.title.trim()
        : typeof item.name === 'string'
          ? item.name.trim()
          : ''
    const rawUrl =
      typeof item.url === 'string'
        ? item.url
        : typeof item.link === 'string'
          ? item.link
          : source.url
    const url = normalizeUrl(rawUrl, source.url)
    if (!title || !url) return []
    const date =
      typeof item.publishedAt === 'string'
        ? item.publishedAt
        : typeof item.publishedDate === 'string'
          ? item.publishedDate
          : undefined
    return [
      {
        title,
        url,
        sourceName: source.name,
        category: source.category,
        publishedAt: date,
        trustWeight: source.trustWeight,
        relevanceScore: 0,
      },
    ]
  })
}

export function parseSourcePayload(text: string, source: TopicSourceConfig): CollectedTopic[] {
  return source.type === 'json' ? parseJson(text, source) : parseRss(text, source)
}

export async function readTopicSources(
  file = path.join(paths.agent, 'config', 'topic-sources.json')
): Promise<TopicSourceConfig[]> {
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('topic-sources.json must contain an array')
  return parsed.filter((item): item is TopicSourceConfig => {
    if (!item || typeof item !== 'object') return false
    const source = item as Partial<TopicSourceConfig>
    return (
      typeof source.name === 'string' &&
      typeof source.url === 'string' &&
      (source.type === 'rss' || source.type === 'json') &&
      typeof source.category === 'string' &&
      typeof source.trustWeight === 'number'
    )
  })
}

export async function collectSource(
  source: TopicSourceConfig,
  now = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<CollectedTopic[]> {
  if (!source.enabled) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetchImpl(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'akash-blog-topic-agent/1.0' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error('response exceeds 2MB limit')
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES)
      throw new Error('response exceeds 2MB limit')
    const cutoff = now.getTime() - DEFAULT_MAX_AGE_DAYS * 86_400_000
    const maxItems = source.maxItems ?? DEFAULT_MAX_ITEMS
    return parseSourcePayload(text, source)
      .filter(
        (item) =>
          !item.publishedAt ||
          (Date.parse(item.publishedAt) >= cutoff && !Number.isNaN(Date.parse(item.publishedAt)))
      )
      .slice(0, maxItems)
  } finally {
    clearTimeout(timeout)
  }
}

export async function collectTopics(
  now = new Date(),
  sources: TopicSourceConfig[] | undefined = undefined,
  fetchImpl: typeof fetch = fetch
): Promise<SourceCollectionResult> {
  const configuredSources = sources ?? (await readTopicSources())
  const enabled = configuredSources.filter((source) => source.enabled)
  const failures: string[] = []
  const dedup = new Map<string, CollectedTopic>()
  let succeeded = 0
  const results: Array<{ source: TopicSourceConfig; items?: CollectedTopic[]; error?: unknown }> =
    []
  for (let i = 0; i < enabled.length; i += 4) {
    const batch = enabled.slice(i, i + 4)
    results.push(
      ...(await Promise.all(
        batch.map(async (source) => {
          try {
            return { source, items: await collectSource(source, now, fetchImpl) }
          } catch (error) {
            return { source, error }
          }
        })
      ))
    )
  }
  for (const result of results) {
    if (result.error) {
      failures.push(
        `${result.source.name}: ${result.error instanceof Error ? result.error.message : String(result.error)}`
      )
      continue
    }
    succeeded++
    for (const item of result.items ?? []) {
      const key = item.url.toLowerCase()
      const titleKey = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
      if (
        !dedup.has(key) &&
        ![...dedup.values()].some(
          (existing) =>
            existing.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, ' ')
              .trim() === titleKey
        )
      )
        dedup.set(key, item)
    }
  }
  return {
    items: [...dedup.values()],
    attempted: enabled.length,
    succeeded,
    failures,
    allFailed: enabled.length > 0 && succeeded === 0,
  }
}

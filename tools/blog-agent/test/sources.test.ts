import { describe, expect, it } from 'vitest'

import { filterAndScoreTopics } from '../src/research/scoring.js'
import {
  collectTopics,
  parseSourcePayload,
  type TopicSourceConfig,
} from '../src/research/sources.js'

const rssSource: TopicSourceConfig = {
  name: 'TypeScript',
  url: 'https://example.com/feed.xml',
  type: 'rss',
  category: 'typescript-javascript',
  trustWeight: 1,
  enabled: true,
}

const jsonSource: TopicSourceConfig = {
  name: 'JSON feed',
  url: 'https://example.com/topics.json',
  type: 'json',
  category: 'security',
  trustWeight: 0.9,
  enabled: true,
}

describe('topic source collection', () => {
  it('parses RSS and Atom-style entries', () => {
    const items = parseSourcePayload(
      '<feed><entry><title><![CDATA[TypeScript 6 release]]></title><link href="/releases/6"/><updated>2026-09-01T00:00:00Z</updated></entry></feed>',
      rssSource
    )
    expect(items[0]).toMatchObject({
      title: 'TypeScript 6 release',
      url: 'https://example.com/releases/6',
      sourceName: 'TypeScript',
    })
  })

  it('parses JSON arrays and skips malformed records', () => {
    const items = parseSourcePayload(
      JSON.stringify([{ title: 'CVE update', url: 'https://example.com/cve' }, { nope: true }]),
      jsonSource
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.category).toBe('security')
  })

  it('continues after a source failure and deduplicates URLs and titles', async () => {
    const sources = [
      rssSource,
      { ...rssSource, name: 'Broken', url: 'https://bad.example/feed.xml' },
    ]
    const fetchImpl = async (url: string) => {
      if (url.includes('bad')) throw new Error('offline')
      return new Response(
        '<rss><item><title>TypeScript release</title><link>https://example.com/release</link></item><item><title>TypeScript release</title><link>https://example.com/other</link></item></rss>'
      )
    }
    const result = await collectTopics(
      new Date('2026-09-02T00:00:00Z'),
      sources,
      fetchImpl as typeof fetch
    )
    expect(result.succeeded).toBe(1)
    expect(result.failures).toHaveLength(1)
    expect(result.items).toHaveLength(1)
  })
})

describe('topic relevance scoring', () => {
  it('rewards trusted, fresh, category-matching topics', () => {
    const [item] = filterAndScoreTopics(
      [
        {
          title: 'TypeScript compiler release',
          url: 'https://example.com/ts',
          sourceName: 'official',
          category: 'typescript-javascript',
          trustWeight: 1,
          publishedAt: '2026-09-01T00:00:00Z',
          relevanceScore: 0,
        },
      ],
      { 'typescript-javascript': ['typescript', 'compiler'] },
      new Date('2026-09-02T00:00:00Z')
    )
    expect(item?.relevanceScore).toBeGreaterThan(30)
  })

  it('rejects low-signal titles before Gemini enrichment', () => {
    const items = filterAndScoreTopics(
      [
        {
          title: 'Weekly update',
          url: 'https://example.com/weekly',
          sourceName: 'unknown',
          category: 'security',
          trustWeight: 0.2,
          relevanceScore: 0,
        },
      ],
      { security: ['cve', 'vulnerability'] },
      new Date('2026-09-02T00:00:00Z')
    )
    expect(items).toHaveLength(0)
  })
})

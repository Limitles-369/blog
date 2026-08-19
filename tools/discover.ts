import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import Parser from 'rss-parser'
import matter from 'gray-matter'

export interface QueueEntry {
  id: string
  title: string
  angle: string
  dedupText: string
  textHash: string
  tags: string[]
  score: number
  sources: string[]
  discoveredAt: string
  attempts: number
  status?: string
}

export interface QueueFile {
  version: number
  entries: QueueEntry[]
}

const RSS_FEEDS = [
  { name: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
  { name: 'Reddit Programming', url: 'https://www.reddit.com/r/programming/.rss' },
  { name: 'Hacker News Frontpage RSS', url: 'https://hnrss.org/frontpage' },
  { name: 'Dev.to Feed', url: 'https://dev.to/feed' },
]

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'PersonalBlog-TopicDiscovery/1.0',
  },
})

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while',
    'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'upon', 'down',
    'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should',
  ])
  const words = normalizeTitle(text).split(' ')
  return new Set(words.filter((w) => w.length > 2 && !stopWords.has(w)))
}

function JaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

async function getExistingTitles(repoRoot: string): Promise<{ titles: string[]; titleTokens: Set<string>[] }> {
  const titles: string[] = []
  const blogDir = path.join(repoRoot, 'data', 'blog')

  try {
    const files = await fs.readdir(blogDir)
    for (const file of files) {
      if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue
      const content = await fs.readFile(path.join(blogDir, file), 'utf8')
      const parsed = matter(content)
      if (parsed.data.title && typeof parsed.data.title === 'string') {
        titles.push(parsed.data.title)
      } else {
        // Fallback to filename slug as title proxy
        titles.push(file.replace(/\.mdx?$/, '').replace(/-/g, ' '))
      }
    }
  } catch (err) {
    console.warn(`[discover] Warning reading ${blogDir}:`, err instanceof Error ? err.message : String(err))
  }

  const titleTokens = titles.map((t) => tokenize(t))
  return { titles, titleTokens }
}

async function loadQueueFile(queuePath: string): Promise<QueueFile> {
  try {
    const raw = await fs.readFile(queuePath, 'utf8')
    const parsed = JSON.parse(raw) as QueueFile
    if (Array.isArray(parsed.entries)) return parsed
  } catch {
    // Missing or invalid is fine, return default structure
  }
  return { version: 1, entries: [] }
}

async function saveQueueFile(queuePath: string, queue: QueueFile): Promise<void> {
  await fs.mkdir(path.dirname(queuePath), { recursive: true })
  const tmp = `${queuePath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(queue, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, queuePath)
}

export async function runTopicDiscovery(repoRoot = process.cwd()): Promise<{ added: number; total: number }> {
  console.log('==================================================')
  console.log('APEX AUTOMATION // TOPIC DISCOVERY ENGINE')
  console.log('==================================================')

  const { titles: existingTitles, titleTokens: existingTokens } = await getExistingTitles(repoRoot)
  console.log(`[discover] Found ${existingTitles.length} existing blog post(s) in data/blog/`)

  const queuePaths = [
    path.join(repoRoot, 'src', 'state', 'queue.json'),
    path.join(repoRoot, 'tools', 'blog-agent', '.artifacts', 'state', 'state', 'queue.json'),
  ]

  let primaryQueuePath = queuePaths[0]!
  let queue = await loadQueueFile(primaryQueuePath)

  // Seed existing titles/tokens with items already in queue
  const queuedTitles = queue.entries.map((e) => e.title)
  const queuedTokens = queuedTitles.map((t) => tokenize(t))

  const allTokens = [...existingTokens, ...queuedTokens]
  const allNormalizedTitles = new Set([...existingTitles, ...queuedTitles].map((t) => normalizeTitle(t)))

  const newEntries: QueueEntry[] = []
  const now = new Date().toISOString()

  for (const feedConfig of RSS_FEEDS) {
    console.log(`[discover] Fetching RSS feed: ${feedConfig.name} (${feedConfig.url})`)
    try {
      const feed = await parser.parseURL(feedConfig.url)
      for (const item of feed.items) {
        if (!item.title) continue
        const title = item.title.trim()
        const normTitle = normalizeTitle(title)

        // Exact or normalized title match check
        if (allNormalizedTitles.has(normTitle)) continue

        // Token overlap check (Jaccard similarity > 0.6)
        const itemTokens = tokenize(title)
        let isDup = false
        for (const existingTok of allTokens) {
          if (JaccardSimilarity(itemTokens, existingTok) > 0.6) {
            isDup = true
            break
          }
        }
        if (isDup) continue

        // Mark title as seen for this batch
        allNormalizedTitles.add(normTitle)
        allTokens.push(itemTokens)

        const link = item.link || feedConfig.url
        const dedupText = `${title}\n${item.contentSnippet || item.summary || ''}`.trim()
        const textHash = sha256(dedupText)
        const id = `disc-${Date.now()}-${newEntries.length + 1}`

        newEntries.push({
          id,
          title,
          angle: item.contentSnippet || item.summary || `Trending tech item from ${feedConfig.name}`,
          dedupText,
          textHash,
          tags: ['technology', 'engineering', 'trends'],
          score: 80,
          sources: [link],
          discoveredAt: now,
          attempts: 0,
          status: 'available',
        })
      }
    } catch (err) {
      console.warn(`[discover] Failed to fetch feed ${feedConfig.name}:`, err instanceof Error ? err.message : String(err))
    }
  }

  if (newEntries.length > 0) {
    queue.entries.push(...newEntries)
    for (const qPath of queuePaths) {
      await saveQueueFile(qPath, queue)
    }
    console.log(`[discover] Successfully added ${newEntries.length} new topic(s) to queue.json`)
  } else {
    console.log('[discover] No new non-duplicate topics found.')
  }

  console.log(`[discover] Total queue size: ${queue.entries.length}`)
  return { added: newEntries.length, total: queue.entries.length }
}

if (process.argv[1]?.endsWith('discover.ts') || process.argv[1]?.endsWith('discover.js')) {
  runTopicDiscovery()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[discover] Fatal error during discovery:', err)
      process.exit(1)
    })
}

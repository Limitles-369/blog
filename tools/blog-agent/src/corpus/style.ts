import type { CorpusPost } from './reader.js'
import { published, tagFrequency } from './reader.js'

/**
 * Derives a style profile by measuring the existing posts, rather than
 * describing them in hand-written prompt prose.
 *
 * The reason is drift: a prose description written today silently stops
 * matching the blog as the blog evolves, and nothing fails. Measured metrics
 * track whatever is actually on disk.
 */

export interface StyleMetrics {
  posts: number
  words: { min: number; max: number; median: number }
  h2PerPost: { min: number; max: number; median: number }
  h3PerPost: { median: number }
  paragraphWords: { median: number; p90: number }
  /** Share of posts with at least one fenced code block. */
  codeFenceRatio: number
  bulletsPerPost: { median: number }
  externalLinksPerPost: { median: number }
  /** Section headings, most frequent first — reveals the house structure. */
  commonHeadings: string[]
  closingHeadings: string[]
  opensWithHeading: boolean
  topTags: string[]
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number
}

/** Strip fenced code so prose metrics are not skewed by code lines. */
export function stripFences(body: string): string {
  return body.replace(/^```[\s\S]*?^```\s*$/gm, '')
}

export function countWords(text: string): number {
  const cleaned = stripFences(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  const matches = cleaned.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)
  return matches ? matches.length : 0
}

export interface Heading {
  depth: number
  text: string
  line: number
}

/** ATX headings outside fenced code. Shared by the heading-hierarchy gate. */
export function extractHeadings(body: string): Heading[] {
  const out: Heading[] = []
  let inFence = false
  const lines = body.split('\n')
  for (const [i, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line)
    if (m?.[1] && m[2]) out.push({ depth: m[1].length, text: m[2].trim(), line: i + 1 })
  }
  return out
}

export function externalLinks(body: string): string[] {
  const out: string[] = []
  const re = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) if (m[1]) out.push(m[1])
  return out
}

export function internalLinks(body: string): string[] {
  const out: string[] = []
  const re = /\[[^\]]*\]\((\/[^)\s]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) if (m[1]) out.push(m[1])
  return out
}

function firstNonEmptyLine(body: string): string {
  for (const line of body.split('\n')) if (line.trim() !== '') return line.trim()
  return ''
}

export function computeStyleMetrics(all: readonly CorpusPost[]): StyleMetrics {
  const posts = published(all)
  const wordCounts = posts.map((p) => countWords(p.body))
  const headingsPer = posts.map((p) => extractHeadings(p.body))

  const paragraphWordCounts: number[] = []
  for (const post of posts) {
    for (const block of stripFences(post.body).split(/\n\s*\n/)) {
      const t = block.trim()
      if (t === '' || /^[#>\-*|<]/.test(t)) continue
      paragraphWordCounts.push(countWords(t))
    }
  }

  const headingCounts = new Map<string, number>()
  for (const hs of headingsPer) {
    for (const h of hs) {
      if (h.depth !== 2) continue
      const key = h.text.toLowerCase()
      headingCounts.set(key, (headingCounts.get(key) ?? 0) + 1)
    }
  }

  const closing = new Map<string, number>()
  for (const hs of headingsPer) {
    const h2s = hs.filter((h) => h.depth === 2)
    for (const h of h2s.slice(-2)) {
      const key = h.text.toLowerCase()
      closing.set(key, (closing.get(key) ?? 0) + 1)
    }
  }

  return {
    posts: posts.length,
    words: {
      min: Math.min(...(wordCounts.length ? wordCounts : [0])),
      max: Math.max(...(wordCounts.length ? wordCounts : [0])),
      median: median(wordCounts),
    },
    h2PerPost: {
      min: Math.min(...headingsPer.map((h) => h.filter((x) => x.depth === 2).length), 0),
      max: Math.max(...headingsPer.map((h) => h.filter((x) => x.depth === 2).length), 0),
      median: median(headingsPer.map((h) => h.filter((x) => x.depth === 2).length)),
    },
    h3PerPost: { median: median(headingsPer.map((h) => h.filter((x) => x.depth === 3).length)) },
    paragraphWords: {
      median: median(paragraphWordCounts),
      p90: percentile(paragraphWordCounts, 90),
    },
    codeFenceRatio:
      posts.length === 0 ? 0 : posts.filter((p) => /^```/m.test(p.body)).length / posts.length,
    bulletsPerPost: {
      median: median(posts.map((p) => (p.body.match(/^\s*[-*]\s+/gm) ?? []).length)),
    },
    externalLinksPerPost: { median: median(posts.map((p) => externalLinks(p.body).length)) },
    commonHeadings: [...headingCounts.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .slice(0, 12),
    closingHeadings: [...closing.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .slice(0, 4),
    opensWithHeading: posts.some((p) => firstNonEmptyLine(p.body).startsWith('#')),
    topTags: [...tagFrequency(all).keys()].slice(0, 15),
  }
}

/** Render metrics as prompt-ready constraints. Numbers, not adjectives. */
export function renderStyleBrief(m: StyleMetrics): string {
  const lines = [
    `Measured from ${m.posts} published post(s) on this blog:`,
    `- Length: ${m.words.median} words median (range ${m.words.min}-${m.words.max}).`,
    `- Structure: ${m.h2PerPost.median} H2 sections median; ${m.h3PerPost.median} H3 median.`,
    `- NEVER emit an H1. The page renders the title from frontmatter.`,
    m.opensWithHeading ? `- Posts may open with a heading.` : `- Open with prose, not a heading.`,
    `- Paragraphs: ${m.paragraphWords.median} words median, ${m.paragraphWords.p90} at p90. Keep them short.`,
    `- Bullet lists: ~${m.bulletsPerPost.median} bullet lines per post.`,
    `- External links: ~${m.externalLinksPerPost.median} per post, to primary sources.`,
    m.codeFenceRatio < 0.25
      ? `- Recent posts use NO fenced code blocks. Explain in prose; do not add code unless it is essential.`
      : `- Fenced code blocks appear in ${Math.round(m.codeFenceRatio * 100)}% of posts; always tag the language.`,
  ]
  if (m.closingHeadings.length > 0) {
    lines.push(`- Posts close with sections like: ${m.closingHeadings.join(', ')}.`)
  }
  if (m.commonHeadings.length > 0) {
    lines.push(`- Recurring section headings: ${m.commonHeadings.join(', ')}.`)
  }
  lines.push(`- Established tags to prefer: ${m.topTags.join(', ')}.`)
  return lines.join('\n')
}

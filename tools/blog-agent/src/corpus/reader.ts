import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import matter from 'gray-matter'

import { paths } from '../config/paths.js'

/**
 * Reads the existing posts straight off disk.
 *
 * Deliberately does NOT import `.contentlayer/generated` — that directory is
 * a build artifact which may be stale, absent on a fresh clone, or mid-write
 * by a running `next dev`. Parsing the source of truth keeps the corpus
 * reader usable before any build has run.
 */

export interface CorpusPost {
  slug: string
  filePath: string
  title: string
  date: string
  summary: string
  tags: string[]
  draft: boolean
  images: string[]
  layout?: string
  authors: string[]
  /** Body with frontmatter stripped. */
  body: string
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string') return [value]
  return []
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

export async function readCorpus(blogDir = paths.blog): Promise<CorpusPost[]> {
  const entries = await readdir(blogDir, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
    .map((e) => path.join(blogDir, e.name))

  const posts = await Promise.all(
    files.map(async (filePath): Promise<CorpusPost> => {
      const raw = await readFile(filePath, 'utf8')
      const { data, content } = matter(raw)
      const fm = data as Record<string, unknown>
      return {
        slug: path.basename(filePath).replace(/\.mdx?$/, ''),
        filePath,
        title: typeof fm['title'] === 'string' ? fm['title'] : '',
        date: asDateString(fm['date']),
        summary: typeof fm['summary'] === 'string' ? fm['summary'] : '',
        tags: asStringArray(fm['tags']),
        draft: fm['draft'] === true,
        images: asStringArray(fm['images']),
        ...(typeof fm['layout'] === 'string' ? { layout: fm['layout'] } : {}),
        authors: asStringArray(fm['authors']),
        body: content,
      }
    })
  )

  return posts.sort((a, b) => b.date.localeCompare(a.date))
}

/** Published posts only, matching data/publishedBlogs.ts semantics. */
export function published(posts: readonly CorpusPost[]): CorpusPost[] {
  return posts.filter((p) => !p.draft)
}

/** Every slug on disk, draft included — the uniqueness gate needs both. */
export function allSlugs(posts: readonly CorpusPost[]): Set<string> {
  return new Set(posts.map((p) => p.slug))
}

/** Tags ranked by frequency across published posts, for prompt grounding. */
export function tagFrequency(posts: readonly CorpusPost[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const post of published(posts)) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]))
}

export async function readAuthorIds(authorsDir = paths.authors): Promise<Set<string>> {
  const entries = await readdir(authorsDir, { withFileTypes: true })
  return new Set(
    entries
      .filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
      .map((e) => e.name.replace(/\.mdx?$/, ''))
  )
}

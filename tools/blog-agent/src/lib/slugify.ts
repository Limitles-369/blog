/**
 * Slug and text-normalisation helpers.
 *
 * `slugify` must agree with how the site derives a slug from a filename:
 * contentlayer.config.ts computes `_raw.flattenedPath`, so the slug IS the
 * filename minus `.mdx`. Generating a slug here that would not survive as a
 * filename is the failure this guards against.
 */

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
])

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** Slug capped at a whole-token boundary, so it never ends mid-word. */
export function slugifyBounded(input: string, maxLength = 70): string {
  const full = slugify(input)
  if (full.length <= maxLength) return full
  const parts = full.split('-')
  const out: string[] = []
  let length = 0
  for (const part of parts) {
    const next = length === 0 ? part.length : length + 1 + part.length
    if (next > maxLength) break
    out.push(part)
    length = next
  }
  return out.length > 0 ? out.join('-') : full.slice(0, maxLength).replace(/-+$/, '')
}

/**
 * Short directory key for image assets. The existing posts use a shortened
 * topic key rather than the full slug — `post-quantum-cryptography/` serves
 * the post slugged `post-quantum-cryptography-developers-q-day`.
 */
export function imageKey(slug: string, tokens = 3): string {
  return slug.split('-').slice(0, tokens).join('-')
}

/** Comparison form for dedup: stopwords dropped, tokens sorted. */
export function normalizeForCompare(input: string): string {
  return slugify(input)
    .split('-')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .sort()
    .join(' ')
}

export function tokenSet(input: string): Set<string> {
  return new Set(
    slugify(input)
      .split('-')
      .filter((t) => t.length > 0 && !STOPWORDS.has(t))
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let shared = 0
  for (const item of a) if (b.has(item)) shared++
  return shared / (a.size + b.size - shared)
}

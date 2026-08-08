import { z } from 'zod'

/**
 * Frontmatter contract for a generated post.
 *
 * This is intentionally STRICTER than contentlayer.config.ts, not a mirror of
 * it. The site's schema types `images` as `json` (any shape) and `layout` as a
 * bare `string` with no enum, because it must keep accepting posts written by
 * hand over the years. The agent should not be allowed that latitude:
 *
 *   - `layout` — an unknown value passes contentlayer cleanly, then throws
 *     "Element type is invalid" during `next build`, because the layout map in
 *     app/blog/[...slug]/page.tsx yields undefined. StackBlogLayout.tsx exists
 *     on disk but is NOT in that map, so it is a plausible-looking trap.
 *   - `images` — narrowed to string[] so the hero-asset gate has one shape to
 *     check. PostLayout.tsx renders images[0] in an aspect-2/1 container.
 *   - `summary` — required and non-empty here though optional on the site. It
 *     feeds OG description, Twitter description, JSON-LD, and the RSS
 *     <description>. Missing it is a silent SEO hole rather than an error.
 *
 * Any key outside the site's schema yields ExtraFieldDataError, which is
 * `onExtraFieldData: 'warn'` — the field would be dropped, not rendered. So
 * `.strict()` here prevents inventing frontmatter that silently disappears.
 */

/** Layout components actually present in the site's layout map. */
export const LAYOUTS = ['PostSimple', 'PostLayout', 'PostBanner'] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const frontmatterSchema = z
  .object({
    title: z.string().trim().min(10).max(120),
    date: z.string().regex(ISO_DATE, 'date must be YYYY-MM-DD'),
    lastmod: z.string().regex(ISO_DATE).optional(),
    tags: z.array(z.string().trim().min(1)).min(2).max(8),
    draft: z.boolean().optional(),
    summary: z.string().trim().min(50).max(300),
    images: z.array(z.string().startsWith('/static/')).min(1),
    authors: z.array(z.string().trim().min(1)).min(1),
    layout: z.enum(LAYOUTS),
    bibliography: z.string().trim().min(1).optional(),
    canonicalUrl: z.string().url().optional(),
  })
  .strict()

export type Frontmatter = z.infer<typeof frontmatterSchema>

/**
 * Field order for serialisation. Matching the hand-written posts keeps bot
 * diffs readable next to human ones.
 */
export const FIELD_ORDER: readonly (keyof Frontmatter)[] = [
  'title',
  'date',
  'lastmod',
  'tags',
  'draft',
  'summary',
  'images',
  'authors',
  'layout',
  'bibliography',
  'canonicalUrl',
]

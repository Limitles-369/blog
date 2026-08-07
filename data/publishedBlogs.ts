import { allBlogs, type Blog } from 'contentlayer/generated'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Posts visible on listings, feeds, and sitemaps.
 *
 * `draft: true` posts stay visible in dev so they can be previewed, and are
 * excluded from production builds — the same rule contentlayer.config.ts
 * already applies when it builds the tag counts.
 */
export const publishedBlogs: Blog[] = isProduction
  ? allBlogs.filter((post) => post.draft !== true)
  : allBlogs

import { MetadataRoute } from 'next'
import { allBlogs } from 'contentlayer/generated'
import tagData from './tag-data.json'
import siteMetadata from '@/data/siteMetadata'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteMetadata.siteUrl
  // next.config.js sets trailingSlash: true, so canonical URLs end in "/".
  // Emitting slash-less URLs here would disagree with the canonical tag.
  const url = (path: string) => `${siteUrl}/${path}${path.endsWith('/') || !path ? '' : '/'}`

  const blogRoutes = allBlogs
    .filter((post) => !post.draft)
    .map((post) => ({
      url: url(post.path),
      // Guard against frontmatter where lastmod predates the publish date.
      lastModified:
        post.lastmod && new Date(post.lastmod) > new Date(post.date) ? post.lastmod : post.date,
    }))

  const tagRoutes = Object.keys(tagData as Record<string, number>).map((tag) => ({
    url: url(`tags/${tag}`),
    lastModified: new Date().toISOString().split('T')[0],
  }))

  const routes = ['', 'blog', 'projects', 'tags', 'about', 'privacy', 'terms'].map((route) => ({
    url: url(route),
    lastModified: new Date().toISOString().split('T')[0],
  }))

  return [...routes, ...blogRoutes, ...tagRoutes]
}

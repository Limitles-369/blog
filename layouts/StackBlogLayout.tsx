'use client'

import { useState, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { slug } from 'github-slugger'
import { formatDate } from 'pliny/utils/formatDate'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog } from 'contentlayer/generated'
import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import tagData from 'app/tag-data.json'
import Image from 'next/image'

// Rotating editorial thumbnail images for cards
const CARD_IMAGES = [
  '/static/images/blog-cards/card-1.png',
  '/static/images/blog-cards/card-2.png',
  '/static/images/blog-cards/card-3.png',
  '/static/images/blog-cards/card-4.png',
  '/static/images/blog-cards/card-5.png',
]

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaginationProps {
  totalPages: number
  currentPage: number
}

interface ListLayoutProps {
  posts: CoreContent<Blog>[]
  title: string
  initialDisplayPosts?: CoreContent<Blog>[]
  pagination?: PaginationProps
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function Pagination({ totalPages, currentPage }: PaginationProps) {
  const pathname = usePathname()
  const basePath = pathname
    .replace(/^\//, '')
    .replace(/\/page\/\d+\/?$/, '')
    .replace(/\/$/, '')
  const prevPage = currentPage - 1 > 0
  const nextPage = currentPage + 1 <= totalPages

  return (
    <div className="mt-14 flex items-center justify-center gap-4">
      {prevPage ? (
        <Link
          href={currentPage - 1 === 1 ? `/${basePath}/` : `/${basePath}/page/${currentPage - 1}`}
          rel="prev"
          className="btn-ghost text-sm"
        >
          ← Previous
        </Link>
      ) : (
        <button disabled className="btn-ghost cursor-not-allowed text-sm opacity-40">
          ← Previous
        </button>
      )}

      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
        Page {currentPage} of {totalPages}
      </span>

      {nextPage ? (
        <Link href={`/${basePath}/page/${currentPage + 1}`} rel="next" className="btn-orange text-sm">
          Next →
        </Link>
      ) : (
        <button disabled className="btn-orange cursor-not-allowed text-sm opacity-40">
          Next →
        </button>
      )}
    </div>
  )
}

// ─── Blog Card ───────────────────────────────────────────────────────────────

function BlogCard({ post, index, featured = false }: { post: CoreContent<Blog>; index: number; featured?: boolean }) {
  const { path, slug: postSlug, date, title, summary, tags } = post
  const img = post.images?.[0] ?? CARD_IMAGES[index % CARD_IMAGES.length]
  const tag = tags?.[0] ?? 'Article'
  const stagger = `stagger-${Math.min((index % 6) + 1, 6)}`

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border border-[#E8E4DF] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/8 dark:border-white/10 dark:bg-[#1a1a1a] animate-fade-in-up ${stagger}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <Image
          src={img}
          alt={title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes={featured ? '(max-width: 640px) 100vw, 50vw' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
        />
        <span className="absolute top-3 left-3 rounded-full bg-[#FF8A1E]/90 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {tag}
        </span>
      </div>

      {/* Content */}
      <div className={`flex flex-1 flex-col gap-3 ${featured ? 'p-6' : 'p-5'}`}>
        <time
          dateTime={date}
          className="text-xs font-medium text-gray-400 dark:text-gray-500"
          suppressHydrationWarning
        >
          {formatDate(date, siteMetadata.locale)}
        </time>

        <h2 className={`font-semibold leading-snug tracking-tight text-gray-900 transition-colors group-hover:text-[#FF8A1E] dark:text-white dark:group-hover:text-[#FF8A1E] line-clamp-2 ${featured ? 'text-xl' : 'text-lg'}`}>
          <Link href={`/${path}`} aria-label={`Read "${title}"`}>
            {title}
          </Link>
        </h2>

        {summary && (
          <p className={`leading-relaxed text-gray-500 dark:text-gray-400 flex-1 ${featured ? 'text-sm line-clamp-4' : 'text-sm line-clamp-3'}`}>
            {summary}
          </p>
        )}

        <Link
          href={`/${path}`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF8A1E]"
          aria-label={`Read more: "${title}"`}
        >
          Learn More
          <svg
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>
    </article>
  )
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export default function StackBlogLayout({
  posts,
  title,
  initialDisplayPosts = [],
  pagination,
}: ListLayoutProps) {
  const pathname = usePathname()
  const [searchValue, setSearchValue] = useState('')
  const [activeTag, setActiveTag] = useState('all')

  const tagCounts = tagData as Record<string, number>
  const tagKeys = Object.keys(tagCounts)
  const sortedTags = tagKeys.sort((a, b) => tagCounts[b] - tagCounts[a])

  // Filter posts by search + active tag
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const search = post.title + (post.summary ?? '') + (post.tags?.join(' ') ?? '')
      const matchesSearch = search.toLowerCase().includes(searchValue.toLowerCase())
      const matchesTag =
        activeTag === 'all' || post.tags?.some((t) => slug(t) === slug(activeTag))
      return matchesSearch && matchesTag
    })
  }, [posts, searchValue, activeTag])

  const displayPosts =
    searchValue || activeTag !== 'all'
      ? filteredPosts
      : initialDisplayPosts.length > 0
        ? initialDisplayPosts
        : posts

  const isOnTagPage = pathname.startsWith('/tags/')

  return (
    <>
      {/* ── Page Hero ─────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-20 pb-14 text-center sm:pt-24 sm:pb-16">
        <span className="animate-fade-in mb-5 inline-flex items-center rounded-full border border-[#FF8A1E]/30 bg-[#FF8A1E]/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-[#FF8A1E]">
          ✦ Blog
        </span>
        <h1 className="animate-fade-in-up stagger-1 mx-auto max-w-[700px] text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
          Insight and Updates
        </h1>
        <p className="animate-fade-in-up stagger-2 mx-auto mt-4 max-w-[520px] text-base text-gray-500 dark:text-gray-400">
          A collection of hand-picked articles. Deep dives, insights, and honest advice to navigate
          the modern landscape.
        </p>
      </section>

      {/* ── Search + Filter Bar ───────────────────────────────────────── */}
      <section className="pb-10">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">All Articles</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Find all tools that will help you grow — vetted and curated from the start.
          </p>
        </div>

        {/* Search + tag pills row */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <span className="sr-only">Search articles</span>
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              aria-label="Search articles"
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search articles..."
              className="w-full rounded-full border border-[#E8E4DF] bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-all focus:border-[#FF8A1E] focus:outline-none focus:ring-2 focus:ring-[#FF8A1E]/20 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white dark:placeholder-gray-500 dark:focus:border-[#FF8A1E]"
            />
          </div>

          {/* Tag filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* "All Articles" pill */}
            <button
              onClick={() => setActiveTag('all')}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all ${
                activeTag === 'all'
                  ? 'border-[#FF8A1E] bg-[#FF8A1E] text-white'
                  : 'border-[#E8E4DF] bg-white text-gray-600 hover:border-[#FF8A1E] hover:text-[#FF8A1E] dark:border-white/10 dark:bg-[#1a1a1a] dark:text-gray-300'
              }`}
            >
              All Articles
            </button>

            {sortedTags.slice(0, 6).map((t) => {
              const tagSlug = slug(t)
              const isActive = activeTag === tagSlug
              return (
                <button
                  key={t}
                  onClick={() => setActiveTag(isActive ? 'all' : tagSlug)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize tracking-wide transition-all ${
                    isActive
                      ? 'border-[#FF8A1E] bg-[#FF8A1E] text-white'
                      : 'border-[#E8E4DF] bg-white text-gray-600 hover:border-[#FF8A1E] hover:text-[#FF8A1E] dark:border-white/10 dark:bg-[#1a1a1a] dark:text-gray-300'
                  }`}
                  aria-label={`Filter by ${t}`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Card Grid ─────────────────────────────────────────────────── */}
      <section className="pb-16">
        {displayPosts.length === 0 ? (
          <p className="py-16 text-center text-gray-400 dark:text-gray-500">No posts found.</p>
        ) : (
          <>
            {/* Featured top row — 2 large cards */}
            {displayPosts.slice(0, 2).length > 0 && (
              <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {displayPosts.slice(0, 2).map((post, i) => (
                  <BlogCard key={post.path} post={post} index={i} featured={true} />
                ))}
              </div>
            )}
            {/* Regular 3-col grid */}
            {displayPosts.slice(2).length > 0 && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {displayPosts.slice(2).map((post, i) => (
                  <BlogCard key={post.path} post={post} index={i + 2} featured={false} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && !searchValue && activeTag === 'all' && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
          />
        )}
      </section>
    </>
  )
}

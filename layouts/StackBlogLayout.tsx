'use client'

import { useState, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { slug } from 'github-slugger'
import { formatDate } from 'pliny/utils/formatDate'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog } from 'contentlayer/generated'
import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import tagData from '@/app/tag-data.json'

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
    <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-4">
      {prevPage ? (
        <Link
          href={currentPage - 1 === 1 ? `/${basePath}/` : `/${basePath}/page/${currentPage - 1}`}
          rel="prev"
          className="btn-ghost text-sm"
        >
          ← Previous
        </Link>
      ) : (
        <span aria-hidden="true" className="btn-ghost text-sm opacity-40">
          ← Previous
        </span>
      )}

      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Page {currentPage} of {totalPages}
      </span>

      {nextPage ? (
        <Link
          href={`/${basePath}/page/${currentPage + 1}`}
          rel="next"
          className="btn-orange text-sm"
        >
          Next →
        </Link>
      ) : (
        <span aria-hidden="true" className="btn-ghost text-sm opacity-40">
          Next →
        </span>
      )}
    </nav>
  )
}

// ─── Blog Card ───────────────────────────────────────────────────────────────

function BlogCard({
  post,
  index,
  featured = false,
}: {
  post: CoreContent<Blog>
  index: number
  featured?: boolean
}) {
  const { path, date, title, summary, tags, readingTime } = post
  const tag = tags?.[0] ?? 'Article'

  return (
    <article className="group border-edge relative grid grid-cols-[3.25rem_1fr] gap-4 border-b py-6 first:border-t dark:border-white/10">
      <div className="group-hover:text-accent dark:group-hover:text-accent pt-1 font-mono text-2xl font-light tracking-[-0.08em] text-gray-300 transition-colors dark:text-white/20">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold tracking-[0.14em] uppercase">
          <span className="text-accent-strong dark:text-accent">{tag}</span>
          <span className="text-gray-400">{formatDate(date, siteMetadata.locale)}</span>
          {readingTime?.text && <span className="text-gray-400">{readingTime.text}</span>}
        </div>
        <h2
          className={`group-hover:text-accent-strong dark:group-hover:text-accent mt-2 line-clamp-2 leading-tight font-semibold tracking-tight text-gray-900 transition-colors dark:text-white ${featured ? 'text-2xl' : 'text-xl'}`}
        >
          <Link href={`/${path}`} className="after:absolute after:inset-0">
            {title}
          </Link>
        </h2>
        {summary && (
          <p
            className={`mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-gray-400 ${featured ? 'md:line-clamp-3' : ''}`}
          >
            {summary}
          </p>
        )}
        <span className="text-accent-strong dark:text-accent mt-3 inline-flex items-center gap-1 text-[11px] font-bold tracking-[0.12em] uppercase">
          Open dispatch <span className="transition-transform group-hover:translate-x-1">→</span>
        </span>
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
      const matchesTag = activeTag === 'all' || post.tags?.some((t) => slug(t) === slug(activeTag))
      return matchesSearch && matchesTag
    })
  }, [posts, searchValue, activeTag])

  const displayPosts =
    searchValue || activeTag !== 'all'
      ? filteredPosts
      : initialDisplayPosts.length > 0
        ? initialDisplayPosts
        : posts

  const resultCount = displayPosts.length
  const isFiltering = Boolean(searchValue) || activeTag !== 'all'

  return (
    <>
      {/* ── Page Hero ─────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-20 pb-14 text-center sm:pt-24 sm:pb-16">
        <span className="border-accent/30 bg-accent/10 text-accent-strong dark:text-accent animate-fade-in mb-5 inline-flex items-center rounded-full border px-3.5 py-1 text-xs font-semibold tracking-widest uppercase">
          ✦ Blog
        </span>
        <h1 className="animate-fade-in-up stagger-1 mx-auto max-w-[700px] text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
          Insights and Updates
        </h1>
        <p className="animate-fade-in-up stagger-2 mx-auto mt-4 max-w-[520px] text-base text-gray-600 dark:text-gray-400">
          Notes on full-stack engineering — what I'm building, what broke, and what I learned fixing
          it.
        </p>
      </section>

      {/* ── Search + Filter Bar ───────────────────────────────────────── */}
      <section className="pb-10">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">All Articles</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Search by title, summary, or tag.
          </p>
        </div>

        {/* Search + tag pills row */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative max-w-sm min-w-[220px] flex-1">
            <label htmlFor="article-search" className="sr-only">
              Search articles
            </label>
            <svg
              aria-hidden="true"
              className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-gray-500"
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
              id="article-search"
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search articles..."
              className="border-edge focus:border-accent focus:ring-accent/30 dark:bg-surface-dark dark:focus:border-accent min-h-11 w-full rounded-full border bg-white py-2 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-500 transition-all focus:ring-2 focus:outline-none dark:border-white/10 dark:text-white dark:placeholder-gray-400"
            />
          </div>

          {/* Tag filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* "All Articles" pill */}
            <button
              onClick={() => setActiveTag('all')}
              aria-pressed={activeTag === 'all'}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs font-semibold tracking-wide uppercase transition-all ${
                activeTag === 'all'
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-edge hover:border-accent hover:text-accent-strong dark:bg-surface-dark bg-white text-gray-700 dark:border-white/10 dark:text-gray-300'
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
                  aria-pressed={isActive}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs font-semibold tracking-wide uppercase transition-all ${
                    isActive
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-edge hover:border-accent hover:text-accent-strong dark:bg-surface-dark bg-white text-gray-700 dark:border-white/10 dark:text-gray-300'
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        <p className="sr-only" role="status">
          {resultCount} {resultCount === 1 ? 'article' : 'articles'}
          {isFiltering ? ' match your filters' : ''}
        </p>
      </section>

      {/* ── Card Grid ─────────────────────────────────────────────────── */}
      <section className="pb-16">
        {displayPosts.length === 0 ? (
          <div className="border-edge dark:bg-surface-dark rounded-2xl border border-dashed bg-white/50 py-20 text-center dark:border-white/10">
            <p className="text-base font-semibold text-gray-900 dark:text-white">
              No articles match that.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-gray-400">
              Try a different search term, or clear the filters to see everything.
            </p>
            <button
              onClick={() => {
                setSearchValue('')
                setActiveTag('all')
              }}
              className="btn-ghost mt-6 text-sm"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Featured top row — 2 large cards */}
            {displayPosts.slice(0, 2).length > 0 && (
              <div className="mb-10 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                {displayPosts.slice(0, 2).map((post, i) => (
                  <BlogCard key={post.path} post={post} index={i} featured={true} />
                ))}
              </div>
            )}
            {/* Regular 3-col grid */}
            {displayPosts.slice(2).length > 0 && (
              <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                {displayPosts.slice(2).map((post, i) => (
                  <BlogCard key={post.path} post={post} index={i + 2} featured={false} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && !searchValue && activeTag === 'all' && (
          <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} />
        )}
      </section>
    </>
  )
}

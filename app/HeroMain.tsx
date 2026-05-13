import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import { formatDate } from 'pliny/utils/formatDate'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog } from 'contentlayer/generated'
import Image from 'next/image'

// Rotating editorial thumbnail images for cards
const CARD_IMAGES = [
  '/static/images/blog-cards/card-1.png',
  '/static/images/blog-cards/card-2.png',
  '/static/images/blog-cards/card-3.png',
  '/static/images/blog-cards/card-4.png',
  '/static/images/blog-cards/card-5.png',
]

const MAX_DISPLAY = 6

interface BlogCardProps {
  post: CoreContent<Blog>
  index: number
}

function BlogCard({ post, index }: BlogCardProps) {
  const { slug, date, title, summary, tags } = post
  const img = post.images?.[0] ?? CARD_IMAGES[index % CARD_IMAGES.length]
  const tag = tags?.[0] ?? 'Article'
  const stagger = `stagger-${Math.min(index + 1, 6)}`

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
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {/* Category badge over image */}
        <span className="absolute top-3 left-3 rounded-full bg-[#FF8A1E]/90 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {tag}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <time
          dateTime={date}
          className="text-xs font-medium text-gray-400 dark:text-gray-500"
          suppressHydrationWarning
        >
          {formatDate(date, siteMetadata.locale)}
        </time>

        <h2 className="text-lg font-semibold leading-snug tracking-tight text-gray-900 transition-colors group-hover:text-[#FF8A1E] dark:text-white dark:group-hover:text-[#FF8A1E] line-clamp-2">
          <Link href={`/blog/${slug}`} aria-label={`Read "${title}"`}>
            {title}
          </Link>
        </h2>

        {summary && (
          <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-3 flex-1">
            {summary}
          </p>
        )}

        <Link
          href={`/blog/${slug}`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#FF8A1E] transition-gap duration-200 hover:gap-2.5"
          aria-label={`Read more: "${title}"`}
        >
          Learn More
          <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>
    </article>
  )
}

interface HomeProps {
  posts: CoreContent<Blog>[]
}

export default function HeroMain({ posts }: HomeProps) {
  return (
    <>
      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
        {/* Badge */}
        <span className="animate-fade-in mb-6 inline-flex items-center rounded-full border border-[#FF8A1E]/30 bg-[#FF8A1E]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#FF8A1E]">
          ✦ Blog
        </span>

        {/* Headline */}
        <h1 className="animate-fade-in-up stagger-1 mx-auto max-w-[750px] text-4xl font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
          Insights&nbsp;&amp;&nbsp;Updates
        </h1>

        {/* Sub-headline */}
        <p className="animate-fade-in-up stagger-2 mx-auto mt-5 max-w-[580px] text-base leading-relaxed text-gray-500 dark:text-gray-400 sm:text-lg">
          {siteMetadata.description}
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up stagger-3 mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/blog" className="btn-orange">
            Browse All Posts
          </Link>
          <Link href="/about" className="btn-ghost">
            About the Author
          </Link>
        </div>
      </section>

      {/* ── Blog Card Grid ───────────────────────────────────────────── */}
      <section className="pb-20">
        {/* Section header */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">All Articles</h2>
          {posts.length > MAX_DISPLAY && (
            <Link
              href="/blog"
              className="text-sm font-semibold text-[#FF8A1E] hover:underline"
            >
              View all →
            </Link>
          )}
        </div>

        {/* Grid */}
        {!posts.length ? (
          <p className="text-gray-500 dark:text-gray-400">No posts found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.slice(0, MAX_DISPLAY).map((post, i) => (
              <BlogCard key={post.slug} post={post} index={i} />
            ))}
          </div>
        )}

        {/* View More */}
        {posts.length > MAX_DISPLAY && (
          <div className="mt-10 flex justify-center">
            <Link href="/blog" className="btn-ghost">
              View More
            </Link>
          </div>
        )}
      </section>

      {/* ── Newsletter CTA ───────────────────────────────────────────── */}
      <section className="pb-24">
        <div className="animate-fade-in-up rounded-3xl border border-[#E8E4DF] bg-white px-8 py-16 text-center shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
          <span className="mb-4 inline-flex items-center rounded-full bg-[#FF8A1E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#FF8A1E]">
            Newsletter
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            Stay in the loop
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-gray-500 dark:text-gray-400">
            Get the latest articles, tools and insights delivered straight to your inbox. No spam, ever.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/blog" className="btn-orange">
              Browse Articles
            </Link>
            <Link href="/about" className="btn-ghost">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

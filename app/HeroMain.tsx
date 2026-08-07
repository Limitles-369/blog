import Link from '@/components/Link'
import NewsletterForm from '@/components/NewsletterForm'
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

const MAX_DISPLAY = 7

interface BlogCardProps {
  post: CoreContent<Blog>
  index: number
  featured?: boolean
}

function BlogCard({ post, index, featured = false }: BlogCardProps) {
  const { slug, date, title, summary, tags } = post
  const ownImage = post.images?.[0]
  const img = ownImage ?? CARD_IMAGES[index % CARD_IMAGES.length]
  const tag = tags?.[0] ?? 'Article'
  const stagger = `stagger-${Math.min(index + 1, 6)}`

  return (
    <article
      className={`group animate-fade-in-up border-edge dark:bg-surface-dark relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300 focus-within:-translate-y-1 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/8 dark:border-white/10 ${stagger}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <Image
          src={img}
          alt={ownImage ? `Cover image for ${title}` : ''}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes={
            featured
              ? '(max-width: 640px) 100vw, 50vw'
              : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
          }
        />
        {/* Category badge */}
        <span className="bg-accent text-accent-ink absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
          {tag}
        </span>
      </div>

      {/* Content */}
      <div className={`flex flex-1 flex-col gap-3 ${featured ? 'p-6' : 'p-5'}`}>
        <time
          dateTime={date}
          className="text-xs font-medium text-gray-500 dark:text-gray-400"
          suppressHydrationWarning
        >
          {formatDate(date, siteMetadata.locale)}
        </time>

        <h2
          className={`group-hover:text-accent-strong dark:group-hover:text-accent line-clamp-2 leading-snug font-semibold tracking-tight text-gray-900 transition-colors dark:text-white ${featured ? 'text-xl' : 'text-lg'}`}
        >
          <Link href={`/blog/${slug}`} className="after:absolute after:inset-0">
            {title}
          </Link>
        </h2>

        {summary && (
          <p
            className={`flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400 ${featured ? 'line-clamp-4' : 'line-clamp-3'}`}
          >
            {summary}
          </p>
        )}

        <span
          className="text-accent-strong dark:text-accent mt-2 inline-flex items-center gap-1.5 text-sm font-semibold"
          aria-hidden="true"
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
        </span>
      </div>
    </article>
  )
}

interface HomeProps {
  posts: CoreContent<Blog>[]
}

export default function HeroMain({ posts }: HomeProps) {
  const featuredPosts = posts.slice(0, 2)
  const regularPosts = posts.slice(2, MAX_DISPLAY)

  return (
    <>
      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
        {/* Badge */}
        <span className="animate-fade-in mb-6 inline-flex items-center rounded-full border border-[#FF8A1E]/30 bg-[#FF8A1E]/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-[#FF8A1E] uppercase">
          ✦ Blog
        </span>

        {/* Headline */}
        <h1 className="animate-fade-in-up stagger-1 mx-auto max-w-[750px] text-4xl leading-tight font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl dark:text-white">
          Insights, Projects &amp; Developer Notes
        </h1>

        {/* Sub-headline */}
        <p className="animate-fade-in-up stagger-2 mx-auto mt-5 max-w-[560px] text-base leading-relaxed text-gray-500 sm:text-lg dark:text-gray-400">
          Thoughts, tutorials, and real-world learnings from building modern web apps, interactive
          experiences, and scalable digital products.
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up stagger-3 mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/blog" className="btn-orange">
            Read the Blog →
          </Link>
          <Link href="/about" className="btn-ghost">
            About Me →
          </Link>
        </div>
      </section>

      {/* ── Blog Card Grid ───────────────────────────────────────────── */}
      <section className="pb-20">
        {/* Section header */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">All Articles</h2>
          {posts.length > MAX_DISPLAY && (
            <Link href="/blog" className="text-sm font-semibold text-[#FF8A1E] hover:underline">
              View all →
            </Link>
          )}
        </div>

        {!posts.length ? (
          <p className="text-gray-500 dark:text-gray-400">No posts found.</p>
        ) : (
          <>
            {/* Featured top row — 2 large cards */}
            {featuredPosts.length > 0 && (
              <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {featuredPosts.map((post, i) => (
                  <BlogCard key={post.slug} post={post} index={i} featured={true} />
                ))}
              </div>
            )}

            {/* Regular 3-col grid */}
            {regularPosts.length > 0 && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {regularPosts.map((post, i) => (
                  <BlogCard key={post.slug} post={post} index={i + 2} featured={false} />
                ))}
              </div>
            )}
          </>
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
        <div className="animate-fade-in-up border-edge dark:bg-surface-dark rounded-3xl border bg-white px-8 py-16 text-center shadow-sm dark:border-white/10">
          <span className="bg-accent/10 text-accent-strong dark:text-accent mb-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-widest uppercase">
            Newsletter
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
            Stay in the loop
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-gray-600 dark:text-gray-400">
            New posts on full-stack engineering, straight to your inbox. No spam, unsubscribe any
            time.
          </p>
          <div className="mt-8">
            <NewsletterForm />
          </div>
        </div>
      </section>
    </>
  )
}

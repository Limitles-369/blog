import Link from '@/components/Link'
import NewsletterForm from '@/components/NewsletterForm'
import siteMetadata from '@/data/siteMetadata'
import { formatDate } from 'pliny/utils/formatDate'
import type { Blog } from 'contentlayer/generated'
import type { CoreContent } from 'pliny/utils/contentlayer'

type Post = CoreContent<Blog>

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M5 12h14m-6-6 6 6-6 6"
      />
    </svg>
  )
}

function Meta({ post }: { post: Post }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.12em] text-gray-500 uppercase dark:text-gray-400">
      <time dateTime={post.date} suppressHydrationWarning>
        {formatDate(post.date, siteMetadata.locale)}
      </time>
      {post.readingTime?.text && <span>{post.readingTime.text}</span>}
    </div>
  )
}

function EditorialCard({
  post,
  index,
  compact = false,
}: {
  post: Post
  index: number
  compact?: boolean
}) {
  const tag = post.tags?.[0] ?? 'Engineering'

  if (compact) {
    return (
      <article className="group relative py-4 first:pt-1 last:pb-1">
        <Meta post={post} />
        <h3 className="group-hover:text-accent-strong dark:group-hover:text-accent mt-2 text-base leading-snug font-semibold tracking-tight text-gray-900 transition-colors dark:text-gray-100">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {post.summary}
        </p>
      </article>
    )
  }

  return (
    <article className="group hover:border-accent border-edge relative flex h-full flex-col overflow-hidden rounded-xl border bg-white text-gray-900 shadow-lg shadow-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/15 dark:border-white/10 dark:bg-[#111315] dark:text-white">
      <div className="border-edge relative h-12 overflow-hidden border-b px-5 py-4 dark:border-white/10">
        <div
          className="pointer-events-none absolute top-0 right-0 h-full w-1/2 opacity-60"
          aria-hidden="true"
        >
          <div className="bg-accent absolute top-3 right-6 h-px w-20" />
          <div className="absolute top-0 right-12 h-20 w-px rotate-[35deg] bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="relative flex items-center justify-between">
          <span className="text-accent-strong dark:text-accent text-xs font-bold tracking-[0.14em] uppercase">
            {tag}
          </span>
          <span className="font-mono text-[10px] text-gray-400 dark:text-white/40">
            {String(index + 1).padStart(2, '0')} / 06
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.12em] text-gray-500 uppercase dark:text-white/45">
          <time dateTime={post.date} suppressHydrationWarning>
            {formatDate(post.date, siteMetadata.locale)}
          </time>
          {post.readingTime?.text && <span>{post.readingTime.text}</span>}
        </div>
        <h3 className="group-hover:text-accent mt-3 line-clamp-3 text-xl leading-tight font-semibold tracking-tight text-gray-900 transition-colors dark:text-white">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600 dark:text-white/55">
          {post.summary}
        </p>
        <span className="text-accent mt-5 inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] uppercase">
          Read dispatch <Arrow />
        </span>
      </div>
    </article>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
  href,
}: {
  eyebrow: string
  title: string
  description: string
  href?: string
}) {
  return (
    <div className="border-edge mb-7 flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-end dark:border-white/10">
      <div>
        <p className="text-accent-strong dark:text-accent text-[11px] font-bold tracking-[0.18em] uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
          {title}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      {href && (
        <Link
          href={href}
          className="text-accent-strong dark:text-accent inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] uppercase hover:underline"
        >
          View archive <Arrow />
        </Link>
      )}
    </div>
  )
}

export default function HeroMain({ posts }: { posts: Post[] }) {
  const [cover, supporting, ...rest] = posts
  const briefings = rest.slice(0, 4)
  const latest = rest.slice(4, 8)
  const deepDives = posts.filter((post) => (post.readingTime?.minutes ?? 0) >= 8).slice(0, 3)
  const tools = posts
    .filter((post) =>
      post.tags?.some((tag) => /typescript|javascript|node|react|database|dev/i.test(tag))
    )
    .slice(0, 4)

  return (
    <div className="pb-20">
      <section className="border-edge border-b py-14 sm:py-20 dark:border-white/10">
        <div className="flex flex-col justify-between gap-10 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="text-accent-strong dark:text-accent mb-5 text-[11px] font-bold tracking-[0.22em] uppercase">
              {siteMetadata.headerTitle}
              {' // Technical Journal'}
            </p>
            <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-gray-950 sm:text-6xl dark:text-white">
              Systems, software, and the craft behind reliable products.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg dark:text-gray-400">
              Long-form engineering notes, practical architecture guides, and field reports from
              building modern digital products.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Link href="/blog" className="btn-orange">
              Explore the archive <Arrow />
            </Link>
            <Link href="/about" className="btn-ghost">
              About the author
            </Link>
          </div>
        </div>
      </section>

      {cover && (
        <section className="border-edge border-b py-10 sm:py-14 dark:border-white/10">
          <div className="mb-5 flex items-center justify-between text-[11px] font-bold tracking-[0.18em] text-gray-500 uppercase dark:text-gray-400">
            <span className="text-accent-strong dark:text-accent">
              Cover story // Latest dispatch
            </span>
            <span className="hidden sm:inline">Independent engineering notes</span>
          </div>
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:border-edge lg:col-span-3 lg:border-r lg:pr-8 dark:lg:border-white/10">
              {supporting && <EditorialCard post={supporting} index={1} compact />}
              <div className="border-edge mt-8 border-t pt-5 text-xs leading-relaxed text-gray-500 dark:border-white/10 dark:text-gray-400">
                A considered archive of practical lessons, clear mental models, and implementation
                details.
              </div>
            </div>
            <article className="group relative overflow-hidden rounded-xl bg-[#f1ede7] px-6 py-8 text-gray-900 shadow-2xl shadow-black/10 transition-colors sm:px-10 sm:py-10 lg:col-span-6 dark:bg-[#111315] dark:text-white">
              <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
                <div className="absolute top-0 right-16 h-full w-px bg-gray-400/30 dark:bg-white/10" />
                <div className="absolute top-10 right-0 h-px w-3/4 bg-gray-400/30 dark:bg-white/10" />
                <div className="border-accent/50 absolute right-10 bottom-10 h-32 w-32 rounded-full border" />
                <div className="absolute right-[4.6rem] bottom-[4.6rem] h-20 w-20 rounded-full border border-gray-500/20 dark:border-white/15" />
                <div className="bg-accent absolute top-16 left-0 h-px w-1/2" />
              </div>
              <div className="relative flex min-h-52 flex-col justify-between">
                <div className="flex items-start justify-between">
                  <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
                    Featured dispatch
                  </p>
                  <span className="font-mono text-xs text-gray-500 dark:text-white/40">
                    01 / 06
                  </span>
                </div>
                <div>
                  <p className="max-w-xs text-xs leading-relaxed text-gray-600 dark:text-white/45">
                    A field note on the systems, constraints, and decisions behind modern software.
                  </p>
                  <div className="text-accent mt-5 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
                    Read the cover story <Arrow />
                  </div>
                </div>
              </div>
              <div className="relative mt-6">
                <Meta post={cover} />
              </div>
              <h2 className="group-hover:text-accent-strong dark:group-hover:text-accent mt-4 text-3xl leading-tight font-semibold tracking-[-0.03em] text-gray-900 transition-colors sm:text-4xl dark:text-white">
                <Link href={`/blog/${cover.slug}`} className="after:absolute after:inset-0">
                  {cover.title}
                </Link>
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400">
                {cover.summary}
              </p>
            </article>
            <aside className="border-edge border-t pt-6 lg:col-span-3 lg:border-t-0 lg:border-l lg:pl-8 dark:border-white/10">
              <div className="border-edge mb-1 flex items-center justify-between border-b pb-3 text-[11px] font-bold tracking-[0.16em] uppercase dark:border-white/10">
                <span className="text-accent-strong dark:text-accent">Latest briefings</span>
                <span className="text-gray-400">Live feed</span>
              </div>
              <div className="divide-edge divide-y dark:divide-white/10">
                {briefings.map((post, index) => (
                  <EditorialCard key={post.slug} post={post} index={index + 2} compact />
                ))}
              </div>
            </aside>
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section className="py-12 sm:py-16">
          <SectionHeading
            eyebrow="Primary archive"
            title="Latest dispatches"
            description="Fresh notes on frameworks, data systems, AI tooling, and the decisions that shape production software."
            href="/blog"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((post, index) => (
              <EditorialCard key={post.slug} post={post} index={index + 4} />
            ))}
          </div>
        </section>
      )}
      {deepDives.length > 0 && (
        <section className="border-edge border-y bg-gray-50 py-12 sm:py-16 dark:border-white/10 dark:bg-white/[0.02]">
          <SectionHeading
            eyebrow="Extended monographs"
            title="Deep dives"
            description="Longer investigations for readers who want the underlying model, trade-offs, and implementation path."
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {deepDives.map((post, index) => (
              <EditorialCard key={post.slug} post={post} index={index + 1} />
            ))}
          </div>
        </section>
      )}
      {tools.length > 0 && (
        <section className="py-12 sm:py-16">
          <SectionHeading
            eyebrow="Compilers, runtimes, and tools"
            title="The working stack"
            description="Practical notes from the tools and languages that make modern products possible."
            href="/tags"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map((post, index) => (
              <EditorialCard key={post.slug} post={post} index={index + 2} />
            ))}
          </div>
        </section>
      )}
      <section className="border-edge border-t pt-12 dark:border-white/10">
        <div className="border-accent/30 bg-accent/5 rounded-2xl border px-6 py-12 text-center sm:px-12">
          <p className="text-accent-strong dark:text-accent text-[11px] font-bold tracking-[0.18em] uppercase">
            Dispatches for your inbox
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
            Keep the signal. Skip the noise.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            New engineering notes and practical guides, delivered occasionally. Unsubscribe whenever
            you want.
          </p>
          <div className="mx-auto mt-7 max-w-md">
            <NewsletterForm />
          </div>
        </div>
      </section>
    </div>
  )
}

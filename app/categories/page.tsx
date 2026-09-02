import Link from 'next/link'
import { publishedBlogs } from '@/data/publishedBlogs'
import { categories } from '@/data/categories'
import { genPageMetadata } from '@/app/seo'

export const metadata = genPageMetadata({
  title: 'Categories',
  description: 'Browse engineering writing by category.',
})

export default function CategoriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <p className="text-accent text-xs font-bold tracking-[0.2em] uppercase">Browse the archive</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-gray-900 dark:text-white">
        Topics with a point of view.
      </h1>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const count = publishedBlogs.filter(
            (post) => (post.category || 'developer-tools') === category.id
          ).length
          return (
            <Link
              key={category.id}
              href={`/categories/${category.id}`}
              className="group rounded-2xl border border-gray-200 bg-white p-6 transition hover:-translate-y-1 hover:border-orange-400 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <span
                className="block h-1 w-10 rounded-full"
                style={{ backgroundColor: category.accent }}
              />
              <h2 className="mt-6 text-xl font-bold text-gray-900 group-hover:text-orange-500 dark:text-white">
                {category.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                {category.description}
              </p>
              <p className="mt-6 text-xs font-bold tracking-widest text-orange-500 uppercase">
                {count} articles →
              </p>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

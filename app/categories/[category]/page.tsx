import { notFound } from 'next/navigation'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { publishedBlogs } from '@/data/publishedBlogs'
import { categories, categoryById } from '@/data/categories'
import StackBlogLayout from '@/layouts/StackBlogLayout'

export function generateStaticParams() {
  return categories.map(({ id }) => ({ category: id }))
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: id } = await params
  const category = categoryById(id)
  if (!category) notFound()
  const posts = allCoreContent(
    sortPosts(publishedBlogs.filter((post) => (post.category || 'developer-tools') === id))
  )
  return (
    <StackBlogLayout
      posts={posts}
      initialDisplayPosts={posts}
      pagination={{ currentPage: 1, totalPages: 1 }}
      title={category.name}
    />
  )
}

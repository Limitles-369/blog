import { sortPosts, allCoreContent } from 'pliny/utils/contentlayer'
import { publishedBlogs } from '@/data/publishedBlogs'
import HeroMain from './HeroMain'

export default async function Page() {
  const sortedPosts = sortPosts(publishedBlogs)
  const posts = allCoreContent(sortedPosts)
  return <HeroMain posts={posts} />
}

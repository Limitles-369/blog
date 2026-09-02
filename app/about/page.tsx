import { Authors, allAuthors } from 'contentlayer/generated'
import { MDXLayoutRenderer } from 'pliny/mdx-components'
import AuthorLayout from '@/layouts/AuthorLayout'
import { coreContent } from 'pliny/utils/contentlayer'
import siteMetadata from '@/data/siteMetadata'
import { genPageMetadata } from '@/app/seo'

export const metadata = genPageMetadata({ title: 'About' })

export default function Page() {
  const author = allAuthors.find((p) => p.slug === 'default') as Authors
  const mainContent = coreContent(author)

  // ProfilePage + Person lets search engines tie the byline on every post to a
  // real identity, which is what surfaces an author knowledge panel.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: author.name,
      url: `${siteMetadata.siteUrl}/about/`,
      image: author.avatar ? `${siteMetadata.siteUrl}${author.avatar}` : undefined,
      jobTitle: author.occupation,
      worksFor: author.company ? { '@type': 'Organization', name: author.company } : undefined,
      email: author.email ? `mailto:${author.email}` : undefined,
      sameAs: [author.github, author.linkedin, author.twitter].filter(Boolean),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <AuthorLayout content={mainContent}>
        <MDXLayoutRenderer code={author.body.code} />
      </AuthorLayout>
    </>
  )
}

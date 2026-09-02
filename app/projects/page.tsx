import ProjectCard from '@/components/ProjectCard'
import Link from '@/components/Link'
import projectsData from '@/data/projectsData'
import siteMetadata from '@/data/siteMetadata'
import { genPageMetadata } from '@/app/seo'

export const metadata = genPageMetadata({
  title: 'Projects',
  description:
    'Web and mobile projects by Akash Samui, built with React, Next.js, Node.js, Flutter, and Three.js.',
})

export default function Projects() {
  return (
    <div className="divide-edge divide-y dark:divide-white/10">
      <header className="space-y-3 pt-6 pb-8 md:space-y-4">
        <h1 className="text-3xl leading-9 font-extrabold tracking-tight text-gray-900 sm:text-4xl sm:leading-10 md:text-5xl md:leading-14 dark:text-white">
          Projects
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-300">
          Things I&apos;ve designed and built — mostly full-stack web apps, with some 3D and mobile
          work.
        </p>
      </header>

      <div className="pt-10 pb-12">
        {projectsData.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {projectsData.map((project) => (
              <ProjectCard key={project.title} {...project} />
            ))}
          </div>
        ) : (
          <div className="border-edge dark:bg-surface-dark rounded-2xl border border-dashed bg-white px-6 py-12 text-center dark:border-white/10">
            <p className="text-base font-medium text-gray-900 dark:text-white">
              Case studies are on the way.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              I&apos;m writing these up properly rather than dropping in screenshots. In the
              meantime, the code is on GitHub and the writing is on the blog.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <Link
                href={siteMetadata.github}
                className="text-accent-strong dark:text-accent inline-flex min-h-11 items-center text-sm font-semibold"
              >
                GitHub
                <span aria-hidden="true"> &rarr;</span>
              </Link>
              <Link
                href="/blog"
                className="inline-flex min-h-11 items-center text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Read the blog
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

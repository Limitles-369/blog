import type { Project } from '@/data/projectsData'
import Image from './Image'
import Link from './Link'

const ProjectCard = ({ title, description, stack, href, repo, imgSrc }: Project) => {
  const primaryHref = href || repo

  return (
    <article className="group border-edge dark:bg-surface-dark flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300 focus-within:-translate-y-1 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/8 dark:border-white/10">
      {imgSrc && (
        <div className="aspect-video overflow-hidden">
          <Image
            alt={`Screenshot of ${title}`}
            src={imgSrc}
            className="card-img-zoom h-full w-full object-cover object-center"
            width={640}
            height={360}
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          {primaryHref ? (
            <Link
              href={primaryHref}
              className="hover:text-accent-strong dark:hover:text-accent transition-colors"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>

        <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {description}
        </p>

        {stack && stack.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Built with, for ${title}`}>
            {stack.map((tech) => (
              <li
                key={tech}
                className="border-edge rounded-full border px-2.5 py-1 text-xs font-medium text-gray-600 dark:border-white/10 dark:text-gray-300"
              >
                {tech}
              </li>
            ))}
          </ul>
        )}

        {(href || repo) && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {href && (
              <Link
                href={href}
                className="text-accent-strong dark:text-accent inline-flex min-h-11 items-center text-sm font-semibold"
              >
                Live site
                <span aria-hidden="true"> &rarr;</span>
                <span className="sr-only">, {title}</span>
              </Link>
            )}
            {repo && (
              <Link
                href={repo}
                className="inline-flex min-h-11 items-center text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Source
                <span className="sr-only"> code for {title}</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export default ProjectCard

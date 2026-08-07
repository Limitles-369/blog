import Link from './Link'
import siteMetadata from '@/data/siteMetadata'
import SocialIcon from '@/components/social-icons'
import Image from 'next/image'

const footerLinks = {
  Pages: [
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: 'Tags', href: '/tags' },
    { label: 'Projects', href: '/projects' },
    { label: 'About', href: '/about' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms and Conditions', href: '/terms' },
  ],
  Contact: [
    { label: 'Email', href: `mailto:${siteMetadata.email}` },
    { label: 'RSS Feed', href: '/feed.xml' },
  ],
}

export default function Footer() {
  return (
    <footer className="border-edge dark:bg-page-dark mt-16 border-t bg-white dark:border-white/10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 xl:px-10 2xl:px-16">
        {/* Top grid */}
        <div className="grid grid-cols-1 gap-10 py-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12 lg:py-16">
          {/* Brand column */}
          <div className="space-y-5 lg:col-span-2 lg:pr-8">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/static/images/akash-logo.png"
                alt=""
                width={36}
                height={36}
                className="rounded-full"
              />
              <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                {siteMetadata.headerTitle}
              </span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {siteMetadata.description}
            </p>
            <div className="flex items-center gap-4 pt-2">
              <SocialIcon kind="github" href={siteMetadata.github} size={5} />
              <SocialIcon kind="x" href={siteMetadata.x} size={5} />
              <SocialIcon kind="instagram" href={siteMetadata.instagram} size={5} />
              <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size={5} />
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="mb-5 text-sm font-semibold tracking-wide text-gray-900 dark:text-white">
                {heading}
              </h3>
              <ul className="space-y-3.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="hover:text-accent-strong dark:hover:text-accent inline-flex min-h-9 items-center text-sm font-medium text-gray-600 transition-colors dark:text-gray-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-edge flex flex-col items-center justify-center gap-3 border-t py-8 text-sm font-medium text-gray-600 sm:flex-row dark:border-white/10 dark:text-gray-400">
          <span>© {new Date().getFullYear()} Akash Samui. All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}

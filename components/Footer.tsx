import Link from './Link'
import siteMetadata from '@/data/siteMetadata'
import SocialIcon from '@/components/social-icons'
import Image from 'next/image'

const footerLinks = {
  Articles: [
    { label: 'Technology', href: '/tags/technology' },
    { label: 'Tools', href: '/tags/tools' },
    { label: 'Design', href: '/tags/design' },
    { label: 'Productivity', href: '/tags/productivity' },
  ],
  Products: [
    { label: 'Podcast', href: '#' },
    { label: 'Assets', href: '#' },
    { label: 'Product Hunt', href: '#' },
    { label: 'Newsletter', href: '#' },
  ],
  'Social Media': [
    { label: 'Instagram', href: siteMetadata.instagram || '#' },
    { label: 'Twitter / X', href: siteMetadata.x || '#' },
    { label: 'LinkedIn', href: siteMetadata.linkedin || '#' },
    { label: 'GitHub', href: siteMetadata.github || '#' },
  ],
}

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-[#E8E4DF] bg-white dark:border-white/10 dark:bg-[#0f0f0f]">
      <div className="px-4 sm:px-6 xl:px-10 2xl:px-16">
        {/* Top grid */}
        <div className="grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/static/images/akash-logo.png"
                alt="Akash Logo"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span className="text-base font-bold text-gray-900 dark:text-white">
                {siteMetadata.headerTitle}
              </span>
            </Link>
            <p className="max-w-[220px] text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {siteMetadata.description}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <SocialIcon kind="github" href={siteMetadata.github} size={5} />
              <SocialIcon kind="x" href={siteMetadata.x} size={5} />
              <SocialIcon kind="instagram" href={siteMetadata.instagram} size={5} />
              <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size={5} />
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{heading}</h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-500 transition-colors hover:text-[#FF8A1E] dark:text-gray-400 dark:hover:text-[#FF8A1E]"
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
        <div className="flex flex-col items-center justify-between gap-3 border-t border-[#E8E4DF] py-6 text-sm text-gray-400 dark:border-white/10 sm:flex-row">
          <span>© {new Date().getFullYear()} Akash. All rights reserved.</span>
          <span>
            Built with{' '}
            <Link
              href="https://github.com/timlrx/tailwind-nextjs-starter-blog"
              className="text-[#FF8A1E] hover:underline"
            >
              Tailwind Next.js Blog
            </Link>
          </span>
        </div>
      </div>
    </footer>
  )
}

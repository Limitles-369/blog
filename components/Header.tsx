'use client'

import { useState, useEffect } from 'react'
import siteMetadata from '@/data/siteMetadata'
import headerNavLinks from '@/data/headerNavLinks'
import Link from './Link'
import MobileNav from './MobileNav'
import ThemeSwitch from './ThemeSwitch'
import SearchButton from './SearchButton'
import { usePathname } from 'next/navigation'
import Image from 'next/image'

const Header = () => {
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 16)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full pt-3">
      {/* Width and gutters come from the parent SectionContainer */}
      <div className="w-full">
        <div
          className={`flex items-center justify-between rounded-full px-5 py-2 transition-all duration-300 ${
            scrolled
              ? 'border-edge dark:bg-page-dark/90 border bg-white/90 shadow-lg shadow-black/5 backdrop-blur-md dark:border-white/10'
              : 'border-edge/60 dark:bg-page-dark/70 border bg-white/70 backdrop-blur-sm dark:border-white/10'
          }`}
        >
          {/* Left: Logo + Brand */}
          <Link href="/" className="flex items-center gap-2.5 py-2">
            <Image
              src="/static/images/akash-logo.png"
              alt=""
              width={32}
              height={32}
              className="rounded-full"
              priority
            />
            {typeof siteMetadata.headerTitle === 'string' ? (
              <span className="hidden text-base font-bold tracking-tight text-gray-900 sm:block dark:text-white">
                {siteMetadata.headerTitle}
              </span>
            ) : (
              siteMetadata.headerTitle
            )}
            <span className="sr-only">{siteMetadata.headerTitle} — home</span>
          </Link>

          {/* Center: Nav links */}
          <nav aria-label="Main" className="no-scrollbar hidden items-center gap-1 sm:flex">
            {headerNavLinks
              .filter((link) => link.href !== '/')
              .map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.title}
                    href={link.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-accent text-accent-ink font-semibold'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    {link.title}
                  </Link>
                )
              })}
          </nav>

          {/* Right: Search + Theme + Mobile */}
          <div className="flex items-center gap-2">
            <SearchButton />
            <ThemeSwitch />
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header

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
      {/* Pill constrained to max-w-4xl, centered */}
      <div className="mx-auto max-w-4xl px-4">
        <div
          className={`flex items-center justify-between rounded-full px-5 py-2 transition-all duration-300 ${
            scrolled
              ? 'border border-[#E8E4DF] bg-white/90 shadow-lg shadow-black/5 backdrop-blur-md dark:border-white/10 dark:bg-[#0f0f0f]/90'
              : 'border border-[#E8E4DF]/60 bg-white/70 backdrop-blur-sm dark:border-white/8 dark:bg-[#0f0f0f]/70'
          } `}
        >
          {/* Left: Logo + Brand */}
          <Link
            href="/"
            aria-label={siteMetadata.headerTitle}
            className="flex items-center gap-2.5"
          >
            <Image
              src="/static/images/akash-logo.png"
              alt="Akash Logo"
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
          </Link>

          {/* Center: Nav links */}
          <nav className="no-scrollbar hidden items-center gap-1 overflow-x-auto sm:flex">
            {headerNavLinks
              .filter((link) => link.href !== '/')
              .map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.title}
                    href={link.href}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-[#FF8A1E] text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    {link.title}
                  </Link>
                )
              })}
          </nav>

          {/* Right: Search + Theme + CTA + Mobile */}
          <div className="flex items-center gap-2">
            <SearchButton />
            <ThemeSwitch />
            <Link
              href="/blog"
              className="hidden rounded-full bg-[#FF8A1E] px-4 py-1.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#e6780f] hover:shadow-md hover:shadow-orange-200 sm:block dark:hover:shadow-orange-900/30"
            >
              Newsletter
            </Link>
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header

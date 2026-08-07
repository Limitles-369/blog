import {
  Mail,
  Github,
  Facebook,
  Youtube,
  Linkedin,
  Twitter,
  X,
  Mastodon,
  Threads,
  Instagram,
  Medium,
  Bluesky,
} from './icons'

const components = {
  mail: Mail,
  github: Github,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  twitter: Twitter,
  x: X,
  mastodon: Mastodon,
  threads: Threads,
  instagram: Instagram,
  medium: Medium,
  bluesky: Bluesky,
}

type SocialIconProps = {
  kind: keyof typeof components
  href: string | undefined
  size?: number
}

const SocialIcon = ({ kind, href, size = 8 }: SocialIconProps) => {
  if (
    !href ||
    (kind === 'mail' && !/^mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(href))
  )
    return null

  const SocialSvg = components[kind]

  // Static lookup: `h-${size}` is composed at runtime, so Tailwind's scanner
  // never sees it and only emits those utilities if another file happens to
  // contain the same literal. These strings are scannable.
  const sizeClasses: Record<number, string> = {
    5: 'h-5 w-5',
    6: 'h-6 w-6',
    8: 'h-8 w-8',
    10: 'h-10 w-10',
  }

  return (
    <a
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
      target="_blank"
      rel="noopener noreferrer"
      href={href}
    >
      <span className="sr-only">{`${kind.charAt(0).toUpperCase()}${kind.slice(1)}${
        kind === 'mail' ? '' : ' (opens in a new tab)'
      }`}</span>
      <SocialSvg
        aria-hidden="true"
        className={`hover:text-accent-strong dark:hover:text-accent fill-current text-gray-700 dark:text-gray-200 ${
          sizeClasses[size] ?? sizeClasses[8]
        }`}
      />
    </a>
  )
}

export default SocialIcon

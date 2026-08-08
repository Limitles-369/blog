import { existsSync } from 'node:fs'
import path from 'node:path'

import { externalLinks, internalLinks } from '../corpus/style.js'
import { err, warn, type Gate, type GateFinding } from './types.js'

/**
 * Referenced local assets must exist.
 *
 * This cannot be delegated to the build. pliny's remarkImgToJsx is guarded by
 * `if (fs.existsSync(process.cwd() + '/public' + url))` — when the file is
 * missing it does not throw, it just leaves the node as a bare <img> with no
 * width or height. The build stays green and production gets a broken,
 * layout-shifting image. So the gate has to check the filesystem itself.
 */

function collectAssetRefs(body: string): { url: string; line: number }[] {
  const refs: { url: string; line: number }[] = []
  for (const [i, line] of body.split('\n').entries()) {
    const mdRe = /!\[[^\]]*\]\((\/[^)\s]+)/g
    let m: RegExpExecArray | null
    while ((m = mdRe.exec(line)) !== null) if (m[1]) refs.push({ url: m[1], line: i + 1 })

    const srcRe = /\bsrc=["'](\/[^"']+)["']/g
    while ((m = srcRe.exec(line)) !== null) if (m[1]) refs.push({ url: m[1], line: i + 1 })
  }
  return refs
}

export const assetsExistGate: Gate = {
  name: 'assets-exist',
  run(ctx): GateFinding[] {
    const findings: GateFinding[] = []

    const images = Array.isArray(ctx.frontmatter['images']) ? ctx.frontmatter['images'] : []
    for (const rel of images) {
      if (typeof rel !== 'string') continue
      if (!existsSync(path.join(ctx.publicDir, rel))) {
        findings.push(err(this.name, `Frontmatter image is missing on disk: public${rel}`))
      }
    }

    for (const ref of collectAssetRefs(ctx.body)) {
      if (!existsSync(path.join(ctx.publicDir, ref.url))) {
        findings.push(
          err(
            this.name,
            `Referenced asset is missing on disk: public${ref.url} (the build will silently ship a broken image)`,
            ref.line + ctx.bodyLineOffset
          )
        )
      }
    }
    return findings
  },
}

/**
 * Internal links must resolve to a real slug, with a trailing slash.
 * next.config.js sets trailingSlash: true, so /blog/foo 308-redirects — a
 * needless hop that also shows up as a redirect chain in crawl reports.
 */
export const internalLinksGate: Gate = {
  name: 'internal-links',
  run(ctx): GateFinding[] {
    const findings: GateFinding[] = []
    const KNOWN_ROOTS = new Set(['/blog', '/tags', '/projects', '/about', '/'])

    for (const [i, line] of ctx.body.split('\n').entries()) {
      for (const href of internalLinks(line)) {
        if (href.startsWith('/static/')) continue
        const lineNo = i + 1 + ctx.bodyLineOffset
        const blogMatch = /^\/blog\/([^/#?]+)\/?$/.exec(href)
        if (blogMatch?.[1]) {
          const slug = blogMatch[1]
          if (!ctx.existingSlugs.has(slug) && slug !== ctx.slug) {
            findings.push(err(this.name, `Internal link to unknown post: ${href}`, lineNo))
          } else if (!href.endsWith('/')) {
            findings.push(
              warn(this.name, `Internal link should end with a slash (trailingSlash: true): ${href}`, lineNo)
            )
          }
          continue
        }
        const root = `/${href.split('/')[1] ?? ''}`
        if (!KNOWN_ROOTS.has(root)) {
          findings.push(warn(this.name, `Unrecognised internal path: ${href}`, lineNo))
        }
      }
    }
    return findings
  },
}

/**
 * External links are reachable. A warn, not an error: transient 5xx, rate
 * limiting, and bot-blocking WAFs are all common enough that failing closed
 * here would wedge the pipeline on perfectly good posts.
 */
export const externalLinksGate: Gate = {
  name: 'external-links',
  network: true,
  async run(ctx): Promise<GateFinding[]> {
    const findings: GateFinding[] = []
    const seen = new Map<string, number>()

    for (const [i, line] of ctx.body.split('\n').entries()) {
      for (const url of externalLinks(line)) {
        if (!seen.has(url)) seen.set(url, i + 1 + ctx.bodyLineOffset)
      }
    }

    const checks = [...seen.entries()].map(async ([url, line]) => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        let res: Response
        try {
          res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
          // Plenty of servers reject HEAD but serve GET.
          if (res.status === 405 || res.status === 403 || res.status === 501) {
            res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
          }
        } finally {
          clearTimeout(timer)
        }
        if (res.status >= 400) {
          findings.push(warn(this.name, `External link returned ${res.status}: ${url}`, line))
        }
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        findings.push(warn(this.name, `External link unreachable (${reason}): ${url}`, line))
      }
    })

    await Promise.all(checks)
    if (seen.size === 0) {
      findings.push(warn(this.name, 'Post cites no external sources'))
    }
    return findings
  },
}

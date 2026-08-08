import { extractHeadings } from '../corpus/style.js'
import { err, warn, type Gate, type GateFinding } from './types.js'

/**
 * Heading hierarchy.
 *
 * No H1: PostLayout renders the title as the page's H1 from frontmatter, so a
 * body H1 produces two H1s — an accessibility defect and a real SEO problem.
 * No skipped levels: an H2 to H4 jump breaks the document outline that screen
 * readers and the TOC both rely on.
 */
export const headingHierarchyGate: Gate = {
  name: 'heading-hierarchy',
  run(ctx): GateFinding[] {
    const findings: GateFinding[] = []
    const headings = extractHeadings(ctx.body)
    const loc = (line: number) => line + ctx.bodyLineOffset

    if (headings.length === 0) {
      findings.push(err(this.name, 'Body has no headings at all'))
      return findings
    }

    let previous = 1 // the frontmatter title is the implicit H1
    for (const h of headings) {
      if (h.depth === 1) {
        findings.push(
          err(this.name, `H1 "${h.text}" is not allowed; the title already renders as H1`, loc(h.line))
        )
        continue
      }
      if (h.depth > previous + 1) {
        findings.push(
          err(
            this.name,
            `Heading level jumps from H${previous} to H${h.depth} at "${h.text}"`,
            loc(h.line)
          )
        )
      }
      previous = h.depth
    }

    const h2s = headings.filter((h) => h.depth === 2)
    if (h2s.length < 3) {
      findings.push(warn(this.name, `Only ${h2s.length} H2 sections; posts here usually have more`))
    }

    const seen = new Map<string, number>()
    for (const h of headings) {
      const key = h.text.toLowerCase()
      const first = seen.get(key)
      if (first !== undefined) {
        findings.push(
          warn(this.name, `Duplicate heading "${h.text}" (also at line ${loc(first)})`, loc(h.line))
        )
      } else {
        seen.set(key, h.line)
      }
    }
    return findings
  },
}

/**
 * JSX component allowlist.
 *
 * This is the highest-probability post-merge build failure. An unknown
 * component like <Callout> compiles fine in contentlayer — esbuild just emits
 * a reference — and then throws "Element type is invalid" during SSG on the
 * deploy, after the PR has merged. Only the components in
 * components/MDXComponents.tsx plus intrinsic HTML tags can resolve.
 */
const ALLOWED_COMPONENTS = new Set([
  'Image',
  'TOCInline',
  'BlogNewsletterForm',
  'a',
  'pre',
  'table',
])

const ALLOWED_HTML = new Set([
  'p', 'div', 'span', 'strong', 'em', 'code', 'br', 'hr', 'ul', 'ol', 'li',
  'blockquote', 'h2', 'h3', 'h4', 'h5', 'h6', 'thead', 'tbody', 'tr', 'th',
  'td', 'figure', 'figcaption', 'sup', 'sub', 'del', 'kbd', 'small', 'video',
  'source', 'picture', 'img',
])

export const componentAllowlistGate: Gate = {
  name: 'component-allowlist',
  run(ctx): GateFinding[] {
    const findings: GateFinding[] = []
    const lines = ctx.body.split('\n')
    let inFence = false

    for (const [i, line] of lines.entries()) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        continue
      }
      if (inFence) continue

      const re = /<([A-Za-z][A-Za-z0-9.]*)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        const tag = m[1]
        if (!tag) continue
        const isComponent = /^[A-Z]/.test(tag)
        const known = isComponent ? ALLOWED_COMPONENTS.has(tag) : ALLOWED_HTML.has(tag)
        if (!known) {
          findings.push(
            err(
              this.name,
              isComponent
                ? `<${tag}> is not in components/MDXComponents.tsx; it will break the production build`
                : `<${tag}> is not an allowed HTML tag here`,
              i + 1 + ctx.bodyLineOffset
            )
          )
        }
      }
    }
    return findings
  },
}

/**
 * Secret scan. The model sees grounded web content and could echo a key it
 * found; a leaked credential in a public repo is unrecoverable.
 */
const SECRET_RULES: { label: string; re: RegExp }[] = [
  { label: 'Google API key', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { label: 'GitHub token', re: /gh[pousr]_[0-9A-Za-z]{20,}/ },
  { label: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { label: 'bearer token', re: /\bBearer\s+[0-9A-Za-z._-]{24,}/ },
]

export const secretScanGate: Gate = {
  name: 'secret-scan',
  run(ctx): GateFinding[] {
    const findings: GateFinding[] = []
    for (const [i, line] of ctx.source.split('\n').entries()) {
      for (const rule of SECRET_RULES) {
        if (rule.re.test(line)) {
          // Never echo the match itself into logs or the PR body.
          findings.push(err(this.name, `Possible ${rule.label} on this line`, i + 1))
        }
      }
    }
    return findings
  },
}

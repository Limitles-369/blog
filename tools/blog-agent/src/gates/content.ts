import { countWords, extractHeadings, stripFences } from '../corpus/style.js'
import { frontmatterSchema, LAYOUTS } from '../mdx/frontmatter.js'
import { err, warn, type Gate, type GateFinding } from './types.js'

/**
 * Frontmatter schema, slug uniqueness, author and layout resolvability.
 *
 * The layout check matters more than it looks: contentlayer types `layout` as a
 * bare string, so an unknown value passes the build and then throws
 * "Element type is invalid" during static generation on deploy.
 * layouts/StackBlogLayout.tsx exists on disk but is not in the layout map in
 * app/blog/[...slug]/page.tsx, which makes it a convincing wrong answer.
 */
export const frontmatterGate: Gate = {
  name: 'frontmatter',
  run(ctx): GateFinding[] {
    const findings: GateFinding[] = []

    const parsed = frontmatterSchema.safeParse(ctx.frontmatter)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.') || '(root)'
        findings.push(err(this.name, `${field}: ${issue.message}`))
      }
    }

    if (ctx.existingSlugs.has(ctx.slug)) {
      findings.push(err(this.name, `Slug "${ctx.slug}" already exists in data/blog`))
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ctx.slug)) {
      findings.push(err(this.name, `Slug "${ctx.slug}" is not lowercase kebab-case`))
    }
    if (ctx.slug.length > 70) {
      findings.push(
        warn(this.name, `Slug is ${ctx.slug.length} chars; under 70 reads better in SERPs`)
      )
    }

    const authors = ctx.frontmatter['authors']
    if (Array.isArray(authors)) {
      for (const a of authors) {
        if (typeof a === 'string' && !ctx.knownAuthors.has(a)) {
          findings.push(err(this.name, `Author "${a}" has no file under data/authors`))
        }
      }
    }

    const layout = ctx.frontmatter['layout']
    if (typeof layout === 'string' && !LAYOUTS.includes(layout as (typeof LAYOUTS)[number])) {
      findings.push(
        err(this.name, `Layout "${layout}" is not in the layout map; the deploy build will throw`)
      )
    }

    if (ctx.frontmatter['draft'] === true) {
      findings.push(
        err(this.name, 'draft: true would publish nothing; the pipeline must emit draft: false')
      )
    }
    return findings
  },
}

/**
 * Length, structure balance, and readability. Mostly warns — these are
 * editorial judgements, and blocking on them would wedge the pipeline over
 * matters a human reviewer can simply weigh in the PR.
 */
export interface ContentBandOptions {
  minWords: number
  maxWords: number
}

export function makeContentQualityGate(opts: ContentBandOptions): Gate {
  return {
    name: 'content-quality',
    run(ctx): GateFinding[] {
      const findings: GateFinding[] = []
      const words = countWords(ctx.body)

      // Hard floor: a stub post is worse than no post, and this is the shape a
      // truncated or refused model response takes.
      if (words < Math.min(400, opts.minWords)) {
        findings.push(err(this.name, `Body is only ${words} words; likely a truncated generation`))
      } else if (words < opts.minWords) {
        findings.push(warn(this.name, `Body is ${words} words, below the ${opts.minWords} target`))
      }
      if (words > opts.maxWords) {
        findings.push(warn(this.name, `Body is ${words} words, above the ${opts.maxWords} target`))
      }

      const prose = stripFences(ctx.body)
      const paragraphs = prose
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p !== '' && !/^[#>\-*|<]/.test(p))

      const longParas = paragraphs.filter((p) => countWords(p) > 140)
      if (longParas.length > 0) {
        findings.push(warn(this.name, `${longParas.length} paragraph(s) exceed 140 words`))
      }

      const headings = extractHeadings(ctx.body)
      const sectionCount = headings.filter((h) => h.depth === 2).length
      if (sectionCount > 0 && words / sectionCount > 500) {
        findings.push(warn(this.name, 'Sections average over 500 words; consider more subheadings'))
      }

      // Filler phrasing that reads as machine-written.
      const TELLS = [
        /\bin (?:today|this)'?s? (?:fast[- ]paced|ever[- ]changing|digital) (?:world|landscape)\b/i,
        /\bin the world of\b/i,
        /\bit'?s worth noting that\b/i,
        /\bdelve into\b/i,
        /\bunlock the (?:power|potential)\b/i,
        /\bgame[- ]changer\b/i,
        /\bin conclusion,/i,
        /\bas an AI\b/i,
        /\bI (?:cannot|can't) (?:browse|access)\b/i,
      ]
      for (const [i, line] of ctx.body.split('\n').entries()) {
        for (const re of TELLS) {
          if (re.test(line)) {
            findings.push(
              warn(
                this.name,
                `Formulaic phrasing: "${(re.exec(line) ?? [''])[0]}"`,
                i + 1 + ctx.bodyLineOffset
              )
            )
          }
        }
      }

      // A leaked instruction or scaffolding marker is a hard fail.
      for (const [i, line] of ctx.body.split('\n').entries()) {
        if (/\b(TODO|FIXME|TBD|XXX|LOREM IPSUM|\[insert[^\]]*\]|\{\{[^}]*\}\})/i.test(line)) {
          findings.push(
            err(
              this.name,
              'Placeholder or scaffolding text left in the body',
              i + 1 + ctx.bodyLineOffset
            )
          )
        }
      }
      return findings
    },
  }
}

/** Publication date must be today in UTC — a wrong date breaks feed ordering. */
export function makeDateGate(today: string): Gate {
  return {
    name: 'date-sanity',
    run(ctx): GateFinding[] {
      const date = ctx.frontmatter['date']
      if (typeof date !== 'string') return [err(this.name, 'date is missing')]
      if (date !== today) {
        return [err(this.name, `date is "${date}" but today is "${today}"`)]
      }
      return []
    },
  }
}

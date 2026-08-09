import { FIELD_ORDER, type Frontmatter } from './frontmatter.js'

/**
 * Serialises frontmatter to YAML by hand rather than via a YAML library.
 *
 * A generic dumper produces valid YAML that does not look like the rest of the
 * repo — it quotes differently, picks flow vs block style by width, and may
 * reorder keys. Since these files land in PRs beside hand-written posts, the
 * output style is part of the contract. The existing posts use single quotes
 * for scalars, flow-style arrays, and unquoted enum-ish values.
 *
 * Note the site's Prettier hook will reformat MDX on commit. The pipeline runs
 * Prettier explicitly BEFORE the gates so the validated bytes are the
 * committed bytes; this function only needs to produce Prettier-stable output.
 */

/** Single-quoted YAML scalar; internal single quotes are doubled. */
function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function yamlFlowArray(values: readonly string[]): string {
  return `[${values.map(yamlString).join(', ')}]`
}

export function serializeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = ['---']
  for (const key of FIELD_ORDER) {
    const value = fm[key]
    if (value === undefined) continue

    if (key === 'layout') {
      // Unquoted, matching the existing posts.
      lines.push(`${key}: ${String(value)}`)
    } else if (key === 'draft') {
      lines.push(`${key}: ${value === true ? 'true' : 'false'}`)
    } else if (Array.isArray(value)) {
      lines.push(`${key}: ${yamlFlowArray(value)}`)
    } else {
      lines.push(`${key}: ${yamlString(String(value))}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

export interface SerializeInput {
  frontmatter: Frontmatter
  body: string
}

/**
 * Normalises the body before it is written:
 *  - CRLF to LF, since a Windows-authored model response would otherwise
 *    produce a whole-file diff on every subsequent Prettier run
 *  - collapses 3+ blank lines
 *  - guarantees exactly one trailing newline
 */
export function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

export function serializePost(input: SerializeInput): string {
  return `${serializeFrontmatter(input.frontmatter)}\n\n${normalizeBody(input.body)}`
}

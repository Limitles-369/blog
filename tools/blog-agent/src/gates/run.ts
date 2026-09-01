import matter from 'gray-matter'

import { paths } from '../config/paths.js'
import { allSlugs, readAuthorIds, readCorpus } from '../corpus/reader.js'
import type { Logger } from '../lib/logger.js'
import { runCompileGate } from './compile.js'
import { assetsExistGate, externalLinksGate, internalLinksGate } from './assets.js'
import { makeContentQualityGate, makeDateGate, frontmatterGate } from './content.js'
import {
  componentAllowlistGate,
  headingHierarchyGate,
  mediaFreeGate,
  secretScanGate,
} from './structure.js'
import {
  summarize,
  type Gate,
  type GateContext,
  type GateFinding,
  type GateReport,
} from './types.js'

export interface RunGatesInput {
  slug: string
  /** Final serialised bytes, already Prettier-formatted. */
  source: string
  assets?: ReadonlyMap<string, string>
  today: string
  minWords: number
  maxWords: number
  offline: boolean
  logger: Logger
}

export interface RunGatesResult extends GateReport {
  /** app/tag-data.json bytes from the isolated build, to be committed. */
  tagData?: string
}

/**
 * Runs every gate over the final bytes and returns a consolidated report.
 *
 * Ordering is deliberate: the cheap in-process gates run first so an obvious
 * defect is reported in milliseconds, and the expensive contentlayer build runs
 * only if nothing has already failed. Network gates are skipped entirely when
 * offline so `--dry-run` works on a plane.
 */
export async function runGates(input: RunGatesInput): Promise<RunGatesResult> {
  const { slug, source, logger } = input
  const parsed = matter(source)
  const body = parsed.content

  // gray-matter strips the delimiters, so map body lines back to file lines.
  const frontmatterLines = source.slice(0, source.length - body.length).split('\n').length - 1

  const corpus = await readCorpus()
  const ctx: GateContext = {
    source,
    body,
    slug,
    frontmatter: parsed.data as Record<string, unknown>,
    existingSlugs: allSlugs(corpus),
    knownAuthors: await readAuthorIds(),
    publicDir: paths.publicDir,
    bodyLineOffset: frontmatterLines,
  }

  const cheap: Gate[] = [
    frontmatterGate,
    makeDateGate(input.today),
    headingHierarchyGate,
    componentAllowlistGate,
    mediaFreeGate,
    secretScanGate,
    assetsExistGate,
    internalLinksGate,
    makeContentQualityGate({ minWords: input.minWords, maxWords: input.maxWords }),
  ]

  const findings: GateFinding[] = []
  for (const gate of cheap) {
    const t0 = Date.now()
    try {
      findings.push(...(await gate.run(ctx)))
    } catch (cause) {
      findings.push({
        gate: gate.name,
        severity: 'error',
        message: `Gate threw: ${cause instanceof Error ? cause.message : String(cause)}`,
      })
    }
    logger.debug('gate finished', { gate: gate.name, ms: Date.now() - t0 })
  }

  if (!input.offline) {
    findings.push(...(await externalLinksGate.run(ctx)))
  } else {
    logger.info('skipping network gates', { gate: externalLinksGate.name })
  }

  const beforeCompile = summarize(findings)
  if (!beforeCompile.passed) {
    logger.warn('skipping compile gate; cheaper gates already failed', {
      errors: beforeCompile.errors.length,
    })
    return { ...beforeCompile }
  }

  const compiled = await runCompileGate({
    slug,
    source,
    ...(input.assets ? { assets: input.assets } : {}),
    logger,
  })
  findings.push(...compiled.findings)

  const report = summarize(findings)
  return compiled.tagData === undefined ? { ...report } : { ...report, tagData: compiled.tagData }
}

/** Markdown summary for the PR body. */
export function renderReport(report: GateReport): string {
  if (report.findings.length === 0) return 'All gates passed with no findings.'
  const lines: string[] = []
  const fmt = (f: GateFinding) =>
    `- ${f.severity === 'error' ? '**FAIL**' : 'warn'} \`${f.gate}\`${f.line ? ` (line ${f.line})` : ''}: ${f.message}`
  if (report.errors.length > 0) {
    lines.push(`### Blocking (${report.errors.length})`, ...report.errors.map(fmt), '')
  }
  if (report.warnings.length > 0) {
    lines.push(`### Warnings (${report.warnings.length})`, ...report.warnings.map(fmt))
  }
  return lines.join('\n')
}

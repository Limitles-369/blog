/**
 * Gate framework.
 *
 * Two severities, and the distinction is deliberate: `error` blocks the PR,
 * `warn` is recorded in the PR body for the human reviewer. A gate that can
 * fire on a legitimately good post must be a warn, or the pipeline will wedge
 * itself and publish nothing. A gate whose failure ships something broken to
 * production must be an error.
 *
 * Gates run over the FINAL serialised bytes, after Prettier, so what is
 * validated is exactly what gets committed.
 */

export type Severity = 'error' | 'warn'

export interface GateFinding {
  gate: string
  severity: Severity
  message: string
  /** 1-indexed line in the serialised file, when locatable. */
  line?: number
}

export interface GateContext {
  /** Full serialised file contents, frontmatter included. */
  source: string
  /** Body only, frontmatter stripped. */
  body: string
  slug: string
  frontmatter: Record<string, unknown>
  /** Slugs already on disk, drafts included. */
  existingSlugs: ReadonlySet<string>
  /** Author ids resolvable under data/authors. */
  knownAuthors: ReadonlySet<string>
  /** Absolute path to public/, for asset existence checks. */
  publicDir: string
  /** Offset added to body line numbers to map back to the file. */
  bodyLineOffset: number
}

export interface Gate {
  name: string
  /** Network access required; skipped when OFFLINE=1. */
  network?: boolean
  run(ctx: GateContext): Promise<GateFinding[]> | GateFinding[]
}

export interface GateReport {
  findings: GateFinding[]
  errors: GateFinding[]
  warnings: GateFinding[]
  passed: boolean
}

export function summarize(findings: readonly GateFinding[]): GateReport {
  const errors = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity === 'warn')
  return { findings: [...findings], errors, warnings, passed: errors.length === 0 }
}

export const err = (gate: string, message: string, line?: number): GateFinding => ({
  gate,
  severity: 'error',
  message,
  ...(line === undefined ? {} : { line }),
})

export const warn = (gate: string, message: string, line?: number): GateFinding => ({
  gate,
  severity: 'warn',
  message,
  ...(line === undefined ? {} : { line }),
})

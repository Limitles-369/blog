import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { Logger } from '../lib/logger.js'
import type { PublishedEntry, PublishedFile } from '../state/schema.js'

const exec = promisify(execFile)

/**
 * Reconciles local state against GitHub.
 *
 * **GitHub is the authority; `published.json` is a cache.** The write-ahead
 * protocol records a topic as `inflight` and pushes that state *before* the
 * branch and PR exist, so a run that dies in between leaves a record pointing
 * at something that may or may not have been created. Only GitHub knows.
 *
 * Without this step `decidePublish()` blocks forever on the stale `inflight`
 * entry, and the agent silently stops publishing while every run exits green.
 */

export interface RemotePr {
  number: number
  headRefName: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  mergedAt?: string | null
}

export interface ReconcileDeps {
  /** Injected so tests can supply recorded `gh` output. */
  listPrs(): Promise<RemotePr[]>
  listRemoteBranches(): Promise<string[]>
  /** Preserve the draft from a closed-unmerged PR. */
  archiveRejected?(entry: PublishedEntry): Promise<void>
  now: Date
  logger: Logger
}

export interface ReconcileResult {
  published: PublishedFile
  changed: boolean
  notes: string[]
}

export async function reconcile(
  published: PublishedFile,
  deps: ReconcileDeps
): Promise<ReconcileResult> {
  const log = deps.logger.child({ component: 'reconcile' })
  const notes: string[] = []
  let changed = false

  const interesting = published.entries.some((e) => e.state === 'inflight' || e.state === 'open')
  if (!interesting) return { published, changed: false, notes }

  const [prs, branches] = await Promise.all([deps.listPrs(), deps.listRemoteBranches()])
  const byBranch = new Map(prs.map((p) => [p.headRefName, p]))
  const branchSet = new Set(branches)
  const stamp = deps.now.toISOString()

  const entries = await Promise.all(
    published.entries.map(async (entry): Promise<PublishedEntry> => {
      if (entry.state !== 'inflight' && entry.state !== 'open') return entry
      const pr = entry.branch ? byBranch.get(entry.branch) : undefined

      if (!pr) {
        // No PR for this branch. If the branch is absent too, the run died
        // before creating anything — the topic was never really claimed, so
        // release it rather than blocking the agent forever.
        if (entry.state === 'inflight' && (!entry.branch || !branchSet.has(entry.branch))) {
          notes.push(`released ${entry.slug}: inflight with no branch or PR`)
          log.warn('releasing abandoned inflight entry', { slug: entry.slug })
          changed = true
          return { ...entry, state: 'rejected', updatedAt: stamp }
        }
        // Branch exists but no PR: the run died between push and PR creation.
        // Leave it inflight; the orchestrator opens the PR from the branch.
        if (entry.state === 'inflight') {
          notes.push(`${entry.slug}: branch pushed but no PR yet`)
          return entry
        }
        // Was open, now no PR at all — deleted. Treat as rejected.
        notes.push(`${entry.slug}: PR disappeared; marking rejected`)
        changed = true
        return { ...entry, state: 'rejected', updatedAt: stamp }
      }

      if (pr.state === 'MERGED') {
        notes.push(`${entry.slug}: PR #${pr.number} merged`)
        log.info('PR merged', { slug: entry.slug, pr: pr.number })
        changed = true
        return {
          ...entry,
          state: 'merged',
          prNumber: pr.number,
          updatedAt: stamp,
          publishedAt: pr.mergedAt ?? stamp,
        }
      }

      if (pr.state === 'CLOSED') {
        notes.push(`${entry.slug}: PR #${pr.number} closed unmerged`)
        log.info('PR closed without merging', { slug: entry.slug, pr: pr.number })
        if (deps.archiveRejected) await deps.archiveRejected(entry)
        changed = true
        return { ...entry, state: 'rejected', prNumber: pr.number, updatedAt: stamp }
      }

      // OPEN — promote inflight to open now that the PR is confirmed.
      if (entry.state === 'inflight') {
        notes.push(`${entry.slug}: confirmed PR #${pr.number} open`)
        changed = true
        return { ...entry, state: 'open', prNumber: pr.number, updatedAt: stamp }
      }
      return entry.prNumber === pr.number
        ? entry
        : ((changed = true), { ...entry, prNumber: pr.number, updatedAt: stamp })
    })
  )

  return { published: { ...published, entries }, changed, notes }
}

/** Live `gh`/`git` implementations. Kept apart so tests never shell out. */
export function makeReconcileDeps(input: {
  repoRoot: string
  branchPrefix: string
  now: Date
  logger: Logger
  archiveRejected?: (entry: PublishedEntry) => Promise<void>
}): ReconcileDeps {
  const { repoRoot, branchPrefix, logger } = input
  return {
    now: input.now,
    logger,
    ...(input.archiveRejected ? { archiveRejected: input.archiveRejected } : {}),

    async listPrs(): Promise<RemotePr[]> {
      try {
        const { stdout } = await exec(
          'gh',
          [
            'pr',
            'list',
            '--state',
            'all',
            '--limit',
            '50',
            '--search',
            `head:${branchPrefix}`,
            '--json',
            'number,headRefName,state,mergedAt',
          ],
          { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 }
        )
        return JSON.parse(stdout) as RemotePr[]
      } catch (cause) {
        // A reconcile that cannot reach GitHub must not be mistaken for
        // "nothing is open" — that would re-run a topic that already has a PR.
        throw new Error(
          `Could not list bot PRs via gh: ${cause instanceof Error ? cause.message : String(cause)}. ` +
            `Refusing to reconcile against unknown remote state.`
        )
      }
    },

    async listRemoteBranches(): Promise<string[]> {
      const { stdout } = await exec('git', ['ls-remote', '--heads', 'origin', `${branchPrefix}*`], {
        cwd: repoRoot,
        maxBuffer: 8 * 1024 * 1024,
      })
      return stdout
        .split('\n')
        .map((line) => line.split('refs/heads/')[1]?.trim())
        .filter((b): b is string => Boolean(b))
    },
  }
}

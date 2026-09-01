import type { CadenceFile, PublishedFile } from './schema.js'

/** Minimum gap between publications, on top of the UTC-day rule. */
export const MIN_GAP_MS = 20 * 60 * 60 * 1000

/** Only one bot PR may be open at a time — see `decidePublish` for why. */
export const MAX_OPEN_PRS = 1

export interface CadencePolicy {
  minGapMs: number
  maxOpenPrs: number
}

const DEFAULT_POLICY: CadencePolicy = {
  minGapMs: MIN_GAP_MS,
  maxOpenPrs: MAX_OPEN_PRS,
}

export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

export interface PublishDecision {
  publish: boolean
  /** Machine-readable reason, logged and asserted on in tests. */
  reason:
    | 'ok'
    | 'disabled'
    | 'already-published-today'
    | 'min-gap'
    | 'open-pr-exists'
    | 'inflight-exists'
    | 'clock-skew'
  detail?: string
}

export interface DecideInput {
  now: Date
  cadence: CadenceFile
  published: PublishedFile
  enabled: boolean
  policy?: CadencePolicy
}

/**
 * Decides whether this run may write and publish an article.
 *
 * Three independent conditions, all of which must hold. They exist for
 * different reasons and none subsumes the others:
 *
 *  1. **UTC-day key** — the primary cadence rule. Quantising to a day makes the
 *     decision immune to cron jitter. An `elapsed >= 24h` test instead drifts:
 *     each late run pushes the anchor later, the publish hour walks the clock,
 *     and eventually a day gets skipped entirely because all four of its runs
 *     land just under the threshold.
 *
 *  2. **20h floor** — the day key alone would allow 23:50 followed by 00:10.
 *
 *  3. **One open PR** — the cadence rules cap *PR creation*, not publication.
 *     Without this, three queued PRs merged together put three back-dated posts
 *     live at once, which is precisely the pattern the daily cap exists to
 *     avoid. Capping open PRs at 1 makes the real cadence
 *     `min(1/day, author merge rate)`.
 *
 * An `inflight` entry short-circuits everything: a previous run died between
 * writing state and opening its PR, so this run must reconcile rather than
 * generate.
 */
export function decidePublish(input: DecideInput): PublishDecision {
  const { now, cadence, published, enabled } = input
  const policy = input.policy ?? DEFAULT_POLICY

  if (!enabled) {
    return { publish: false, reason: 'disabled', detail: 'control.json has enabled: false' }
  }

  const inflight = published.entries.find((e) => e.state === 'inflight')
  if (inflight) {
    return {
      publish: false,
      reason: 'inflight-exists',
      detail: `${inflight.slug} is inflight from run ${inflight.runId ?? 'unknown'}; reconcile first`,
    }
  }

  const open = published.entries.filter((e) => e.state === 'open')
  if (open.length >= policy.maxOpenPrs) {
    return {
      publish: false,
      reason: 'open-pr-exists',
      detail: `${open.length} open bot PR(s): ${open.map((e) => `#${e.prNumber ?? '?'}`).join(', ')}`,
    }
  }

  if (cadence.lastPublishedAt) {
    const last = Date.parse(cadence.lastPublishedAt)
    if (Number.isNaN(last)) {
      return {
        publish: false,
        reason: 'clock-skew',
        detail: `unparseable lastPublishedAt: ${cadence.lastPublishedAt}`,
      }
    }
    // A future timestamp means corrupt state or a clock problem. Refusing is
    // right: the alternative is publishing on every run until wall-clock
    // catches up, and a stuck-idle pipeline is caught by stall detection.
    if (last > now.getTime()) {
      return {
        publish: false,
        reason: 'clock-skew',
        detail: `lastPublishedAt ${cadence.lastPublishedAt} is in the future`,
      }
    }
    const elapsed = now.getTime() - last
    if (elapsed < policy.minGapMs) {
      return {
        publish: false,
        reason: 'min-gap',
        detail: `${Math.round(elapsed / 3_600_000)}h since last publish, need ${Math.round(policy.minGapMs / 3_600_000)}h`,
      }
    }
  }

  return { publish: true, reason: 'ok' }
}

/** Runs with no PR before stall detection fires. 4 runs/day, so 72h. */
export const STALL_THRESHOLD_RUNS = 12

export function isStalled(cadence: CadenceFile, now: Date): boolean {
  if (cadence.idleRuns < STALL_THRESHOLD_RUNS) return false
  if (!cadence.lastPrOpenedAt) return true
  const since = now.getTime() - Date.parse(cadence.lastPrOpenedAt)
  return since >= 72 * 60 * 60 * 1000
}

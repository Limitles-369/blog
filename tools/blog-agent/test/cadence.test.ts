import { describe, expect, it } from 'vitest'

import {
  decidePublish,
  isStalled,
  MIN_GAP_MS,
  STALL_THRESHOLD_RUNS,
  utcDay,
} from '../src/state/cadence.js'
import {
  emptyCadence,
  emptyPublished,
  STATE_VERSION,
  type CadenceFile,
  type PublishedEntry,
  type PublishedFile,
} from '../src/state/schema.js'

const iso = (s: string) => new Date(s).toISOString()

function entry(over: Partial<PublishedEntry> = {}): PublishedEntry {
  return {
    slug: 'some-post',
    title: 'Some Post',
    dedupText: 'some post',
    textHash: 'a'.repeat(64),
    tags: ['x'],
    state: 'open',
    createdAt: iso('2026-08-01T00:00:00Z'),
    updatedAt: iso('2026-08-01T00:00:00Z'),
    ...over,
  }
}

const withEntries = (entries: PublishedEntry[]): PublishedFile => ({
  version: STATE_VERSION,
  entries,
})

const cadence = (over: Partial<CadenceFile> = {}): CadenceFile => ({
  ...emptyCadence,
  ...over,
})

describe('utcDay', () => {
  it('keys on UTC regardless of local offset', () => {
    expect(utcDay(new Date('2026-08-08T23:59:59Z'))).toBe('2026-08-08')
    expect(utcDay(new Date('2026-08-09T00:00:01Z'))).toBe('2026-08-09')
  })
})

describe('decidePublish', () => {
  const enabled = true

  it('publishes on a clean slate', () => {
    const d = decidePublish({
      now: new Date('2026-08-08T06:17:00Z'),
      cadence: cadence(),
      published: emptyPublished,
      enabled,
    })
    expect(d).toEqual({ publish: true, reason: 'ok' })
  })

  it('respects the kill switch', () => {
    const d = decidePublish({
      now: new Date('2026-08-08T06:17:00Z'),
      cadence: cadence(),
      published: emptyPublished,
      enabled: false,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('disabled')
  })

  it('refuses a second publish on the same UTC day', () => {
    const d = decidePublish({
      now: new Date('2026-08-08T18:17:00Z'),
      cadence: cadence({
        lastPublishedDay: '2026-08-08',
        lastPublishedAt: iso('2026-08-08T00:17:00Z'),
      }),
      published: emptyPublished,
      enabled,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('already-published-today')
  })

  // The regression this whole design exists to prevent. With an elapsed-time
  // test, a 00:15 publish makes the next day's 00:05 run miss by 10 minutes,
  // pushing the anchor 6h later each time until a day is skipped entirely.
  it('does not drift when cron fires slightly early the next day', () => {
    const d = decidePublish({
      now: new Date('2026-08-09T00:05:00Z'), // 23h50m after the anchor
      cadence: cadence({
        lastPublishedDay: '2026-08-08',
        lastPublishedAt: iso('2026-08-08T00:15:00Z'),
      }),
      published: emptyPublished,
      enabled,
    })
    // New UTC day, and past the 20h floor, so it publishes on schedule.
    expect(d.publish).toBe(true)
  })

  it('still enforces a floor across a midnight boundary', () => {
    const d = decidePublish({
      now: new Date('2026-08-09T00:10:00Z'),
      cadence: cadence({
        lastPublishedDay: '2026-08-08',
        lastPublishedAt: iso('2026-08-08T23:50:00Z'),
      }),
      published: emptyPublished,
      enabled,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('min-gap')
  })

  it('publishes exactly at the floor', () => {
    const last = new Date('2026-08-08T12:00:00Z')
    const d = decidePublish({
      now: new Date(last.getTime() + MIN_GAP_MS),
      cadence: cadence({ lastPublishedDay: '2026-08-08', lastPublishedAt: last.toISOString() }),
      published: emptyPublished,
      enabled,
    })
    expect(d.publish).toBe(true)
  })

  // Without this cap, a merged backlog puts several back-dated posts live at
  // once — the burst pattern the daily cap is meant to prevent.
  it('refuses while a bot PR is still open', () => {
    const d = decidePublish({
      now: new Date('2026-08-10T06:17:00Z'),
      cadence: cadence({ lastPublishedDay: '2026-08-08' }),
      published: withEntries([entry({ state: 'open', prNumber: 7 })]),
      enabled,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('open-pr-exists')
  })

  it('ignores merged and rejected entries when counting open PRs', () => {
    const d = decidePublish({
      now: new Date('2026-08-10T06:17:00Z'),
      cadence: cadence({ lastPublishedDay: '2026-08-08' }),
      published: withEntries([
        entry({ slug: 'a', state: 'merged' }),
        entry({ slug: 'b', state: 'rejected' }),
      ]),
      enabled,
    })
    expect(d.publish).toBe(true)
  })

  // A run that died between writing state and opening its PR.
  it('blocks on an inflight entry so the next run reconciles', () => {
    const d = decidePublish({
      now: new Date('2026-08-10T06:17:00Z'),
      cadence: cadence(),
      published: withEntries([entry({ state: 'inflight', runId: '123' })]),
      enabled,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('inflight-exists')
  })

  it('refuses rather than republishing when the anchor is in the future', () => {
    const d = decidePublish({
      now: new Date('2026-08-08T06:00:00Z'),
      cadence: cadence({ lastPublishedAt: iso('2027-01-01T00:00:00Z') }),
      published: emptyPublished,
      enabled,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('clock-skew')
  })

  it('refuses on an unparseable anchor instead of treating it as absent', () => {
    const d = decidePublish({
      now: new Date('2026-08-08T06:00:00Z'),
      cadence: cadence({ lastPublishedAt: 'not-a-date' as string }),
      published: emptyPublished,
      enabled,
    })
    expect(d.publish).toBe(false)
    expect(d.reason).toBe('clock-skew')
  })
})

describe('isStalled', () => {
  const now = new Date('2026-08-08T00:00:00Z')

  it('is quiet below the run threshold', () => {
    expect(isStalled(cadence({ idleRuns: STALL_THRESHOLD_RUNS - 1 }), now)).toBe(false)
  })

  it('fires when idle runs accumulate with no PR ever opened', () => {
    expect(isStalled(cadence({ idleRuns: STALL_THRESHOLD_RUNS }), now)).toBe(true)
  })

  it('stays quiet if a PR was opened recently despite idle runs', () => {
    const c = cadence({
      idleRuns: STALL_THRESHOLD_RUNS + 5,
      lastPrOpenedAt: iso('2026-08-07T12:00:00Z'),
    })
    expect(isStalled(c, now)).toBe(false)
  })

  it('fires once the last PR is older than 72h', () => {
    const c = cadence({
      idleRuns: STALL_THRESHOLD_RUNS,
      lastPrOpenedAt: iso('2026-08-04T00:00:00Z'),
    })
    expect(isStalled(c, now)).toBe(true)
  })
})

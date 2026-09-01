import { describe, expect, it, vi } from 'vitest'

import { createLogger } from '../src/lib/logger.js'
import { reconcile, type RemotePr } from '../src/publish/reconcile.js'
import { STATE_VERSION, type PublishedEntry, type PublishedFile } from '../src/state/schema.js'

const silent = createLogger({ level: 'error', format: 'json', write: () => {} })
const NOW = new Date('2026-08-08T12:00:00Z')

function entry(over: Partial<PublishedEntry> = {}): PublishedEntry {
  return {
    slug: 'a-post',
    title: 'A Post',
    dedupText: 'a post',
    textHash: 'a'.repeat(64),
    tags: ['x'],
    category: 'uncategorized',
    state: 'inflight',
    branch: 'bot/post-a-post-9001',
    runId: '9001',
    createdAt: '2026-08-08T11:00:00Z',
    updatedAt: '2026-08-08T11:00:00Z',
    ...over,
  }
}

const file = (entries: PublishedEntry[]): PublishedFile => ({ version: STATE_VERSION, entries })

/** Shape mirrors `gh pr list --json number,headRefName,state,mergedAt`. */
const pr = (over: Partial<RemotePr> = {}): RemotePr => ({
  number: 12,
  headRefName: 'bot/post-a-post-9001',
  state: 'OPEN',
  ...over,
})

const deps = (prs: RemotePr[], branches: string[], archive?: () => Promise<void>) => ({
  listPrs: async () => prs,
  listRemoteBranches: async () => branches,
  ...(archive ? { archiveRejected: archive } : {}),
  now: NOW,
  logger: silent,
})

describe('reconcile', () => {
  it('does no network work when nothing is inflight or open', async () => {
    const listPrs = vi.fn(async () => [])
    const listRemoteBranches = vi.fn(async () => [])
    const result = await reconcile(file([entry({ state: 'merged' })]), {
      listPrs,
      listRemoteBranches,
      now: NOW,
      logger: silent,
    })
    expect(result.changed).toBe(false)
    expect(listPrs).not.toHaveBeenCalled()
    expect(listRemoteBranches).not.toHaveBeenCalled()
  })

  // The crash this whole protocol exists for: state said inflight, and the PR
  // really was created. Without reconciliation decidePublish() blocks forever.
  it('promotes inflight to open when the PR exists', async () => {
    const result = await reconcile(
      file([entry({ state: 'inflight' })]),
      deps([pr({ state: 'OPEN' })], ['bot/post-a-post-9001'])
    )
    expect(result.changed).toBe(true)
    expect(result.published.entries[0]?.state).toBe('open')
    expect(result.published.entries[0]?.prNumber).toBe(12)
  })

  it('records a merge with the real merge timestamp', async () => {
    const result = await reconcile(
      file([entry({ state: 'open', prNumber: 12 })]),
      deps([pr({ state: 'MERGED', mergedAt: '2026-08-08T09:30:00Z' })], [])
    )
    expect(result.published.entries[0]?.state).toBe('merged')
    expect(result.published.entries[0]?.publishedAt).toBe('2026-08-08T09:30:00Z')
  })

  it('archives the draft when a PR is closed unmerged', async () => {
    const archive = vi.fn(async () => {})
    const result = await reconcile(
      file([entry({ state: 'open', prNumber: 12 })]),
      deps([pr({ state: 'CLOSED' })], [], archive)
    )
    expect(result.published.entries[0]?.state).toBe('rejected')
    // Otherwise the only copy of the article is destroyed with the branch.
    expect(archive).toHaveBeenCalledOnce()
  })

  // Died before pushing anything: the topic was never really claimed.
  it('releases an inflight entry with no branch and no PR', async () => {
    const result = await reconcile(file([entry({ state: 'inflight' })]), deps([], []))
    expect(result.changed).toBe(true)
    expect(result.published.entries[0]?.state).toBe('rejected')
    expect(result.notes[0]).toMatch(/released/)
  })

  // Died between push and PR creation: the branch is real, so keep the claim.
  it('keeps an inflight entry whose branch exists but has no PR', async () => {
    const result = await reconcile(
      file([entry({ state: 'inflight' })]),
      deps([], ['bot/post-a-post-9001'])
    )
    expect(result.published.entries[0]?.state).toBe('inflight')
    expect(result.notes[0]).toMatch(/no PR yet/)
  })

  it('marks a vanished open PR as rejected', async () => {
    const result = await reconcile(file([entry({ state: 'open', prNumber: 12 })]), deps([], []))
    expect(result.published.entries[0]?.state).toBe('rejected')
  })

  it('leaves merged and rejected entries untouched', async () => {
    const before = file([
      entry({ slug: 'm', state: 'merged' }),
      entry({ slug: 'r', state: 'rejected' }),
      entry({ slug: 'o', state: 'open', branch: 'bot/post-o-1', prNumber: 5 }),
    ])
    const result = await reconcile(
      before,
      deps([pr({ number: 5, headRefName: 'bot/post-o-1', state: 'OPEN' })], ['bot/post-o-1'])
    )
    expect(result.published.entries[0]).toEqual(before.entries[0])
    expect(result.published.entries[1]).toEqual(before.entries[1])
    expect(result.changed).toBe(false)
  })

  it('matches PRs by branch name, not by position', async () => {
    const result = await reconcile(
      file([
        entry({ slug: 'first', branch: 'bot/post-first-1', state: 'inflight' }),
        entry({ slug: 'second', branch: 'bot/post-second-2', state: 'inflight' }),
      ]),
      deps(
        [
          pr({ number: 7, headRefName: 'bot/post-second-2', state: 'OPEN' }),
          pr({ number: 8, headRefName: 'bot/post-first-1', state: 'MERGED', mergedAt: null }),
        ],
        ['bot/post-first-1', 'bot/post-second-2']
      )
    )
    expect(result.published.entries[0]?.state).toBe('merged')
    expect(result.published.entries[0]?.prNumber).toBe(8)
    expect(result.published.entries[1]?.state).toBe('open')
    expect(result.published.entries[1]?.prNumber).toBe(7)
  })

  // Treating an API failure as "nothing open" would re-run a topic that
  // already has a PR, so it must propagate rather than degrade.
  it('propagates a listing failure instead of assuming nothing is open', async () => {
    await expect(
      reconcile(file([entry({ state: 'inflight' })]), {
        listPrs: async () => {
          throw new Error('gh: not authenticated')
        },
        listRemoteBranches: async () => [],
        now: NOW,
        logger: silent,
      })
    ).rejects.toThrow(/not authenticated/)
  })
})

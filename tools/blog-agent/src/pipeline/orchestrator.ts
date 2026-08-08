import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { Config } from '../config/env.js'
import { paths } from '../config/paths.js'
import { allSlugs, published as publishedOnly, readCorpus, tagFrequency } from '../corpus/reader.js'
import { computeStyleMetrics } from '../corpus/style.js'
import { runGates } from '../gates/run.js'
import type { GeminiClient } from '../gemini/types.js'
import type { Logger } from '../lib/logger.js'
import { imageKey, slugifyBounded } from '../lib/slugify.js'
import { serializePost } from '../mdx/serialize.js'
import type { Frontmatter } from '../mdx/frontmatter.js'
import { formatMdx, publishPost } from '../publish/pr.js'
import { makeReconcileDeps, reconcile } from '../publish/reconcile.js'
import { checkDuplicate } from '../research/dedup.js'
import { discoverTopics, scoreTopics, type TopicCandidate } from '../research/discover.js'
import { buildOutline, critiqueDraft, refineDraft, writeDraft } from '../stages/draft.js'
import { generateHero, generateMetadata } from '../stages/metadata.js'
import { decidePublish, isStalled, utcDay } from '../state/cadence.js'
import { STATE_VERSION, type PublishedEntry, type QueueEntry } from '../state/schema.js'
import { dedupHash, dedupText, type StateStore } from '../state/store.js'

/**
 * The run loop.
 *
 * Phase ordering is the important part, and it is not the obvious one:
 *
 *   reconcile -> research/score/queue -> cadence check -> draft/gates/publish
 *
 * Research runs on EVERY invocation; only writing is gated. Putting the cadence
 * check first would mean three of the four daily runs exit immediately and the
 * queue never accumulates — the agent would research roughly once a day and
 * always write about whatever it happened to find that morning. Researching
 * first means the queue builds up and the daily post is chosen from a scored
 * backlog rather than a single sample.
 */

export type RunMode = 'auto' | 'research-only' | 'force-publish'

export interface RunOptions {
  mode: RunMode
  dryRun: boolean
  config: Config
  client: GeminiClient
  store: StateStore
  logger: Logger
  now?: Date
  /** Absolute path for artifacts in dry-run mode. */
  artifactDir?: string
}

export interface RunOutcomeShape {
  runId: string
  mode: RunMode
  published: boolean
  slug?: string
  prUrl?: string
  reason: string
  queued: number
  tokens: number
}

export async function runPipeline(opts: RunOptions): Promise<RunOutcomeShape> {
  const now = opts.now ?? new Date()
  const runId = `${utcDay(now).replace(/-/g, '')}-${randomUUID().slice(0, 8)}`
  const log = opts.logger.child({ runId })
  const { config, client, store } = opts

  const outcome = (over: Partial<RunOutcomeShape> & { reason: string }): RunOutcomeShape => ({
    runId,
    mode: opts.mode,
    published: false,
    queued: 0,
    tokens: client.totalUsage().total,
    ...over,
  })

  let state = await store.load()

  if (!state.control.enabled) {
    log.warn('agent disabled by control.json', { note: state.control.note })
    return outcome({ reason: 'disabled' })
  }

  // ---- Phase 1: reconcile against GitHub --------------------------------
  // GitHub is the authority. A previous run may have died between writing
  // `inflight` state and opening its PR, and decidePublish() blocks on an
  // inflight entry — so without this the agent wedges permanently.
  if (!opts.dryRun) {
    const reconciled = await reconcile(state.published, {
      ...makeReconcileDeps({
        repoRoot: paths.root,
        branchPrefix: config.BRANCH_PREFIX,
        now,
        logger: log,
      }),
      archiveRejected: async (entry: PublishedEntry) => {
        log.info('archiving rejected draft', { slug: entry.slug })
      },
    })
    if (reconciled.changed) {
      state = { ...state, published: reconciled.published }
      await store.savePublished(reconciled.published)
      for (const note of reconciled.notes) log.info('reconciled', { note })
    }
  }

  // ---- Phase 2: research and queue (every run) --------------------------
  const corpus = await readCorpus()
  const knownTags = [...tagFrequency(corpus).keys()]
  const queued = await refreshQueue({ ...opts, state, corpus, knownTags, now, log, runId })
  if (queued.added > 0) {
    state = { ...state, queue: queued.queue }
    if (!opts.dryRun) await store.saveQueue(queued.queue)
  }

  if (opts.mode === 'research-only') {
    return outcome({ reason: 'research-only mode', queued: state.queue.entries.length })
  }

  // ---- Phase 3: cadence gate --------------------------------------------
  const decision =
    opts.mode === 'force-publish'
      ? { publish: true as const, reason: 'ok' as const }
      : decidePublish({
          now,
          cadence: state.cadence,
          published: state.published,
          enabled: state.control.enabled,
        })

  if (!decision.publish) {
    log.info('not publishing this run', { reason: decision.reason, detail: decision.detail })
    const cadence = { ...state.cadence, idleRuns: state.cadence.idleRuns + 1 }
    if (!opts.dryRun) await store.saveCadence(cadence)
    if (isStalled(cadence, now)) {
      log.error('pipeline appears stalled — no PR opened recently', {
        idleRuns: cadence.idleRuns,
        lastPrOpenedAt: cadence.lastPrOpenedAt,
      })
    }
    return outcome({ reason: decision.reason, queued: state.queue.entries.length })
  }

  const next = state.queue.entries.slice().sort((a, b) => b.score - a.score)[0]
  if (!next) {
    log.warn('nothing in the queue to write')
    return outcome({ reason: 'empty-queue' })
  }

  // ---- Phase 4: generate -------------------------------------------------
  const metrics = computeStyleMetrics(corpus)
  const exemplars = publishedOnly(corpus).slice(0, 2)
  const topic: TopicCandidate = {
    title: next.title,
    angle: next.angle,
    tags: next.tags,
    rationale: '',
  }

  const ctx = {
    client,
    config,
    topic,
    metrics,
    exemplars,
    researchNotes: next.angle,
    sources: next.sources,
    internalSlugs: publishedOnly(corpus).map((p) => ({ slug: p.slug, title: p.title })),
    logger: log,
  }

  const plan = await log.timed('outline', () => buildOutline(ctx))
  let body = await log.timed('draft', () => writeDraft(ctx, plan))

  const found = await log.timed('critique', () => critiqueDraft(ctx, body))
  if (found.rewriteNeeded || found.issues.some((i) => i.severity === 'blocking')) {
    log.info('refining draft', { issues: found.issues.length })
    body = await log.timed('refine', () => refineDraft(ctx, body, found))
  }

  const meta = await log.timed('metadata', () =>
    generateMetadata({
      client,
      config,
      body,
      workingTitle: plan.workingTitle,
      knownTags,
      logger: log,
    })
  )

  const slug = ensureUniqueSlug(meta.slug, allSlugs(corpus))
  const key = imageKey(slug)
  const heroRel = path.posix.join('static/images/blog', key, 'hero.png')

  const hero = await log.timed('hero image', () =>
    generateHero({ client, subject: meta.imagePrompt, logger: log })
  )

  const frontmatter: Frontmatter = {
    title: meta.title,
    date: utcDay(now),
    tags: meta.tags,
    draft: false,
    summary: meta.summary,
    images: [`/${heroRel}`],
    authors: [config.POST_AUTHOR],
    layout: config.POST_LAYOUT,
  }

  // Prettier runs BEFORE the gates so the validated bytes are the committed
  // bytes — husky's lint-staged would otherwise reformat the file at commit
  // time and invalidate everything the gates just checked.
  const raw = serializePost({ frontmatter, body })
  const source = await formatMdx(paths.root, raw, log)

  // ---- Phase 5: gates ----------------------------------------------------
  const assets = new Map<string, string>()
  const heroAbs = path.join(paths.artifacts, runId, 'hero.png')
  await writeArtifact(heroAbs, hero.bytes)
  assets.set(path.posix.join('public', heroRel), heroAbs)

  const report = await log.timed('gates', () =>
    runGates({
      slug,
      source,
      assets,
      today: utcDay(now),
      minWords: config.TARGET_WORDS_MIN,
      maxWords: config.TARGET_WORDS_MAX,
      offline: config.OFFLINE,
      logger: log,
    })
  )

  if (!report.passed) {
    for (const f of report.errors) log.error('gate failed', { gate: f.gate, message: f.message })
    await writeArtifact(path.join(paths.artifacts, runId, `${slug}.mdx`), Buffer.from(source))
    return outcome({ reason: 'gates-failed', slug })
  }

  if (opts.dryRun) {
    const dir = opts.artifactDir ?? path.join(paths.artifacts, runId)
    await writeArtifact(path.join(dir, `${slug}.mdx`), Buffer.from(source))
    log.info('dry run complete; nothing committed', { dir, slug })
    return outcome({ reason: 'dry-run', slug, queued: state.queue.entries.length })
  }

  // ---- Phase 6: write-ahead state, then publish --------------------------
  // The inflight record is written and pushed BEFORE the branch and PR exist.
  // If the runner dies mid-publish, the next run finds `inflight` and
  // reconciles against GitHub rather than regenerating the same topic — which
  // would otherwise produce a duplicate post and a second post the same day.
  const entry: PublishedEntry = {
    slug,
    title: meta.title,
    dedupText: dedupText({ title: meta.title, summary: meta.summary, tags: meta.tags }),
    textHash: dedupHash(dedupText({ title: meta.title, summary: meta.summary, tags: meta.tags })),
    tags: meta.tags,
    state: 'inflight',
    branch: `${config.BRANCH_PREFIX}${slug}-${runId}`,
    runId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  const withInflight = {
    version: STATE_VERSION as typeof STATE_VERSION,
    entries: [...state.published.entries, entry],
  }
  await store.savePublished(withInflight)
  log.info('wrote inflight state ahead of publishing', { slug, branch: entry.branch })

  const result = await publishPost({
    repoRoot: paths.root,
    slug,
    runId,
    branchPrefix: config.BRANCH_PREFIX,
    title: meta.title,
    source,
    postPath: path.posix.join('data/blog', `${slug}.mdx`),
    assets: new Map([[path.posix.join('public', heroRel), hero.bytes]]),
    ...(report.tagData ? { tagData: report.tagData } : {}),
    report,
    sources: next.sources,
    logger: log,
  })

  const confirmed: PublishedEntry = {
    ...entry,
    state: 'open',
    ...(result.prNumber ? { prNumber: result.prNumber } : {}),
    updatedAt: new Date().toISOString(),
  }
  await store.savePublished({
    version: STATE_VERSION,
    entries: withInflight.entries.map((e) => (e.slug === slug ? confirmed : e)),
  })
  await store.saveCadence({
    ...state.cadence,
    lastPublishedDay: utcDay(now),
    lastPublishedAt: now.toISOString(),
    lastPrOpenedAt: new Date().toISOString(),
    idleRuns: 0,
  })
  await store.saveQueue({
    version: STATE_VERSION,
    entries: state.queue.entries.filter((e) => e.id !== next.id),
  })

  log.info('published', { slug, pr: result.prUrl })
  return outcome({
    published: true,
    reason: 'published',
    slug,
    ...(result.prUrl ? { prUrl: result.prUrl } : {}),
    queued: state.queue.entries.length - 1,
  })
}

async function refreshQueue(input: {
  config: Config
  client: GeminiClient
  store: StateStore
  state: Awaited<ReturnType<StateStore['load']>>
  corpus: Awaited<ReturnType<typeof readCorpus>>
  knownTags: string[]
  now: Date
  log: Logger
  runId: string
  dryRun: boolean
}): Promise<{ queue: typeof input.state.queue; added: number }> {
  const { state, log } = input

  const avoidTitles = [
    ...input.corpus.map((p) => p.title),
    ...state.published.entries.filter((e) => e.state !== 'rejected').map((e) => e.title),
    ...state.queue.entries.map((e) => e.title),
  ]
  const rejectedTitles = state.published.entries
    .filter((e) => e.state === 'rejected')
    .slice(-10)
    .map((e) => e.title)

  const discovered = await log.timed('discover', () =>
    discoverTopics({
      client: input.client,
      knownTags: input.knownTags,
      avoidTitles,
      rejectedTitles,
      logger: log,
    })
  )

  const scores = await scoreTopics({
    client: input.client,
    candidates: discovered.candidates,
    logger: log,
  })

  const fresh: QueueEntry[] = []
  for (const candidate of discovered.candidates) {
    const summary = candidate.angle
    const verdict = await checkDuplicate({
      candidate: { title: candidate.title, summary, tags: candidate.tags },
      corpus: input.corpus,
      published: state.published,
      queue: { ...state.queue, entries: [...state.queue.entries, ...fresh] },
      config: input.config,
      client: input.client,
      store: input.store,
      logger: log,
    })

    if (verdict.duplicate) {
      log.debug('rejected duplicate candidate', { title: candidate.title, reason: verdict.reason })
      continue
    }

    const text = dedupText({ title: candidate.title, summary, tags: candidate.tags })
    fresh.push({
      id: `${input.runId}-${fresh.length}`,
      title: candidate.title,
      angle: candidate.angle,
      dedupText: text,
      textHash: dedupHash(text),
      tags: candidate.tags,
      score: scores.get(candidate.title)?.score ?? 50,
      sources: discovered.sources,
      discoveredAt: input.now.toISOString(),
      attempts: 0,
    })
  }

  log.info('queue refreshed', {
    considered: discovered.candidates.length,
    added: fresh.length,
    total: state.queue.entries.length + fresh.length,
  })

  return {
    queue: { version: STATE_VERSION, entries: [...state.queue.entries, ...fresh] },
    added: fresh.length,
  }
}

function ensureUniqueSlug(candidate: string, taken: ReadonlySet<string>): string {
  const base = slugifyBounded(candidate)
  if (!taken.has(base)) return base
  for (let n = 2; n < 50; n++) {
    const next = `${base}-${n}`
    if (!taken.has(next)) return next
  }
  throw new Error(`Could not find a free slug derived from "${candidate}"`)
}

async function writeArtifact(file: string, bytes: Buffer): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
}

import { z } from 'zod'

/**
 * Persisted state lives on the `blog-agent-state` branch. Every schema here is
 * versioned and parsed on load: a corrupt or half-written file must fail loudly
 * rather than silently resetting, because a reset means republishing topics.
 */

export const STATE_VERSION = 1

/**
 * Identifies the embedding space a vector belongs to. Comparing vectors across
 * spaces is meaningless — same dimension but different geometry makes cosine
 * scores collapse, which silently disables dedup while every run stays green.
 * So this descriptor is part of the cache key and is re-checked on load.
 */
export const embeddingDescriptor = z.object({
  model: z.string().min(1),
  taskType: z.string().min(1),
  dim: z.number().int().positive(),
})
export type EmbeddingDescriptor = z.infer<typeof embeddingDescriptor>

export function descriptorKey(d: EmbeddingDescriptor): string {
  return `${d.model}|${d.taskType}|${d.dim}`
}

export function sameDescriptor(a: EmbeddingDescriptor, b: EmbeddingDescriptor): boolean {
  return descriptorKey(a) === descriptorKey(b)
}

/** A stored vector, quantised to int8 + base64 to keep the state branch small. */
export const storedEmbedding = z.object({
  descriptor: embeddingDescriptor,
  /** Pre-quantisation L2 norm scale factor, needed to reconstruct. */
  scale: z.number(),
  /** base64 of an Int8Array. */
  data: z.string(),
})
export type StoredEmbedding = z.infer<typeof storedEmbedding>

/**
 * Lifecycle of a topic the agent has committed to.
 *
 * `inflight` is written and pushed BEFORE the branch and PR are created. If a
 * run dies between the two, the next run sees `inflight` and reconciles instead
 * of regenerating — which is what prevents a duplicate post.
 */
export const publishState = z.enum(['inflight', 'open', 'merged', 'rejected'])
export type PublishState = z.infer<typeof publishState>

export const publishedEntry = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  /** Canonical text that was embedded, so both sides of a comparison match. */
  dedupText: z.string().min(1),
  /** sha256 of dedupText, the embedding cache key component. */
  textHash: z.string().length(64),
  tags: z.array(z.string()),
  state: publishState,
  /** Branch name, run-id-suffixed so a retry can never collide with a live PR. */
  branch: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  runId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Set when state is `merged`; the date the post actually went live. */
  publishedAt: z.string().datetime().optional(),
})
export type PublishedEntry = z.infer<typeof publishedEntry>

export const publishedFile = z.object({
  version: z.literal(STATE_VERSION),
  entries: z.array(publishedEntry),
})
export type PublishedFile = z.infer<typeof publishedFile>

/**
 * Cadence anchor. `lastPublishedDay` is a UTC date key, not an elapsed-time
 * measurement: cron jitter on a congested top-of-hour slot makes an
 * "elapsed >= 24h" test drift forward every run, eventually starving whole
 * days. The day key is jitter-immune; the timestamp adds a floor so a 23:50 +
 * 00:10 pair cannot slip through.
 */
export const cadenceFile = z.object({
  version: z.literal(STATE_VERSION),
  lastPublishedDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastPublishedAt: z.string().datetime().optional(),
  /** Consecutive runs that produced no PR; drives stall detection. */
  idleRuns: z.number().int().nonnegative().default(0),
  lastPrOpenedAt: z.string().datetime().optional(),
})
export type CadenceFile = z.infer<typeof cadenceFile>

/** Operator kill switch and budget ceiling, read at startup. */
export const controlFile = z.object({
  version: z.literal(STATE_VERSION),
  enabled: z.boolean().default(true),
  maxTokensPerDay: z.number().int().positive().optional(),
  /** Optional operator note surfaced in logs, e.g. why the agent is paused. */
  note: z.string().optional(),
})
export type ControlFile = z.infer<typeof controlFile>

export const queueEntry = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  angle: z.string().min(1),
  dedupText: z.string().min(1),
  textHash: z.string().length(64),
  tags: z.array(z.string()),
  score: z.number(),
  sources: z.array(z.string().url()),
  discoveredAt: z.string().datetime(),
  /** Times this candidate was passed over; ages entries out of the queue. */
  attempts: z.number().int().nonnegative().default(0),
})
export type QueueEntry = z.infer<typeof queueEntry>

export const queueFile = z.object({
  version: z.literal(STATE_VERSION),
  entries: z.array(queueEntry),
})
export type QueueFile = z.infer<typeof queueFile>

export const emptyPublished: PublishedFile = { version: STATE_VERSION, entries: [] }
export const emptyQueue: QueueFile = { version: STATE_VERSION, entries: [] }
export const emptyCadence: CadenceFile = { version: STATE_VERSION, idleRuns: 0 }
export const defaultControl: ControlFile = { version: STATE_VERSION, enabled: true }

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { z } from 'zod'

import { sha256 } from '../lib/hash.js'
import type { Logger } from '../lib/logger.js'
import { dequantize, quantize } from '../lib/vector.js'
import {
  cadenceFile,
  controlFile,
  defaultControl,
  descriptorKey,
  emptyCadence,
  emptyPublished,
  emptyQueue,
  publishedFile,
  queueFile,
  sameDescriptor,
  storedEmbedding,
  type CadenceFile,
  type ControlFile,
  type EmbeddingDescriptor,
  type PublishedFile,
  type QueueFile,
} from './schema.js'

/**
 * Reads and writes the four state files plus the embedding cache.
 *
 * Two invariants drive the design.
 *
 * **Corruption fails loudly.** A malformed file throws rather than falling back
 * to an empty default. Silently resetting `published.json` would make every
 * previously-published topic look new, and the agent would happily republish
 * months of work while every run stayed green. An absent file is fine — that is
 * genuinely first-run — but an unparseable one is not.
 *
 * **Writes are atomic.** Each file is written to a temp path and renamed, so a
 * process killed mid-write leaves the previous version intact rather than a
 * half-written file that then fails the load check above.
 */

export const STATE_FILES = {
  published: 'state/published.json',
  queue: 'state/queue.json',
  cadence: 'state/cadence.json',
  control: 'state/control.json',
  embeddings: 'state/embeddings',
  rejected: 'state/rejected',
  runs: 'state/runs',
} as const

export class StateCorruptError extends Error {
  override readonly name = 'StateCorruptError'
}

async function readJson<T>(
  file: string,
  schema: z.ZodType<T, any, any>,
  fallback: T,
  label: string
): Promise<T> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw cause
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new StateCorruptError(
      `${label} at ${file} is not valid JSON. Refusing to continue: treating it as empty ` +
        `would republish every topic it contains. Inspect or restore it from git history.`
    )
  }

  const checked = schema.safeParse(parsed)
  if (!checked.success) {
    const detail = checked.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new StateCorruptError(`${label} at ${file} failed validation — ${detail}`)
  }
  return checked.data
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}

export interface AgentState {
  published: PublishedFile
  queue: QueueFile
  cadence: CadenceFile
  control: ControlFile
}

export interface StateStore {
  readonly root: string
  load(): Promise<AgentState>
  savePublished(v: PublishedFile): Promise<void>
  saveQueue(v: QueueFile): Promise<void>
  saveCadence(v: CadenceFile): Promise<void>
  /** Cached vector for a dedup text, or null on miss or descriptor change. */
  getEmbedding(textHash: string, descriptor: EmbeddingDescriptor): Promise<number[] | null>
  putEmbedding(
    textHash: string,
    descriptor: EmbeddingDescriptor,
    vector: readonly number[]
  ): Promise<void>
  /** Preserve a draft whose PR was closed unmerged, so the work is recoverable. */
  archiveRejected(slug: string, source: string): Promise<void>
  appendRun(runId: string, record: unknown): Promise<void>
  /** Embedding cache entries discarded because the model or dims changed. */
  pruneStaleEmbeddings(descriptor: EmbeddingDescriptor): Promise<number>
}

export function createStateStore(root: string, logger: Logger): StateStore {
  const at = (rel: string) => path.join(root, rel)
  const log = logger.child({ component: 'state' })

  return {
    root,

    async load(): Promise<AgentState> {
      const [published, queue, cadence, control] = await Promise.all([
        readJson(at(STATE_FILES.published), publishedFile, emptyPublished, 'published.json'),
        readJson(at(STATE_FILES.queue), queueFile, emptyQueue, 'queue.json'),
        readJson(at(STATE_FILES.cadence), cadenceFile, emptyCadence, 'cadence.json'),
        readJson(at(STATE_FILES.control), controlFile, defaultControl, 'control.json'),
      ])
      log.debug('state loaded', {
        published: published.entries.length,
        queued: queue.entries.length,
        enabled: control.enabled,
      })
      return { published, queue, cadence, control }
    },

    savePublished: (v) => writeJson(at(STATE_FILES.published), v),
    saveQueue: (v) => writeJson(at(STATE_FILES.queue), v),
    saveCadence: (v) => writeJson(at(STATE_FILES.cadence), v),

    async getEmbedding(textHash, descriptor) {
      const file = at(path.join(STATE_FILES.embeddings, `${textHash}.json`))
      let raw: string
      try {
        raw = await readFile(file, 'utf8')
      } catch {
        return null
      }
      const parsed = storedEmbedding.safeParse(JSON.parse(raw))
      if (!parsed.success) return null

      // A vector from a different embedding space is worse than a cache miss:
      // comparing across spaces yields plausible-looking nonsense rather than
      // an error. Treat it as absent and re-embed.
      if (!sameDescriptor(parsed.data.descriptor, descriptor)) {
        log.debug('embedding descriptor changed; ignoring cached vector', {
          cached: descriptorKey(parsed.data.descriptor),
          wanted: descriptorKey(descriptor),
        })
        return null
      }
      return dequantize({ scale: parsed.data.scale, data: parsed.data.data })
    },

    async putEmbedding(textHash, descriptor, vector) {
      const { scale, data } = quantize(vector)
      await writeJson(at(path.join(STATE_FILES.embeddings, `${textHash}.json`)), {
        descriptor,
        scale,
        data,
      })
    },

    async archiveRejected(slug, source) {
      const file = at(path.join(STATE_FILES.rejected, `${slug}.mdx`))
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, source, 'utf8')
      log.info('archived rejected draft', { slug })
    },

    async appendRun(runId, record) {
      await writeJson(at(path.join(STATE_FILES.runs, `${runId}.json`)), record)
    },

    async pruneStaleEmbeddings(descriptor) {
      const dir = at(STATE_FILES.embeddings)
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return 0
      }
      let removed = 0
      for (const name of names) {
        if (!name.endsWith('.json')) continue
        const file = path.join(dir, name)
        try {
          const parsed = storedEmbedding.safeParse(JSON.parse(await readFile(file, 'utf8')))
          if (!parsed.success || !sameDescriptor(parsed.data.descriptor, descriptor)) {
            await rm(file, { force: true })
            removed++
          }
        } catch {
          await rm(file, { force: true })
          removed++
        }
      }
      if (removed > 0) log.info('pruned stale embeddings', { removed })
      return removed
    },
  }
}

/** Canonical dedup text. Both sides of a comparison must use this. */
export function dedupText(input: {
  title: string
  summary: string
  tags: readonly string[]
}): string {
  return [input.title.trim(), input.summary.trim(), [...input.tags].sort().join(', ')]
    .filter((s) => s.length > 0)
    .join('\n')
}

export function dedupHash(text: string): string {
  return sha256(text)
}

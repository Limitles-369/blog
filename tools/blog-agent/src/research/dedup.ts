import type { Config } from '../config/env.js'
import type { CorpusPost } from '../corpus/reader.js'
import type { GeminiClient } from '../gemini/types.js'
import type { Logger } from '../lib/logger.js'
import { jaccard, normalizeForCompare, tokenSet } from '../lib/slugify.js'
import { cosine } from '../lib/vector.js'
import { dedupHash, dedupText, type StateStore } from '../state/store.js'
import type { EmbeddingDescriptor, PublishedFile, QueueFile } from '../state/schema.js'

/**
 * Three-tier duplicate detection, cheapest first.
 *
 * Runs against the live corpus on disk, everything ever published or PR'd, and
 * everything already queued. The tiers exist so the common case costs nothing:
 * an obvious repeat is caught by string comparison, and only genuinely
 * ambiguous pairs reach an embedding call.
 */

export interface DedupCandidate {
  title: string
  summary: string
  tags: readonly string[]
}

export interface DedupVerdict {
  duplicate: boolean
  reason: string
  /** Highest similarity observed, for logging and threshold calibration. */
  score: number
  matched?: string
}

interface Known {
  label: string
  title: string
  text: string
  hash: string
}

function knownFromCorpus(posts: readonly CorpusPost[]): Known[] {
  return posts.map((p) => {
    const text = dedupText({ title: p.title, summary: p.summary, tags: p.tags })
    return { label: `post:${p.slug}`, title: p.title, text, hash: dedupHash(text) }
  })
}

function knownFromState(published: PublishedFile, queue: QueueFile): Known[] {
  return [
    ...published.entries.map((e) => ({
      label: `published:${e.slug}`,
      title: e.title,
      text: e.dedupText,
      hash: e.textHash,
    })),
    ...queue.entries.map((e) => ({
      label: `queued:${e.id}`,
      title: e.title,
      text: e.dedupText,
      hash: e.textHash,
    })),
  ]
}

export interface DedupInput {
  candidate: DedupCandidate
  corpus: readonly CorpusPost[]
  published: PublishedFile
  queue: QueueFile
  config: Config
  client: GeminiClient
  store: StateStore
  logger: Logger
}

export async function checkDuplicate(input: DedupInput): Promise<DedupVerdict> {
  const { candidate, config, logger } = input
  const log = logger.child({ component: 'dedup' })

  const known = [...knownFromCorpus(input.corpus), ...knownFromState(input.published, input.queue)]
  if (known.length === 0) return { duplicate: false, reason: 'no prior topics', score: 0 }

  // Tier 1 — normalised title equality. No API call.
  const candidateNorm = normalizeForCompare(candidate.title)
  for (const k of known) {
    if (normalizeForCompare(k.title) === candidateNorm) {
      return {
        duplicate: true,
        reason: `title matches ${k.label} after normalisation`,
        score: 1,
        matched: k.label,
      }
    }
  }

  // Tier 2 — token overlap on title + tags. No API call.
  const candidateTokens = tokenSet([candidate.title, ...candidate.tags].join(' '))
  let bestJaccard = 0
  let bestJaccardLabel = ''
  for (const k of known) {
    const score = jaccard(candidateTokens, tokenSet(k.title))
    if (score > bestJaccard) {
      bestJaccard = score
      bestJaccardLabel = k.label
    }
  }
  if (bestJaccard >= config.DEDUP_JACCARD) {
    return {
      duplicate: true,
      reason: `token overlap ${bestJaccard.toFixed(2)} with ${bestJaccardLabel}`,
      score: bestJaccard,
      matched: bestJaccardLabel,
    }
  }

  // Tier 3 — semantic similarity. Only the candidate is embedded per run;
  // known vectors come from the cache, keyed by model + taskType + dims so a
  // model change can never compare across embedding spaces.
  const descriptor: EmbeddingDescriptor = {
    model: config.GEMINI_EMBEDDING_MODEL,
    taskType: config.GEMINI_EMBEDDING_TASK_TYPE,
    dim: config.GEMINI_EMBEDDING_DIM,
  }

  const candidateText = dedupText(candidate)
  const candidateVec = await embedCached(candidateText, descriptor, input)

  let best = 0
  let bestLabel = ''
  for (const k of known) {
    const vec = await embedCached(k.text, descriptor, input, k.hash)
    if (!vec) continue
    const score = cosine(candidateVec, vec)
    if (score > best) {
      best = score
      bestLabel = k.label
    }
  }

  log.debug('semantic dedup', { best: best.toFixed(3), bestLabel })

  if (best >= config.DEDUP_REJECT_COSINE) {
    return {
      duplicate: true,
      reason: `semantic similarity ${best.toFixed(3)} with ${bestLabel}`,
      score: best,
      matched: bestLabel,
    }
  }

  if (best >= config.DEDUP_ESCALATE_COSINE) {
    const match = known.find((k) => k.label === bestLabel)
    if (match && (await safeJudge(candidate, match, input.client, log))) {
      return {
        duplicate: true,
        reason: `judged as covering the same ground as ${bestLabel} (cosine ${best.toFixed(3)})`,
        score: best,
        matched: bestLabel,
      }
    }
  }

  return { duplicate: false, reason: `max similarity ${best.toFixed(3)}`, score: best }
}

async function embedCached(
  text: string,
  descriptor: EmbeddingDescriptor,
  input: DedupInput,
  knownHash?: string
): Promise<number[]> {
  const hash = knownHash ?? dedupHash(text)
  const cached = await input.store.getEmbedding(hash, descriptor)
  if (cached) return cached

  const res = await input.client.embed({
    texts: [text],
    taskType: descriptor.taskType,
    outputDimensionality: descriptor.dim,
    label: 'dedup.embed',
  })
  const vector = res.vectors[0] ?? []
  await input.store.putEmbedding(hash, descriptor, vector)
  return vector
}

/**
 * Tie-breaker for the ambiguous band. Absolute Gemini cosines run high — two
 * unrelated developer topics commonly sit at 0.6-0.75 — so a mid-range score
 * is not decisive on its own and a cheap yes/no judgement beats guessing.
 */
export async function judge(
  candidate: DedupCandidate,
  match: { title: string; text: string },
  client: GeminiClient
): Promise<boolean> {
  const res = await client.generateText({
    prompt: [
      'Would these two articles cover substantially the same ground for a reader?',
      'Answer with exactly one word: YES or NO.',
      '',
      `A: ${candidate.title}`,
      candidate.summary,
      '',
      `B: ${match.title}`,
      match.text,
    ].join('\n'),
    label: 'dedup.judge',
    temperature: 0,
    // Gemini 3.x may spend most of a small budget on internal reasoning even
    // for this one-word decision. Leave enough room for visible YES/NO output.
    maxOutputTokens: 512,
  })
  return /\byes\b/i.test(res.text)
}

async function safeJudge(
  candidate: DedupCandidate,
  match: { title: string; text: string },
  client: GeminiClient,
  logger: Logger
): Promise<boolean> {
  try {
    return await judge(candidate, match, client)
  } catch (cause) {
    // The judge is only a tie-breaker between the embedding thresholds. If a
    // provider is overloaded or returns no visible text, keep the candidate
    // and let the next run retry rather than losing the whole source sweep.
    logger.warn('dedup judge unavailable; keeping candidate', {
      error: cause instanceof Error ? cause.message : String(cause),
    })
    return false
  }
}

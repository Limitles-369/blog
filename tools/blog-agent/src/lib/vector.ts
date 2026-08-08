/**
 * Vector helpers for semantic dedup.
 *
 * The dimension assertion is load-bearing. Gemini embeddings are only
 * L2-normalised at full dimensionality; a truncated `outputDimensionality`
 * returns an unnormalised vector. And comparing vectors of different lengths
 * with a naive loop returns a plausible-looking number rather than throwing,
 * which would silently disable duplicate detection — the one failure mode
 * that degrades quietly and republishes topics for weeks.
 */

export class VectorMismatchError extends Error {
  override readonly name = 'VectorMismatchError'
}

export function l2Normalize(v: readonly number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const norm = Math.sqrt(sum)
  if (norm === 0) throw new VectorMismatchError('Cannot normalise a zero vector')
  return v.map((x) => x / norm)
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new VectorMismatchError(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}. ` +
        `This usually means the embedding model or outputDimensionality changed ` +
        `without the cache being invalidated.`
    )
  }
  if (a.length === 0) throw new VectorMismatchError('Cannot compare empty vectors')

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number
    const y = b[i] as number
    dot += x * y
    normA += x * x
    normB += y * y
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) throw new VectorMismatchError('Cannot compare a zero vector')
  // Clamp: floating-point error can push an identical pair to 1.0000000000000002
  return Math.min(1, Math.max(-1, dot / denom))
}

/**
 * Quantise to int8 for storage. A 1536-dim float64 JSON array is ~30KB and
 * gets rewritten into a fresh git blob on every state commit; int8 + base64
 * is roughly 12x smaller. Recall loss at int8 is negligible next to the
 * thresholds in use here.
 */
export function quantize(v: readonly number[]): { scale: number; data: string } {
  let max = 0
  for (const x of v) max = Math.max(max, Math.abs(x))
  const scale = max === 0 ? 1 : max / 127
  const bytes = Buffer.alloc(v.length)
  for (let i = 0; i < v.length; i++) {
    bytes[i] = Math.max(-127, Math.min(127, Math.round((v[i] as number) / scale))) & 0xff
  }
  return { scale, data: bytes.toString('base64') }
}

export function dequantize(q: { scale: number; data: string }): number[] {
  const bytes = Buffer.from(q.data, 'base64')
  const out = new Array<number>(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    const signed = (bytes[i] as number) > 127 ? (bytes[i] as number) - 256 : (bytes[i] as number)
    out[i] = signed * q.scale
  }
  return out
}

/** Highest-scoring match, or null when the corpus is empty. */
export function nearest<T>(
  query: readonly number[],
  corpus: readonly { item: T; vector: readonly number[] }[]
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null
  for (const entry of corpus) {
    const score = cosine(query, entry.vector)
    if (best === null || score > best.score) best = { item: entry.item, score }
  }
  return best
}

import { describe, expect, it } from 'vitest'

import { cosine, dequantize, l2Normalize, nearest, quantize, VectorMismatchError } from '../src/lib/vector.js'
import { imageKey, jaccard, normalizeForCompare, slugify, slugifyBounded, tokenSet } from '../src/lib/slugify.js'

describe('slugify', () => {
  it('produces filename-safe kebab-case', () => {
    expect(slugify('Post-Quantum Cryptography: The Next Big Shift')).toBe(
      'post-quantum-cryptography-the-next-big-shift'
    )
  })

  it('strips accents rather than dropping the character', () => {
    expect(slugify('Café naïve résumé')).toBe('cafe-naive-resume')
  })

  it('drops apostrophes instead of turning them into separators', () => {
    expect(slugify("What's New in Node's Runtime")).toBe('whats-new-in-nodes-runtime')
  })

  it('collapses punctuation runs and trims edges', () => {
    expect(slugify('  ***Hello --- World!!!  ')).toBe('hello-world')
  })

  it('is idempotent', () => {
    const once = slugify('AI Agents in 2026: The Future')
    expect(slugify(once)).toBe(once)
  })
})

describe('slugifyBounded', () => {
  it('never cuts mid-token', () => {
    const out = slugifyBounded('understanding distributed consensus algorithms in practice', 30)
    expect(out.length).toBeLessThanOrEqual(30)
    expect(out.endsWith('-')).toBe(false)
    // Every retained token must be whole.
    for (const token of out.split('-')) {
      expect('understanding distributed consensus algorithms in practice').toContain(token)
    }
  })

  it('leaves short slugs untouched', () => {
    expect(slugifyBounded('short title', 70)).toBe('short-title')
  })
})

describe('imageKey', () => {
  // Matches the existing convention: public/static/images/blog/post-quantum-cryptography/
  // serves the post slugged post-quantum-cryptography-developers-q-day.
  it('shortens a slug to its leading tokens', () => {
    expect(imageKey('post-quantum-cryptography-developers-q-day')).toBe('post-quantum-cryptography')
  })
})

describe('jaccard', () => {
  it('is 1 for identical token sets', () => {
    expect(jaccard(tokenSet('react server components'), tokenSet('React Server Components'))).toBe(1)
  })

  it('ignores word order and stopwords', () => {
    expect(normalizeForCompare('The Future of AI Agents')).toBe(
      normalizeForCompare('AI Agents and the Future')
    )
  })

  it('is 0 for disjoint sets', () => {
    expect(jaccard(tokenSet('kubernetes networking'), tokenSet('css typography'))).toBe(0)
  })
})

describe('cosine', () => {
  it('is 1 for parallel vectors regardless of magnitude', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12)
  })

  it('is 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 12)
  })

  it('never exceeds 1 despite floating-point drift', () => {
    const v = [0.1, 0.2, 0.3, 0.4]
    expect(cosine(v, v)).toBeLessThanOrEqual(1)
  })

  // This is the failure the assertion exists to prevent: comparing vectors from
  // two different embedding spaces would otherwise return a plausible number
  // and silently disable duplicate detection.
  it('throws on dimension mismatch rather than returning a number', () => {
    expect(() => cosine([1, 2, 3], [1, 2])).toThrow(VectorMismatchError)
  })

  it('throws on a zero vector rather than dividing by zero', () => {
    expect(() => cosine([0, 0], [1, 1])).toThrow(VectorMismatchError)
  })
})

describe('l2Normalize', () => {
  it('produces a unit vector', () => {
    const n = l2Normalize([3, 4])
    expect(Math.hypot(...n)).toBeCloseTo(1, 12)
  })
})

describe('quantize', () => {
  it('round-trips within int8 tolerance', () => {
    const original = Array.from({ length: 64 }, (_, i) => Math.sin(i) * 0.5)
    const restored = dequantize(quantize(original))
    expect(restored).toHaveLength(original.length)
    for (const [i, value] of original.entries()) {
      expect(restored[i]).toBeCloseTo(value, 2)
    }
  })

  it('preserves cosine similarity closely enough for the thresholds in use', () => {
    const a = Array.from({ length: 128 }, (_, i) => Math.sin(i))
    const b = Array.from({ length: 128 }, (_, i) => Math.sin(i + 0.15))
    const exact = cosine(a, b)
    const approx = cosine(dequantize(quantize(a)), dequantize(quantize(b)))
    expect(Math.abs(exact - approx)).toBeLessThan(0.01)
  })

  it('handles an all-zero vector without producing NaN', () => {
    const restored = dequantize(quantize([0, 0, 0]))
    expect(restored.every((x) => Number.isFinite(x))).toBe(true)
  })
})

describe('nearest', () => {
  it('returns null for an empty corpus', () => {
    expect(nearest([1, 0], [])).toBeNull()
  })

  it('picks the highest-scoring entry', () => {
    const result = nearest(
      [1, 0],
      [
        { item: 'orthogonal', vector: [0, 1] },
        { item: 'parallel', vector: [1, 0] },
        { item: 'diagonal', vector: [1, 1] },
      ]
    )
    expect(result?.item).toBe('parallel')
    expect(result?.score).toBeCloseTo(1, 12)
  })
})

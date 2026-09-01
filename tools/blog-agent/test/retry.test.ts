import { describe, expect, it, vi } from 'vitest'

import {
  isExhaustedQuota,
  isRetryable,
  RetryExhaustedError,
  TimeoutError,
  withRetry,
} from '../src/lib/retry.js'

/**
 * Fixtures copied from a real `npm run doctor` failure. The Gemini SDK
 * stringifies the API error body into `message`, which is why the parsing in
 * retry.ts exists at all.
 */
const quotaExhausted = () =>
  Object.assign(
    new Error(
      JSON.stringify({
        error: {
          code: 429,
          message:
            'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.',
          status: 'RESOURCE_EXHAUSTED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.Help',
              links: [{ description: 'Learn more about Gemini API quotas', url: 'https://x' }],
            },
          ],
        },
      })
    ),
    { name: 'ApiError' }
  )

/** A per-minute limit, which Google annotates with RetryInfo. */
const rateLimited = (delay = '51s') =>
  Object.assign(
    new Error(
      JSON.stringify({
        error: {
          code: 429,
          message: 'Resource has been exhausted (e.g. check quota).',
          status: 'RESOURCE_EXHAUSTED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: delay }],
        },
      })
    ),
    { name: 'ApiError' }
  )

const overloaded = () =>
  Object.assign(
    new Error(
      JSON.stringify({
        error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' },
      })
    ),
    { name: 'ApiError' }
  )

describe('isExhaustedQuota', () => {
  it('recognises a daily quota exhaustion with no retry guidance', () => {
    expect(isExhaustedQuota(quotaExhausted())).toBe(true)
  })

  it('does NOT treat a RetryInfo-annotated 429 as exhausted', () => {
    expect(isExhaustedQuota(rateLimited())).toBe(false)
  })

  it('ignores non-429 errors', () => {
    expect(isExhaustedQuota(overloaded())).toBe(false)
  })
})

describe('isRetryable', () => {
  it('does not retry an exhausted quota', () => {
    // Retrying this burns five attempts to reach the same failure.
    expect(isRetryable(quotaExhausted())).toBe(false)
  })

  it('retries a rate limit that carries RetryInfo', () => {
    expect(isRetryable(rateLimited())).toBe(true)
  })

  it('retries model overload', () => {
    expect(isRetryable(overloaded())).toBe(true)
  })

  it('retries timeouts', () => {
    expect(isRetryable(new TimeoutError('slow'))).toBe(true)
  })

  it('retries transient socket errors', () => {
    expect(isRetryable(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).toBe(
      true
    )
  })

  it('does not retry a client error', () => {
    expect(isRetryable(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false)
  })
})

describe('withRetry', () => {
  const base = { attempts: 5, baseMs: 1000, capMs: 60_000, label: 'test' }

  it('returns on first success without sleeping', async () => {
    const sleep = vi.fn(async () => {})
    const result = await withRetry(async () => 'ok', { ...base, sleep })
    expect(result).toBe('ok')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('fails fast on an exhausted quota, without consuming attempts', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => {
      throw quotaExhausted()
    })
    await expect(withRetry(fn, { ...base, sleep })).rejects.toThrow(/quota/i)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('honours RetryInfo delay over computed backoff', async () => {
    const sleep = vi.fn(async () => {})
    let calls = 0
    const fn = vi.fn(async () => {
      if (++calls === 1) throw rateLimited('7s')
      return 'recovered'
    })
    await expect(withRetry(fn, { ...base, sleep })).resolves.toBe('recovered')
    expect(sleep).toHaveBeenCalledWith(7000)
  })

  it('grows the backoff exponentially with full jitter', async () => {
    const delays: number[] = []
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms)
    })
    const fn = vi.fn(async () => {
      throw overloaded()
    })
    // random() fixed at 1 so the jitter window's upper bound is observable.
    await expect(withRetry(fn, { ...base, sleep, random: () => 0.999999 })).rejects.toBeInstanceOf(
      RetryExhaustedError
    )
    expect(fn).toHaveBeenCalledTimes(5)
    expect(delays).toHaveLength(4)
    // 1000, 2000, 4000, 8000 — each step doubles.
    expect(delays[0]).toBeLessThan(1000)
    expect(delays[1]).toBeGreaterThan(delays[0] as number)
    expect(delays[3]).toBeGreaterThan(delays[2] as number)
    expect(delays[3]).toBeLessThan(8000)
  })

  it('respects the cap', async () => {
    const delays: number[] = []
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms)
    })
    await expect(
      withRetry(
        async () => {
          throw overloaded()
        },
        { ...base, attempts: 8, capMs: 3000, sleep, random: () => 0.999999 }
      )
    ).rejects.toBeInstanceOf(RetryExhaustedError)
    for (const d of delays) expect(d).toBeLessThanOrEqual(3000)
  })

  it('surfaces the underlying error as the cause when exhausted', async () => {
    await expect(
      withRetry(
        async () => {
          throw overloaded()
        },
        { ...base, attempts: 2, sleep: async () => {} }
      )
    ).rejects.toMatchObject({ name: 'RetryExhaustedError', attempts: 2 })
  })
})

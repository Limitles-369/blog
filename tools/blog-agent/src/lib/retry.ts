import type { Logger } from './logger.js'

/**
 * Exponential backoff with full jitter.
 *
 * Only transient classes are retried. Retrying a 400 or a 403 wastes quota
 * and delays a failure that will never clear on its own, so those throw
 * immediately. `Retry-After` wins over the computed backoff when present —
 * the server knows better than the client.
 */

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

export class TimeoutError extends Error {
  override readonly name = 'TimeoutError'
}

/** Thrown when every attempt failed; carries the last underlying error. */
export class RetryExhaustedError extends Error {
  override readonly name = 'RetryExhaustedError'
  constructor(
    message: string,
    readonly attempts: number,
    override readonly cause: unknown
  ) {
    super(message)
  }
}

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  for (const key of ['status', 'statusCode', 'code']) {
    const v = e[key]
    if (typeof v === 'number' && v >= 100 && v < 600) return v
  }
  const nested = e['response']
  if (nested && typeof nested === 'object') {
    const s = (nested as Record<string, unknown>)['status']
    if (typeof s === 'number') return s
  }
  // Some SDKs only put the status in the message: "got status: 503 ..."
  const msg = typeof e['message'] === 'string' ? (e['message'] as string) : ''
  const m = /\b(4\d{2}|5\d{2})\b/.exec(msg)
  return m?.[1] ? Number(m[1]) : undefined
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof TimeoutError) return true
  // Checked before the status allowlist: an exhausted quota is a 429 that will
  // not clear within any backoff window we would reasonably wait.
  if (isExhaustedQuota(err)) return false
  const status = statusOf(err)
  if (status !== undefined && RETRYABLE_STATUS.has(status)) return true
  if (status !== undefined) return false
  const code = (err as { code?: unknown })?.code
  if (typeof code === 'string' && RETRYABLE_CODES.has(code)) return true
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /\b(ECONN|ETIMEDOUT|socket hang up|network|fetch failed|overloaded|unavailable)\b/i.test(
    msg
  )
}

/** Honour Retry-After, in either seconds or HTTP-date form. */
function retryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown })?.headers
  if (!headers) return googleRetryDelayMs(err)
  const raw =
    typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get('retry-after')
      : ((headers as Record<string, string>)['retry-after'] ??
        (headers as Record<string, string>)['Retry-After'])
  if (!raw) return googleRetryDelayMs(err)
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(raw)
  return Number.isNaN(date) ? googleRetryDelayMs(err) : Math.max(0, date - Date.now())
}

/**
 * The Gemini SDK stringifies the API error body into `message` rather than
 * exposing structured fields, so the retry hints have to be parsed back out.
 */
function googleErrorBody(err: unknown): Record<string, unknown> | undefined {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const start = msg.indexOf('{')
  if (start === -1) return undefined
  try {
    const parsed = JSON.parse(msg.slice(start)) as { error?: Record<string, unknown> }
    return parsed.error ?? undefined
  } catch {
    return undefined
  }
}

/** google.rpc.RetryInfo carries a duration like "51s" when a retry is sane. */
function googleRetryDelayMs(err: unknown): number | undefined {
  const details = googleErrorBody(err)?.['details']
  if (!Array.isArray(details)) return undefined
  for (const d of details) {
    const entry = d as Record<string, unknown>
    if (typeof entry['@type'] === 'string' && entry['@type'].endsWith('RetryInfo')) {
      const delay = entry['retryDelay']
      if (typeof delay === 'string') {
        const seconds = Number.parseFloat(delay)
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
      }
    }
  }
  return undefined
}

/**
 * Distinguishes the two very different 429s.
 *
 * A per-minute rate limit clears on its own and ships a RetryInfo telling you
 * when. An exhausted daily quota does not clear for hours and ships only a
 * documentation link. Retrying the latter burns five attempts and ~10s to
 * arrive at the same failure, and in a scheduled run it delays the real signal.
 * Absence of retry guidance on a quota error is the tell.
 */
export function isExhaustedQuota(err: unknown): boolean {
  if (statusOf(err) !== 429) return false
  if (googleRetryDelayMs(err) !== undefined) return false
  const body = googleErrorBody(err)
  const status = typeof body?.['status'] === 'string' ? (body['status'] as string) : ''
  const message = typeof body?.['message'] === 'string' ? (body['message'] as string) : ''
  if (status === 'RESOURCE_EXHAUSTED') return true
  return /\b(quota|billing|plan)\b/i.test(message)
}

export interface RetryOptions {
  attempts: number
  baseMs: number
  capMs: number
  label: string
  logger?: Logger
  signal?: AbortSignal
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep
  const random = opts.random ?? Math.random
  let last: unknown

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    opts.signal?.throwIfAborted()
    try {
      return await fn()
    } catch (err) {
      last = err
      const retryable = isRetryable(err)
      const final = attempt === opts.attempts

      if (!retryable || final) {
        opts.logger?.error(`${opts.label} failed`, {
          attempt,
          retryable,
          err,
        })
        if (!retryable) throw err
        throw new RetryExhaustedError(
          `${opts.label} failed after ${attempt} attempts`,
          attempt,
          err
        )
      }

      // Full jitter: random over [0, exponential), which decorrelates
      // concurrent retries better than equal-jitter or a fixed multiplier.
      const exponential = Math.min(opts.capMs, opts.baseMs * 2 ** (attempt - 1))
      const delay = retryAfterMs(err) ?? Math.floor(random() * exponential)
      opts.logger?.warn(`${opts.label} retrying`, { attempt, delayMs: delay, err })
      await sleep(delay)
    }
  }
  throw new RetryExhaustedError(`${opts.label} exhausted`, opts.attempts, last)
}

/** Reject with TimeoutError if a promise outlives `ms`. */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new TimeoutError(`${label} timed out`)), ms)
  try {
    return await fn(controller.signal)
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError(`${label} timed out after ${ms}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

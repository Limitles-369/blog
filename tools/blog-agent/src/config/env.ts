import { z } from 'zod'

/**
 * The only module that reads process.env. Everything downstream receives a
 * validated Config, so a missing variable fails at startup with a readable
 * message instead of surfacing as a 401 eight stages later.
 *
 * Model IDs are intentionally required rather than defaulted. Gemini model
 * names change faster than this repo will be maintained, and a stale default
 * baked into source is worse than an explicit failure: the run would silently
 * use a model nobody chose. `doctor` verifies each ID against models.list().
 */

const nonEmpty = z.string().trim().min(1)

const csv = (fallback: string[]) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v.trim() === ''
        ? fallback
        : v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    )

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v.trim())))

const num = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? fallback : Number(v)))
    .pipe(z.number().finite().min(min).max(max))

export const envSchema = z.object({
  GEMINI_API_KEY: nonEmpty.describe('Gemini API key'),

  GEMINI_TEXT_MODEL: nonEmpty.describe('Text model ID, e.g. gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: nonEmpty.describe('Embedding model ID'),

  /** Embedding descriptor. Part of the cache key — see queue/dedup. */
  GEMINI_EMBEDDING_TASK_TYPE: z.string().trim().default('SEMANTIC_SIMILARITY'),
  GEMINI_EMBEDDING_DIM: num(1536, 128, 3072),

  SITE_URL: z.string().url().default('https://akashsamui.in'),
  POST_AUTHOR: z.string().trim().default('default'),
  POST_LAYOUT: z.enum(['PostSimple', 'PostLayout', 'PostBanner']).default('PostLayout'),

  /** Dedup thresholds. Defaults are provisional until `calibrate` runs. */
  DEDUP_REJECT_COSINE: num(0.86, 0, 1),
  DEDUP_ESCALATE_COSINE: num(0.78, 0, 1),
  DEDUP_JACCARD: num(0.6, 0, 1),

  TARGET_WORDS_MIN: num(1400, 300, 10_000),
  TARGET_WORDS_MAX: num(2200, 300, 10_000),

  /** Publishing cadence. Enforced in the agent so it stays unit-testable. */
  MIN_HOURS_BETWEEN_POSTS: num(20, 0, 168),
  MAX_OPEN_BOT_PRS: num(1, 1, 10),

  RETRY_ATTEMPTS: num(5, 1, 10),
  RETRY_BASE_MS: num(1000, 100, 30_000),
  RETRY_CAP_MS: num(60_000, 1000, 300_000),
  TEXT_TIMEOUT_MS: num(120_000, 5000, 600_000),
  RUN_CEILING_MS: num(1_200_000, 60_000, 3_600_000),

  MAX_EXTERNAL_LINKS: num(8, 0, 50),
  EXTERNAL_LINK_DENYLIST: csv([]),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),

  GITHUB_TOKEN: z.string().trim().optional(),
  GITHUB_REPOSITORY: z.string().trim().optional(),
  STATE_BRANCH: z.string().trim().default('blog-agent-state'),
  BRANCH_PREFIX: z.string().trim().default('bot/post-'),

  DRY_RUN: bool(false),
  OFFLINE: bool(false),
})

export type Config = z.infer<typeof envSchema>

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new ConfigError(`Invalid environment:\n${detail}\n\nSee .env.example.`)
  }

  const c = parsed.data
  if (c.TARGET_WORDS_MIN > c.TARGET_WORDS_MAX) {
    throw new ConfigError('TARGET_WORDS_MIN must not exceed TARGET_WORDS_MAX')
  }
  if (c.DEDUP_ESCALATE_COSINE > c.DEDUP_REJECT_COSINE) {
    throw new ConfigError('DEDUP_ESCALATE_COSINE must not exceed DEDUP_REJECT_COSINE')
  }
  if (c.RETRY_BASE_MS > c.RETRY_CAP_MS) {
    throw new ConfigError('RETRY_BASE_MS must not exceed RETRY_CAP_MS')
  }
  return c
}

/** Descriptor that must be part of every embedding cache key. */
export function embeddingDescriptor(c: Config): string {
  return `${c.GEMINI_EMBEDDING_MODEL}|${c.GEMINI_EMBEDDING_TASK_TYPE}|${c.GEMINI_EMBEDDING_DIM}`
}

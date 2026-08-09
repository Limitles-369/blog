#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { loadConfig, type Config } from './config/env.js'
import { paths } from './config/paths.js'
import { readCorpus } from './corpus/reader.js'
import { computeStyleMetrics, renderStyleBrief } from './corpus/style.js'
import { createGeminiClient } from './gemini/client.js'
import type { GeminiClient } from './gemini/types.js'
import { createLogger, type Logger } from './lib/logger.js'
import { isExhaustedQuota } from './lib/retry.js'
import { runPipeline, type RunMode } from './pipeline/orchestrator.js'
import { checkoutState } from './publish/git.js'
import { createStateStore } from './state/store.js'

/**
 * CLI entrypoint.
 *
 * Subcommands are deliberately small and independently runnable so the
 * pipeline can be exercised in pieces long before it is autonomous:
 *
 *   doctor  — verify the environment and, critically, resolve the SDK
 *             unknowns this design could not confirm offline
 *   style   — print the machine-derived style brief; no API calls
 *   corpus  — list what the agent sees on disk; no API calls
 */

const SUBCOMMANDS = ['run', 'doctor', 'style', 'corpus'] as const
type Subcommand = (typeof SUBCOMMANDS)[number]

/** Minimal .env loader — avoids a dependency for one well-understood format. */
async function loadDotEnv(file: string): Promise<void> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return // absent is fine; Actions supplies real env vars
  }
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m?.[1]) continue
    if (process.env[m[1]] !== undefined) continue // real env wins
    let value = (m[2] ?? '').trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[m[1]] = value
  }
}

function usage(): string {
  return [
    'Usage: npm run start -- <command> [options]',
    '',
    'Commands:',
    '  run       Research, and publish at most one post per day',
    '  doctor    Validate env, verify model IDs, probe SDK capabilities',
    '  style     Print the style brief derived from data/blog/*.mdx',
    '  corpus    Summarise the posts currently on disk',
    '',
    'Options:',
    '  --dry-run           Generate and validate, but never commit or open a PR',
    '  --research-only     Refresh the topic queue and stop',
    '  --force-publish     Bypass the once-per-day cadence gate',
    '  --json              Machine-readable output where supported',
  ].join('\n')
}

/** `corpus` and `style` need no API key, so config loading must stay optional. */
function tryLoadConfig(logger: Logger): Config | null {
  try {
    return loadConfig()
  } catch (cause) {
    logger.error(cause instanceof Error ? cause.message : String(cause))
    return null
  }
}

/**
 * One-line error summary for the doctor table.
 *
 * The Gemini SDK stringifies the whole API error body into `message`, which is
 * several hundred characters of JSON and unreadable in a status column. Pull out
 * the human-readable message when it is there.
 */
function describe(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause)
  const start = raw.indexOf('{')
  if (start !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { error?: { message?: string; code?: number } }
      const inner = parsed.error?.message
      if (inner) {
        const code = parsed.error?.code
        return `${code ? `${code}: ` : ''}${inner.split('. ')[0] ?? inner}`.slice(0, 160)
      }
    } catch {
      // fall through to the raw message
    }
  }
  return raw.split('\n')[0]?.slice(0, 160) ?? raw
}

async function cmdCorpus(json: boolean): Promise<number> {
  const posts = await readCorpus()
  if (json) {
    process.stdout.write(
      JSON.stringify(
        posts.map((p) => ({
          slug: p.slug,
          title: p.title,
          date: p.date,
          draft: p.draft,
          tags: p.tags,
        })),
        null,
        2
      ) + '\n'
    )
    return 0
  }
  process.stdout.write(`${posts.length} post(s) in ${path.relative(paths.root, paths.blog)}\n\n`)
  for (const p of posts) {
    process.stdout.write(
      `  ${p.draft ? '[draft]' : '       '} ${p.date}  ${p.slug}\n            ${p.title}\n`
    )
  }
  return 0
}

async function cmdStyle(): Promise<number> {
  const posts = await readCorpus()
  const metrics = computeStyleMetrics(posts)
  if (metrics.posts === 0) {
    process.stderr.write('No published posts found; the style brief would be empty.\n')
    return 1
  }
  process.stdout.write(renderStyleBrief(metrics) + '\n')
  return 0
}

/**
 * Resolves everything this design could not confirm without network access.
 *
 * The capability probe matters most: grounded Google Search and structured JSON
 * output have historically been mutually exclusive in a single Gemini call. The
 * pipeline is built to work either way — discovery runs grounded free-text,
 * then a separate ungrounded call structures it — but knowing the real answer
 * decides whether those two calls can be collapsed into one.
 */
async function cmdDoctor(config: Config, client: GeminiClient, logger: Logger): Promise<number> {
  let failures = 0
  const note = (ok: boolean, label: string, detail = '') => {
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`)
    if (!ok) failures++
  }

  process.stdout.write('\nEnvironment\n')
  note(true, 'config parsed')
  note(true, 'repo root', paths.root)

  process.stdout.write('\nModels\n')
  let available: string[] = []
  try {
    available = await client.listModels()
    note(true, `models.list() returned ${available.length} model(s)`)
  } catch (cause) {
    note(false, 'models.list() failed', cause instanceof Error ? cause.message : String(cause))
    process.stdout.write('\nCannot verify model IDs without a model list.\n')
    return 1
  }

  for (const [label, id] of [
    ['GEMINI_TEXT_MODEL', config.GEMINI_TEXT_MODEL],
    ['GEMINI_IMAGE_MODEL', config.GEMINI_IMAGE_MODEL],
    ['GEMINI_EMBEDDING_MODEL', config.GEMINI_EMBEDDING_MODEL],
  ] as const) {
    const found = available.includes(id)
    note(found, `${label}=${id}`, found ? '' : 'not in models.list()')
  }

  if (failures > 0) {
    process.stdout.write('\nAvailable models:\n')
    for (const m of available.slice(0, 60)) process.stdout.write(`  ${m}\n`)
    return 1
  }

  process.stdout.write('\nRound trips\n')
  // Once the daily quota is gone, every further probe returns the same 429.
  // Stop rather than burning attempts and printing repeated failures.
  let quotaGone = false

  try {
    const res = await client.generateText({
      prompt: 'Reply with the single word: ready',
      label: 'doctor.text',
      // Thinking tokens are drawn from maxOutputTokens, so a tight cap on a
      // thinking model leaves nothing for the visible reply. Disable thinking
      // for this probe and still leave generous headroom.
      thinkingBudget: 0,
      maxOutputTokens: 256,
      temperature: 0,
    })
    note(true, 'text generation', `${res.usage.total} tokens`)
  } catch (cause) {
    quotaGone = isExhaustedQuota(cause) || isExhaustedQuota((cause as { cause?: unknown })?.cause)
    note(false, 'text generation', describe(cause))
  }

  if (quotaGone) {
    process.stdout.write(
      '\nDaily quota is exhausted — skipping the remaining probes.\n' +
        'Model IDs above are still verified. Re-run when quota resets to\n' +
        'confirm generation, embeddings, and grounding.\n'
    )
    return 1
  }

  try {
    const res = await client.embed({
      texts: ['post-quantum cryptography for developers'],
      taskType: config.GEMINI_EMBEDDING_TASK_TYPE,
      outputDimensionality: config.GEMINI_EMBEDDING_DIM,
      label: 'doctor.embed',
    })
    const dim = res.vectors[0]?.length ?? 0
    const matches = dim === config.GEMINI_EMBEDDING_DIM
    note(
      matches,
      'embeddings',
      matches ? `${dim} dims` : `got ${dim} dims, expected ${config.GEMINI_EMBEDDING_DIM}`
    )
  } catch (cause) {
    quotaGone = isExhaustedQuota(cause) || isExhaustedQuota((cause as { cause?: unknown })?.cause)
    note(false, 'embeddings', describe(cause))
  }

  if (quotaGone) {
    process.stdout.write('\nDaily quota is exhausted — skipping the capability probe.\n')
    return 1
  }

  // The architectural probe. A failure here is informational, not fatal:
  // the pipeline already assumes the two cannot be combined.
  process.stdout.write('\nCapability probe\n')
  let groundingWorks = false
  try {
    const res = await client.generateText({
      prompt: 'In one sentence, what changed in TypeScript most recently?',
      label: 'doctor.grounded',
      grounded: true,
      // Grounding injects retrieved passages before generation, and on a
      // thinking model the reasoning pass draws from this same budget.
      maxOutputTokens: 2048,
    })
    groundingWorks = res.sources.length > 0
    note(groundingWorks, 'grounded search', `${res.sources.length} source(s)`)
  } catch (cause) {
    const quota = isExhaustedQuota(cause) || isExhaustedQuota((cause as { cause?: unknown })?.cause)
    note(false, 'grounded search', describe(cause))
    if (quota) {
      process.stdout.write(
        '\n  Grounded search bills against a separate Google Search retrieval\n' +
          '  quota — plain generation above still worked, so the key is fine.\n'
      )
    }
  }

  // The one unknown that changes code shape rather than a constant: can a
  // single call do grounded search AND constrained JSON output? Historically
  // the API rejected the combination, which is why discovery is split into a
  // grounded free-text call followed by an ungrounded structuring call. If the
  // restriction has lifted, those two can be merged into one.
  //
  // Neither answer is a failure — this probe reports a fact about the API, so
  // it never touches the failure count. A quota 429 tells us nothing either
  // way and is reported as inconclusive rather than "unsupported".
  if (groundingWorks) {
    try {
      await client.generateJson({
        prompt: 'Name one recent TypeScript release and the year it shipped.',
        label: 'doctor.grounded-json',
        grounded: true,
        schema: z.object({ release: z.string(), year: z.number() }),
        responseSchema: {
          type: 'object',
          properties: { release: { type: 'string' }, year: { type: 'number' } },
          required: ['release', 'year'],
        },
        maxOutputTokens: 2048,
      })
      process.stdout.write(
        '  ok    grounding + JSON in one call — SUPPORTED\n' +
          '        discovery stages (a) and (b) can be merged into one call\n'
      )
    } catch (cause) {
      const quota = isExhaustedQuota(cause) || isExhaustedQuota((cause as { cause?: unknown })?.cause)
      if (quota) {
        process.stdout.write('  ??    grounding + JSON in one call — inconclusive (quota)\n')
      } else {
        process.stdout.write(
          '  ok    grounding + JSON in one call — NOT supported\n' +
            `        the two-call split is correct (${describe(cause)})\n`
        )
      }
    }
  } else {
    process.stdout.write('  ??    grounding + JSON in one call — skipped (grounding unavailable)\n')
  }

  const usage = client.totalUsage()
  logger.info('doctor complete', { failures, ...usage })
  process.stdout.write(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  return failures === 0 ? 0 : 1
}

/**
 * Refuses to run if the post or asset directories are dirty.
 *
 * Deliberately scoped to `data/blog/` and `public/static/images/blog/` rather
 * than the whole repo. `app/tag-data.json` is a build artifact regenerated by
 * every contentlayer build, so a repo-wide clean check would essentially never
 * pass and the guard would be disabled in practice.
 */
async function assertPublishPathsClean(logger: Logger): Promise<boolean> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const exec = promisify(execFile)

  const { stdout } = await exec(
    'git',
    ['status', '--porcelain', '--', 'data/blog', 'public/static/images/blog'],
    { cwd: paths.root }
  )
  if (stdout.trim() === '') return true

  logger.error('refusing to run: post or image paths have uncommitted changes', {
    dirty: stdout.trim().split('\n').slice(0, 10),
  })
  return false
}

interface RunArgs {
  config: Config
  logger: Logger
  dryRun: boolean
  researchOnly: boolean
  forcePublish: boolean
  json: boolean
}

async function cmdRun(args: RunArgs): Promise<number> {
  const { config, logger } = args
  const dryRun = args.dryRun || config.DRY_RUN

  if (!dryRun && !(await assertPublishPathsClean(logger))) return 1

  const mode: RunMode = args.researchOnly
    ? 'research-only'
    : args.forcePublish
      ? 'force-publish'
      : 'auto'

  // In a real CI run the state branch is cloned to a scratch dir outside the
  // workspace; locally it falls back to a directory alongside the agent so a
  // developer can inspect it.
  const checkout = dryRun
    ? null
    : await checkoutState({
        repoRoot: paths.root,
        branch: config.STATE_BRANCH,
        botName: 'blog-agent[bot]',
        botEmail: 'blog-agent@users.noreply.github.com',
        logger,
      })

  const stateRoot = checkout?.dir ?? path.join(paths.artifacts, 'state')
  const store = createStateStore(stateRoot, logger)

  try {
    const outcome = await runPipeline({
      mode,
      dryRun,
      config,
      client: createGeminiClient(config, logger),
      store,
      logger,
    })

    if (checkout) {
      await checkout.push(`agent: run ${outcome.runId} (${outcome.reason})`)
    }

    if (args.json) {
      process.stdout.write(JSON.stringify(outcome, null, 2) + '\n')
    } else {
      process.stdout.write(
        `\n${outcome.published ? 'Published' : 'No post published'} — ${outcome.reason}\n` +
          `  run:    ${outcome.runId}\n` +
          (outcome.slug ? `  slug:   ${outcome.slug}\n` : '') +
          (outcome.prUrl ? `  pr:     ${outcome.prUrl}\n` : '') +
          `  queued: ${outcome.queued}\n` +
          `  tokens: ${outcome.tokens}\n`
      )
    }
    // Not publishing is a normal outcome for 3 of 4 daily runs, so only a real
    // failure should turn the workflow red.
    return outcome.reason === 'gates-failed' ? 1 : 0
  } finally {
    await checkout?.cleanup()
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const command = argv[0] as Subcommand | undefined
  const json = argv.includes('--json')
  const dryRun = argv.includes('--dry-run')
  const researchOnly = argv.includes('--research-only')
  const forcePublish = argv.includes('--force-publish')

  if (!command || command === ('--help' as Subcommand) || !SUBCOMMANDS.includes(command)) {
    process.stdout.write(usage() + '\n')
    return command && !SUBCOMMANDS.includes(command) ? 1 : 0
  }

  await loadDotEnv(path.join(paths.agent, '.env'))

  const logger = createLogger({
    level: (process.env['LOG_LEVEL'] as 'info') ?? 'info',
    format: process.env['LOG_FORMAT'] === 'json' ? 'json' : 'pretty',
  })

  if (command === 'corpus') return cmdCorpus(json)
  if (command === 'style') return cmdStyle()

  const config = tryLoadConfig(logger)
  if (!config) return 1

  if (command === 'doctor') return cmdDoctor(config, createGeminiClient(config, logger), logger)

  if (command === 'run') {
    return cmdRun({ config, logger, dryRun, researchOnly, forcePublish, json })
  }

  process.stdout.write(usage() + '\n')
  return 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((cause: unknown) => {
    process.stderr.write(`\nUnhandled failure: ${cause instanceof Error ? cause.stack : String(cause)}\n`)
    process.exitCode = 1
  })

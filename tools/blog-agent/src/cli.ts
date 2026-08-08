#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { loadConfig, type Config } from './config/env.js'
import { paths } from './config/paths.js'
import { readCorpus } from './corpus/reader.js'
import { computeStyleMetrics, renderStyleBrief } from './corpus/style.js'
import { createGeminiClient } from './gemini/client.js'
import type { GeminiClient } from './gemini/types.js'
import { createLogger, type Logger } from './lib/logger.js'

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

const SUBCOMMANDS = ['doctor', 'style', 'corpus'] as const
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
    '  doctor    Validate env, verify model IDs, probe SDK capabilities',
    '  style     Print the style brief derived from data/blog/*.mdx',
    '  corpus    Summarise the posts currently on disk',
    '',
    'Options:',
    '  --json    Machine-readable output where supported',
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
  try {
    const res = await client.generateText({
      prompt: 'Reply with the single word: ready',
      label: 'doctor.text',
      maxOutputTokens: 16,
      temperature: 0,
    })
    note(true, 'text generation', `${res.usage.total} tokens`)
  } catch (cause) {
    note(false, 'text generation', cause instanceof Error ? cause.message : String(cause))
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
    note(false, 'embeddings', cause instanceof Error ? cause.message : String(cause))
  }

  // The architectural probe. A failure here is informational, not fatal:
  // the pipeline already assumes the two cannot be combined.
  process.stdout.write('\nCapability probe\n')
  try {
    const res = await client.generateText({
      prompt: 'In one sentence, what changed in TypeScript most recently?',
      label: 'doctor.grounded',
      grounded: true,
      maxOutputTokens: 256,
    })
    note(res.sources.length > 0, 'grounded search', `${res.sources.length} source(s)`)
  } catch (cause) {
    note(false, 'grounded search', cause instanceof Error ? cause.message : String(cause))
  }

  process.stdout.write(
    '\nNote: whether grounding can be combined with responseSchema in ONE call\n' +
      'is not probed automatically — it needs a deliberate two-variant test.\n' +
      'The pipeline splits discovery into grounded-then-structure regardless,\n' +
      'so this only decides whether those two calls can be merged.\n'
  )

  const usage = client.totalUsage()
  logger.info('doctor complete', { failures, ...usage })
  process.stdout.write(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  return failures === 0 ? 0 : 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const command = argv[0] as Subcommand | undefined
  const json = argv.includes('--json')

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
  return cmdDoctor(config, createGeminiClient(config, logger), logger)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((cause: unknown) => {
    process.stderr.write(`\nUnhandled failure: ${cause instanceof Error ? cause.stack : String(cause)}\n`)
    process.exitCode = 1
  })

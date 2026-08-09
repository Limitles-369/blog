import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { paths } from '../config/paths.js'
import type { Logger } from '../lib/logger.js'
import { err, type GateFinding } from './types.js'

const run = promisify(execFile)

/**
 * Proves the post compiles by running the real contentlayer build against it.
 *
 * Two things make this gate subtler than "run the build, check the exit code".
 *
 * 1. Exit code 0 does not mean the post is valid. Upstream defaults are
 *    onMissingOrIncompatibleData: 'skip-warn' and onUnknownDocuments:
 *    'skip-warn', so a post with a missing title is SKIPPED with a warning and
 *    the build still exits 0 — the PR merges and the URL 404s. Phase 0 sets
 *    both to 'fail' in contentlayer.config.ts, but the gate must not depend on
 *    that alone: it asserts the slug is actually present in the generated
 *    output, with a non-empty compiled body. Belt and braces, because the
 *    failure mode is silent.
 *
 * 2. It must not run in the primary working tree. The build writes tracked
 *    app/tag-data.json, gitignored public/search.json, and .contentlayer/.
 *    Doing that in place dirties the repo, and if a `next dev` is running it
 *    races that server's watcher over the same files. A detached git worktree
 *    is hermetic and cannot leave the tree dirty even if the process is killed.
 */

export interface CompileGateResult {
  findings: GateFinding[]
  /** Bytes of app/tag-data.json produced by the isolated build, if any. */
  tagData?: string
}

const GATE = 'mdx-compiles'

export interface CompileGateInput {
  slug: string
  /** Final serialised post bytes. */
  source: string
  /** Assets to stage into the worktree: repo-relative path -> absolute source. */
  assets?: ReadonlyMap<string, string>
  logger: Logger
}

export async function runCompileGate(input: CompileGateInput): Promise<CompileGateResult> {
  const { slug, source, logger } = input
  const findings: GateFinding[] = []
  const scratch = await mkdtemp(path.join(tmpdir(), 'blog-agent-gate-'))
  const worktree = path.join(scratch, 'tree')

  try {
    await run('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: paths.root })

    // nodeLinker is node-modules, so a symlink is enough and avoids a reinstall.
    await symlink(path.join(paths.root, 'node_modules'), path.join(worktree, 'node_modules'), 'dir')

    await writeFile(path.join(worktree, 'data', 'blog', `${slug}.mdx`), source, 'utf8')

    // remarkImgToJsx resolves against process.cwd() + '/public', so assets must
    // be present inside the worktree for the image transform to fire.
    for (const [relPath, absSource] of input.assets ?? new Map()) {
      const target = path.join(worktree, relPath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, await readFile(absSource))
    }

    let stderr = ''
    let failed = false
    try {
      const result = await run('node', ['node_modules/contentlayer2/bin/cli.cjs', 'build'], {
        cwd: worktree,
        // Without this, contentlayer's mdx layer forces NODE_ENV=development,
        // which makes createTagCount count draft tags. Committing that output
        // would put draft-only tags on /tags and into the sitemap, pointing at
        // pages that render zero posts.
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('npm_') && k !== 'PWD')),
          NODE_ENV: 'production',
          INIT_CWD: undefined
        } as NodeJS.ProcessEnv,
        maxBuffer: 32 * 1024 * 1024,
      })
      stderr = result.stderr
    } catch (cause) {
      failed = true
      const e = cause as { stderr?: string; stdout?: string; message?: string }
      stderr = e.stderr || e.stdout || e.message || String(cause)
    }

    if (failed) {
      findings.push(err(GATE, `contentlayer build failed:\n${tail(stderr)}`))
      return { findings }
    }

    // A warning here means a document was skipped rather than rejected.
    if (/\bwarn/i.test(stderr) && /skip/i.test(stderr)) {
      findings.push(err(GATE, `contentlayer skipped a document:\n${tail(stderr)}`))
    }

    const indexPath = path.join(worktree, '.contentlayer', 'generated', 'Blog', '_index.json')
    if (!existsSync(indexPath)) {
      findings.push(err(GATE, 'Build produced no .contentlayer/generated/Blog/_index.json'))
      return { findings }
    }

    const docs = JSON.parse(await readFile(indexPath, 'utf8')) as unknown
    if (!Array.isArray(docs)) {
      findings.push(err(GATE, 'Generated Blog index was not an array'))
      return { findings }
    }

    const doc = docs.find(
      (d): d is Record<string, unknown> =>
        typeof d === 'object' && d !== null && (d as Record<string, unknown>)['slug'] === slug
    )

    if (!doc) {
      findings.push(
        err(
          GATE,
          `Build exited 0 but "${slug}" is absent from the generated output — it was silently skipped and would 404 in production`
        )
      )
      return { findings }
    }

    const body = doc['body'] as { code?: unknown; raw?: unknown } | undefined
    if (!body || typeof body.code !== 'string' || body.code.length === 0) {
      findings.push(err(GATE, `"${slug}" compiled to an empty body`))
    }
    if (typeof doc['readingTime'] !== 'object' || doc['readingTime'] === null) {
      findings.push(err(GATE, `"${slug}" has no readingTime computed`))
    }
    if (!Array.isArray(doc['toc'])) {
      findings.push(err(GATE, `"${slug}" has no table of contents computed`))
    }
    if (typeof doc['structuredData'] !== 'object' || doc['structuredData'] === null) {
      findings.push(err(GATE, `"${slug}" has no JSON-LD structuredData computed`))
    }

    let tagData: string | undefined
    const tagDataPath = path.join(worktree, 'app', 'tag-data.json')
    if (existsSync(tagDataPath)) tagData = await readFile(tagDataPath, 'utf8')

    logger.debug('compile gate finished', { slug, findings: findings.length })
    return tagData === undefined ? { findings } : { findings, tagData }
  } finally {
    await run('git', ['worktree', 'remove', '--force', worktree], { cwd: paths.root }).catch(() => {})
    await rm(scratch, { recursive: true, force: true }).catch(() => {})
  }
}

function tail(text: string, lines = 40): string {
  return text.split('\n').slice(-lines).join('\n').trim()
}

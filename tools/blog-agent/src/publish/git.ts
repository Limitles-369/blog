import { execFile } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import type { Logger } from '../lib/logger.js'

const exec = promisify(execFile)

/**
 * Git plumbing for the state branch and post branches.
 *
 * Several decisions here exist because the obvious version fails on the very
 * first CI run, in ways that are easy to miss locally.
 */

export interface GitOptions {
  /** Repo working tree the posts live in. */
  repoRoot: string
  logger: Logger
}

export interface RunGit {
  (args: string[], opts?: { cwd?: string; allowFail?: boolean }): Promise<string>
}

export function makeGit(defaultCwd: string, logger: Logger): RunGit {
  return async (args, opts = {}) => {
    const cwd = opts.cwd ?? defaultCwd
    try {
      const { stdout } = await exec('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })
      return stdout.trim()
    } catch (cause) {
      if (opts.allowFail) return ''
      const e = cause as { stderr?: string; message?: string }
      logger.debug('git failed', { args, cwd, stderr: e.stderr })
      throw new Error(`git ${args.join(' ')} failed: ${e.stderr ?? e.message ?? String(cause)}`)
    }
  }
}

export interface StateCheckout {
  /** Working copy of the state branch. */
  dir: string
  /** Commit and push, rebasing onto concurrent updates. */
  push(message: string): Promise<boolean>
  cleanup(): Promise<void>
}

export interface CheckoutStateOptions {
  repoRoot: string
  branch: string
  /** Remote URL or name. Defaults to `origin`. */
  remote?: string
  /**
   * GitHub token for authenticated HTTPS pushes.
   *
   * The scratch-dir clone does not inherit the `http.extraheader` that
   * `actions/checkout` installs in the workspace `.git/config`, so plain
   * HTTPS pushes from the clone prompt for credentials and crash (no TTY).
   * When supplied, the token is embedded as `x-access-token` in the push
   * URL — the standard credential mechanism for GitHub HTTPS — without
   * being written to any config file.
   */
  githubToken?: string
  botName: string
  botEmail: string
  logger: Logger
}

/**
 * Clones the state branch into a scratch directory outside the workspace.
 *
 * Three things this handles that a plain `actions/checkout` step does not:
 *
 *  1. **The branch may not exist yet.** Checking out a missing ref fails with
 *     "couldn't find remote ref", so the first run would never get off the
 *     ground. Falls back to creating an orphan branch locally.
 *
 *  2. **Identity is not configured.** `actions/checkout` sets only
 *     `http.extraheader`, not `user.name`/`user.email`, so a bare `git commit`
 *     fails with "Please tell me who you are" on every run.
 *
 *  3. **It must live outside `$GITHUB_WORKSPACE`.** `actions/checkout`'s `path`
 *     is required to stay inside the workspace, but a nested git repo there is
 *     recorded as a gitlink by any `git add -A` in the publisher and deleted by
 *     any `git clean -fd`. A scratch dir sidesteps both.
 */
/**
 * Injects a GitHub token into a bare HTTPS remote URL.
 *
 * `https://github.com/owner/repo` → `https://x-access-token:TOKEN@github.com/owner/repo`
 *
 * This is the standard credential mechanism for authenticated GitHub HTTPS
 * and is accepted by every git version that supports HTTPS at all.
 * Returns the original URL unchanged if it is not HTTPS or if no token is given.
 */
function withToken(url: string, token: string | undefined): string {
  if (!token || !url.startsWith('https://')) return url
  try {
    const u = new URL(url)
    u.username = 'x-access-token'
    u.password = token
    return u.toString()
  } catch {
    return url
  }
}

export async function checkoutState(opts: CheckoutStateOptions): Promise<StateCheckout> {
  const { repoRoot, branch, botName, botEmail, logger } = opts
  const log = logger.child({ component: 'git.state' })
  const scratch = await mkdtemp(path.join(tmpdir(), 'blog-agent-state-'))
  const dir = path.join(scratch, 'state')

  const repoGit = makeGit(repoRoot, logger)
  const remoteBase =
    opts.remote ?? (await repoGit(['remote', 'get-url', 'origin'], { allowFail: true }))
  // Authenticated URL used for push. The base URL (no token) is used for clone
  // since actions/checkout's extraheader already covers the workspace fetch.
  const remote = remoteBase
  const pushRemote = withToken(remoteBase, opts.githubToken)

  const git = makeGit(dir, logger)
  let bootstrapped = false

  if (remote) {
    const cloned = await repoGit(
      ['clone', '--branch', branch, '--single-branch', '--no-tags', remote, dir],
      { allowFail: true }
    )
    bootstrapped = cloned !== '' || existsSync(path.join(dir, '.git'))
  }

  if (!existsSync(path.join(dir, '.git'))) {
    // First run: the branch does not exist remotely yet.
    log.info('state branch not found; bootstrapping orphan branch', { branch })
    await exec('mkdir', ['-p', dir])
    await git(['init', '-q'])
    await git(['checkout', '-q', '--orphan', branch])
    // Use the authenticated URL so the very first push works without a
    // credential prompt (no TTY in CI).
    if (pushRemote) await git(['remote', 'add', 'origin', pushRemote])
    bootstrapped = false
  }

  await git(['config', 'user.name', botName])
  await git(['config', 'user.email', botEmail])

  return {
    dir,

    async push(message: string): Promise<boolean> {
      await git(['add', '-A'])
      const staged = await git(['diff', '--staged', '--name-only'])
      if (staged === '') {
        log.debug('no state changes to push')
        return false
      }
      await git(['commit', '-q', '-m', message])

      if (!pushRemote) {
        log.warn('no remote configured; state committed locally only')
        return true
      }

      // The clone happened at minute 0 and this push may be 20 minutes later.
      // Anything that touched the branch in between rejects a plain push, and
      // losing the state write is exactly the failure that causes duplicate
      // publishing — so rebase and retry rather than giving up.
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          // Push explicitly to the authenticated URL rather than to the
          // "origin" remote name. The clone's origin may be the bare URL
          // (no token) if the clone was done before the token was known.
          await git(['push', pushRemote, `HEAD:${branch}`])
          return true
        } catch (cause) {
          if (attempt === 5) throw cause
          log.warn('state push rejected; rebasing', { attempt })
          await git(['fetch', pushRemote, branch], { allowFail: true })
          const rebased = await git(['rebase', `FETCH_HEAD`], { allowFail: true })
          if (rebased === '') {
            await git(['rebase', '--abort'], { allowFail: true })
            // Per-run files and disjoint JSON edits normally rebase cleanly;
            // if not, prefer our version over dropping the write entirely.
            await git(['reset', '--hard', 'HEAD'], { allowFail: true })
          }
        }
      }
      return true
    },

    async cleanup(): Promise<void> {
      await exec('rm', ['-rf', scratch]).catch(() => {})
    },
  }
}

/** Was this bootstrapped from an existing remote branch? Used only for logging. */
export function describeCheckout(c: StateCheckout): string {
  return c.dir
}

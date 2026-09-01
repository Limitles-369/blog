# Deployment

## CI/CD Overview

The agent runs via a GitHub Actions workflow defined in `.github/workflows/blog-agent.yml`.

## Workflow Configuration

### Schedule

```yaml
schedule:
  - cron: '17 */6 * * *' # Every 6 hours at :17 past the hour
```

The off-hour minute (`:17`) avoids the most contended cron slot on shared runners (top of the hour), where delayed starts are routine.

This schedule means **4 runs per day**. Research happens on every run; writing is gated to at most once per day.

### Manual Trigger

```yaml
workflow_dispatch:
  inputs:
    mode:
      type: choice
      options: [auto, research-only, force-publish]
      default: auto
    dry_run:
      type: boolean
      default: false
```

### Concurrency

```yaml
concurrency:
  group: blog-agent
  cancel-in-progress: false
```

**Never interrupts a running instance.** A run that is mid-publish holds write-ahead state, and while the reconciliation protocol handles crashes, not interrupting is cheaper than reconciling.

### Permissions

```yaml
permissions:
  contents: write # Push bot/* branches and the state branch
  pull-requests: write # Open PRs
```

## Workflow Steps

| Step                            | Description                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Checkout**                    | `actions/checkout@v4` with `fetch-depth: 0` (full history for worktree operations)               |
| **Node.js setup**               | `actions/setup-node@v4` with Node 20                                                             |
| **Install site dependencies**   | `corepack enable && yarn install --immutable` (needed for compile gate's symlinked node_modules) |
| **Install agent dependencies**  | `npm ci` in `tools/blog-agent/`                                                                  |
| **Verify agent**                | `npm run verify` (typecheck + tests)                                                             |
| **Run agent**                   | `npm run start -- run` with mode and dry-run flags from inputs                                   |
| **Upload artifacts on failure** | `actions/upload-artifact@v4` — uploads `.artifacts/` for debugging (7-day retention)             |

## Environment Variables in CI

```yaml
env:
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  GEMINI_TEXT_MODEL: ${{ vars.GEMINI_TEXT_MODEL || 'gemini-3.5-flash' }}
  GEMINI_EMBEDDING_MODEL: ${{ vars.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2-preview' }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  GITHUB_REPOSITORY: ${{ github.repository }}
  LOG_FORMAT: json
  DRY_RUN: ${{ inputs.dry_run && 'true' || 'false' }}
```

Model IDs are read from repository variables (falling back to defaults), so they can be updated without code changes.

## State Persistence

State is persisted on the `blog-agent-state` git branch:

```
state/
├── published.json     # Ledger of all posts created
├── queue.json         # Scored topic candidates
├── cadence.json       # Timing anchors
├── control.json       # Kill switch
├── embeddings/        # Quantised vector cache (one file per hash)
├── rejected/          # Archived drafts from closed PRs
└── runs/              # Per-run outcome records
```

The state branch is cloned to a **scratch directory outside `$GITHUB_WORKSPACE`** to avoid git worktree conflicts. On push, a 5-attempt rebase-retry loop handles concurrent updates.

## Post Branch Naming

```
bot/post-<slug>-<runId>
```

The run ID suffix ensures a retry after a partial failure creates a new branch rather than clobbering a live PR's branch.

## Build Process

There is no production build step. The agent is executed directly via `tsx` (TypeScript executed by `tsx 4.19.2`). `tsconfig.json` has `noEmit: true` — `tsc` is used purely as a type checker.

## Timeout

The workflow has a **30-minute timeout** (`timeout-minutes: 30`). Individual API calls have their own timeouts:

- Text generation: 120s
- Image generation: 180s
- Total run ceiling: 1,200s (20 min)

## Failure Handling

| Failure                      | CI Outcome                        |
| ---------------------------- | --------------------------------- |
| Cadence gate blocks (normal) | Exit 0 (green)                    |
| Research-only mode           | Exit 0 (green)                    |
| Dry run                      | Exit 0 (green)                    |
| Gate validation failure      | Exit 1 (red) — artifacts uploaded |
| API quota exhausted          | Exit 1 (red)                      |
| State corruption             | Exit 1 (red)                      |
| Unhandled exception          | Exit 1 (red) — artifacts uploaded |

## Rollback

There is no automated rollback mechanism. If a bad post is merged:

1. Revert the merge commit
2. Mark the entry as `rejected` in `state/published.json` on the state branch (or let reconciliation handle it when the PR is closed)

## Monitoring

- **Stall detection:** After 12 consecutive idle runs (~72 hours), the agent logs an error
- **Run outcome logging:** Each run reports `published/not-published`, reason, slug, PR URL, queue depth, and token usage
- **Artifact upload on failure:** `.artifacts/` contains generated MDX and debug output

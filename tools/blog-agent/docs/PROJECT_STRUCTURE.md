# Project Structure

## Top-Level Layout

```
tools/blog-agent/
├── src/                    # All production source code
│   ├── cli.ts              # Entry point — subcommand dispatch
│   ├── config/             # Environment parsing and path resolution
│   ├── corpus/             # Reads existing blog posts from disk
│   ├── gemini/             # Google Gemini SDK wrapper
│   ├── gates/              # Multi-layer validation system
│   ├── lib/                # Shared utilities (retry, vector, hash, slugify, logger)
│   ├── mdx/                # MDX frontmatter schema and serialisation
│   ├── pipeline/           # Orchestrator — the run loop
│   ├── publish/            # Git operations and GitHub PR creation
│   ├── research/           # Topic discovery and deduplication
│   └── state/              # Persistent state management
├── test/                   # Vitest test suite
├── .artifacts/             # Per-run debug output (gitignored)
├── .env                    # Local environment (gitignored)
├── .env.example            # Template with all variables documented
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript config (noEmit — tsx runs directly)
└── vitest.config.ts        # Test configuration
```

## Source Modules

### `src/cli.ts` — Entry Point

| Responsibility | Detail |
|---------------|--------|
| `.env` loading | Custom minimal parser; no `dotenv` dependency |
| Subcommand dispatch | `run`, `doctor`, `style`, `corpus` |
| Flag parsing | `--dry-run`, `--research-only`, `--force-publish`, `--json` |
| Dirty-tree guard | Refuses to run if `data/blog/` or `public/static/images/blog/` have uncommitted changes |

### `src/config/env.ts` — Environment Configuration

The **only module that reads `process.env`**. Everything downstream receives a validated `Config` object. Uses Zod for schema validation with semantic cross-field checks (e.g., `TARGET_WORDS_MIN ≤ TARGET_WORDS_MAX`).

### `src/config/paths.ts` — Path Resolution

Resolves every filesystem path the agent touches from the repo root. Walks upward from the agent package looking for `contentlayer.config.ts` as the root marker. This keeps working when invoked through a symlink or git worktree.

**Key paths:**
- `root` — Blog repo root (parent of `tools/`)
- `blog` — `data/blog/` (MDX post sources)
- `blogImages` — `public/static/images/blog/` (hero images)
- `artifacts` — `.artifacts/` (per-run debug output, gitignored)

### `src/corpus/reader.ts` — Corpus Reader

Reads existing posts directly from disk via `gray-matter`, **not** from `.contentlayer/generated`. That directory is a build artifact which may be stale, absent on a fresh clone, or mid-write by a running `next dev`.

**Exports:** `readCorpus()`, `published()`, `allSlugs()`, `tagFrequency()`, `readAuthorIds()`

### `src/corpus/style.ts` — Style Analysis

Derives a measurable style profile from existing posts rather than hand-written prompt prose. Measures: word counts, heading distribution, paragraph length, code fence ratio, bullet frequency, external link density, recurring headings, and top tags.

**Why measured:** A prose description written today silently stops matching the blog as the blog evolves. Measured metrics track whatever is actually on disk.

### `src/gemini/client.ts` — Gemini SDK Wrapper

The concrete `GeminiClient` implementation. Wraps every API call in a **timeout → retry → logging** envelope. Handles two image generation paths (Gemini native via `generateContent` with `responseModalities` vs Imagen via dedicated `generateImages` endpoint).

### `src/gemini/types.ts` — Client Interface

Defines the `GeminiClient` interface that every stage depends on. The SDK's exact shape is confined to `client.ts`, making every stage unit-testable with a plain object.

**Exports:** `GeminiClient`, `TokenUsage`, `TextResult`, `JsonResult`, `EmbedResult`, `ImageResult`, `ModelResponseError`

### `src/gates/` — Validation Gate System

| File | Gates | Type |
|------|-------|------|
| `types.ts` | Gate framework, `GateContext`, `GateFinding`, severity model | Framework |
| `content.ts` | `frontmatterGate`, `makeDateGate`, `makeContentQualityGate` | Cheap |
| `structure.ts` | `headingHierarchyGate`, `componentAllowlistGate`, `secretScanGate` | Cheap |
| `assets.ts` | `assetsExistGate`, `internalLinksGate`, `externalLinksGate` | Cheap + Network |
| `compile.ts` | `runCompileGate` — full Contentlayer build in an isolated git worktree | Expensive |
| `run.ts` | `runGates` — orchestrates all gates in cost order | Orchestrator |

### `src/lib/` — Shared Utilities

| File | Purpose |
|------|---------|
| `logger.ts` | Structured logger with JSON/pretty modes, secret redaction, `timed()` helper |
| `retry.ts` | Exponential backoff with full jitter, `Retry-After` / `RetryInfo` parsing, quota detection |
| `vector.ts` | Cosine similarity, L2 normalisation, int8 quantisation/dequantisation |
| `slugify.ts` | Filename-safe slug generation, bounded slugs, Jaccard similarity, stopword removal |
| `hash.ts` | SHA-256 content hashing for embedding cache keys |

### `src/mdx/frontmatter.ts` — Frontmatter Schema

Zod schema that is **intentionally stricter** than `contentlayer.config.ts`. Narrows `layout` to a validated enum, requires non-empty `summary`, and enforces `.strict()` to prevent inventing frontmatter that silently disappears.

### `src/mdx/serialize.ts` — Post Serialisation

Hand-written YAML serialiser (not a YAML library) to match the style of existing hand-written posts. Produces Prettier-stable output with single-quoted scalars and flow-style arrays.

### `src/pipeline/orchestrator.ts` — Run Loop

The heart of the system. Implements the 6-phase pipeline with the critical phase ordering that ensures the topic queue builds up before writing.

### `src/publish/git.ts` — Git Plumbing

State branch checkout (handles first-run orphan creation, identity config, and location outside `$GITHUB_WORKSPACE`) and rebase-retry push logic.

### `src/publish/pr.ts` — PR Creation

Branch creation, asset staging, Prettier formatting, commit message generation, `gh pr create` invocation, and PR body rendering with gate reports and source citations.

### `src/publish/reconcile.ts` — GitHub Reconciliation

Reconciles local `published.json` against actual GitHub PR states via `gh pr list`. Handles all transitions: inflight→open, open→merged, open→rejected, inflight→rejected.

### `src/research/discover.ts` — Topic Discovery

Two-call research pipeline (grounded free-text → structured JSON), candidate scoring (0-100), and topic candidate schema.

### `src/research/dedup.ts` — Deduplication

Three-tier duplicate detection (normalised title → Jaccard overlap → semantic cosine), with an LLM judge tie-breaker for the ambiguous band between thresholds.

### `src/state/schema.ts` — State Schemas

Versioned Zod schemas for all four state files plus the embedding descriptor. Defines the `PublishState` lifecycle (`inflight → open → merged | rejected`).

### `src/state/store.ts` — State Store

Reads and writes state files with two invariants:
1. **Corruption fails loudly** — a malformed file throws, never silently resets
2. **Writes are atomic** — write-then-rename pattern

Also manages the embedding cache (quantised int8 vectors keyed by text hash and embedding descriptor).

### `src/state/cadence.ts` — Cadence Logic

UTC-day-based publish decision with three independent conditions. Includes stall detection (fires after 12 idle runs / ~72 hours).

## Test Directory

```
test/
├── cadence.test.ts      # 10 tests: publish decision logic, stall detection
├── lib.test.ts          # 15 tests: slugify, vector math, quantisation
├── reconcile.test.ts    # 8 tests: GitHub reconciliation state machine
└── retry.test.ts        # 8 tests: retry logic, quota detection, backoff
```

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | ESM package, Node ≥20.11, 3 runtime + 4 dev dependencies |
| `tsconfig.json` | ES2022 target, strict, `noEmit` (tsx executes directly) |
| `vitest.config.ts` | Node environment, 30s timeout (gates shell out to git) |
| `.env.example` | All 30+ variables with documentation |
| `.gitignore` | Ignores node_modules, .env, .artifacts, dist |
| `.gitattributes` | Git LFS and merge strategies |

# Testing

## Framework

- **Test runner:** Vitest 2.1.8
- **Environment:** Node.js
- **Timeout:** 30 seconds (gates shell out to git and contentlayer)
- **Config:** `vitest.config.ts`

## Running Tests

```bash
# Run all tests once
npm run test

# Watch mode
npm run test:watch

# Run with type checking
npm run verify    # equivalent to: npm run typecheck && npm run test
```

## Test Suite

### `test/cadence.test.ts` — Publish Decision Logic (10 tests)

Tests the three-condition cadence gate and stall detection.

| Test | What It Verifies |
|------|-----------------|
| `utcDay` keys on UTC regardless of local offset | Day key is timezone-independent |
| Publishes on a clean slate | First-ever run proceeds |
| Respects the kill switch | `enabled: false` blocks publishing |
| Refuses a second publish on the same UTC day | Day key dedup works |
| Does not drift when cron fires slightly early | UTC-day key is jitter-immune (the regression this design exists to prevent) |
| Still enforces a floor across midnight boundary | 23:50 → 00:10 is blocked (20h floor) |
| Publishes exactly at the floor | Boundary condition for the 20h gap |
| Refuses while a bot PR is still open | One-open-PR cap works |
| Ignores merged and rejected entries when counting | Only `open` state counts |
| Blocks on an inflight entry | Inflight → must reconcile first |
| Refuses when anchor is in the future | Clock-skew protection |
| Refuses on unparseable anchor | Corrupt state → safe failure |
| Stall detection: quiet below threshold | No false positive under 12 runs |
| Stall detection: fires with no PR ever | 12+ idle runs + no PR history |
| Stall detection: quiet if recent PR | Recent PR resets the clock |
| Stall detection: fires after 72h | 12+ idle runs + last PR > 72h ago |

### `test/lib.test.ts` — Library Utilities (15 tests)

| Module | Tests | Key Assertions |
|--------|-------|---------------|
| `slugify` | 5 | Filename-safe kebab-case, accent stripping, apostrophe handling, punctuation collapse, idempotency |
| `slugifyBounded` | 2 | Never cuts mid-token, leaves short slugs untouched |
| `imageKey` | 1 | Shortens slug to leading N tokens |
| `jaccard` | 3 | Identity = 1, stopword/order insensitivity, disjoint = 0 |
| `cosine` | 5 | Parallel = 1, orthogonal = 0, clamped to ≤ 1, dimension mismatch throws, zero vector throws |
| `l2Normalize` | 1 | Produces unit vector |
| `quantize` | 3 | Round-trip within int8 tolerance, cosine similarity preserved within 0.01, zero vector safe |
| `nearest` | 2 | Null for empty corpus, picks highest-scoring entry |

### `test/reconcile.test.ts` — GitHub Reconciliation (8 tests)

Tests the state machine transitions when reconciling local state against GitHub.

| Test | What It Verifies |
|------|-----------------|
| No network work when nothing is inflight/open | Optimisation: `listPrs` not called unnecessarily |
| Promotes inflight → open when PR exists | Core crash-recovery path |
| Records a merge with real merge timestamp | `publishedAt` comes from GitHub |
| Archives draft when PR closed unmerged | `archiveRejected` callback invoked |
| Releases inflight with no branch and no PR | Run died before pushing anything |
| Keeps inflight whose branch exists but has no PR | Run died between push and PR creation |
| Marks vanished open PR as rejected | PR deleted externally |
| Leaves merged/rejected entries untouched | Terminal states are stable |
| Matches PRs by branch name, not position | Multiple entries reconcile correctly |
| Propagates listing failure | API error must not degrade to "nothing open" |

### `test/retry.test.ts` — Retry Logic (8 tests)

| Test | What It Verifies |
|------|-----------------|
| `isExhaustedQuota` recognises daily quota | Parsed from stringified API error body |
| `isExhaustedQuota` does NOT treat RetryInfo 429 as exhausted | Rate limit ≠ quota exhaustion |
| `isExhaustedQuota` ignores non-429 | Only 429 status matches |
| `isRetryable` does not retry exhausted quota | Fails fast, no attempts wasted |
| `isRetryable` retries rate limit with RetryInfo | Transient, worth retrying |
| `isRetryable` retries model overload | 503 is retryable |
| `isRetryable` retries timeouts | `TimeoutError` is retryable |
| `isRetryable` retries socket errors | ECONNRESET, ETIMEDOUT etc. |
| `isRetryable` does not retry client errors | 400 is permanent |
| `withRetry` returns on first success | No sleeping |
| `withRetry` fails fast on exhausted quota | 1 call, no sleep |
| `withRetry` honours RetryInfo delay | Server-specified delay used |
| `withRetry` grows backoff exponentially | 1000, 2000, 4000, 8000 pattern |
| `withRetry` respects the cap | Never exceeds `capMs` |
| `withRetry` surfaces underlying error as cause | `RetryExhaustedError.cause` is set |

## Test Design Principles

1. **No network in tests.** Reconcile tests inject mock `listPrs` / `listRemoteBranches`. Retry tests inject mock `sleep` and `random`.
2. **Real Zod schemas.** Tests use the production schema types, not simplified fakes.
3. **Named failure modes.** Each test name describes the specific failure scenario it guards against, often with a comment explaining why the failure matters.
4. **Boundary conditions.** Cadence tests check exact-boundary cases (e.g., publish exactly at the 20h floor).

## Coverage Gaps

The following areas have **no automated test coverage**:

| Area | Risk | Priority |
|------|------|----------|
| `src/pipeline/orchestrator.ts` | Core pipeline logic, phase ordering, queue refresh | 🔴 Critical |
| `src/stages/draft.ts` | Prompt construction, `stripAccidentalWrapper` | 🟡 Medium |
| `src/stages/metadata.ts` | Metadata generation, hero image generation | 🟡 Medium |
| `src/research/discover.ts` | Discovery prompt construction, scoring | 🟡 Medium |
| `src/research/dedup.ts` | Three-tier dedup logic, LLM judge | 🟠 High |
| `src/gates/*.ts` | All 8+ validation gates | 🟠 High |
| `src/corpus/reader.ts` | Corpus reading, frontmatter parsing | 🟡 Medium |
| `src/corpus/style.ts` | Style metric computation | 🟡 Medium |
| `src/config/env.ts` | Config validation, cross-field checks | 🟡 Medium |
| `src/gemini/client.ts` | SDK wrapper, response extraction | 🟡 Medium |
| `src/publish/pr.ts` | PR creation, formatting, commit message | 🟡 Medium |
| `src/publish/git.ts` | State checkout, rebase-retry push | 🟡 Medium |
| `src/mdx/serialize.ts` | YAML serialisation | 🟢 Low |
| `src/mdx/frontmatter.ts` | Schema validation (covered transitively) | 🟢 Low |

## Type Checking

```bash
npm run typecheck    # tsc -p tsconfig.json (noEmit mode)
```

TypeScript is configured with strict mode, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`. The compiler is used purely as a type checker; `tsx` executes the TypeScript directly.

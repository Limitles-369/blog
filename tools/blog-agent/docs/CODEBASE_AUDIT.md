# Codebase Audit

## Architecture Strengths

### 1. Deliberate Phase Ordering
The pipeline's phase ordering (research → cadence → draft) is the single most important design decision and it's correct. Running research on every invocation while gating only writing ensures the topic queue builds up organically. This is well-documented both in code comments and in `ARCHITECTURE.md`.

### 2. Write-Ahead State Protocol
The crash-safety protocol is genuinely well-designed. The `inflight` state written before any git operations, combined with GitHub-authoritative reconciliation, prevents the most dangerous failure mode: duplicate publication after a crash. This pattern is more sophisticated than what most production content systems implement.

### 3. Interface Isolation
The `GeminiClient` interface in `src/gemini/types.ts` cleanly separates the SDK's exact shape from business logic. Every stage depends on this interface, making them testable with plain objects. This isolation explicitly acknowledges that the SDK was written from recall and may need correction — a refreshingly honest design approach.

### 4. Fail-Loud State Management
The `StateCorruptError` pattern — where a malformed state file throws rather than silently resetting — directly prevents the most dangerous business logic bug (republishing all previous topics). This is well-reasoned and well-documented.

### 5. Multi-Tier Deduplication
The three-tier dedup system (normalised title → Jaccard → semantic cosine with LLM judge escalation) is cost-efficient: the common case costs zero API calls, and only genuinely ambiguous pairs reach an embedding. The int8 quantisation for storage is a thoughtful optimisation.

### 6. Measured Style Metrics
Deriving style constraints from measurements of existing posts rather than hand-written descriptions is a genuinely good idea. Hand-written style guides drift silently; measured metrics track whatever is on disk.

### 7. Gate System Design
The two-severity model (error blocks, warn informs), cost-ordered execution, and the compile gate's belt-and-braces verification (exit code 0 is insufficient) all reflect experience with real-world content pipeline failures.

---

## Technical Debt

### 🔴 Critical: No Tests for Core Pipeline Logic

**Location:** `src/pipeline/orchestrator.ts` (428 lines, 0 tests)

**Problem:** The orchestrator contains the most important business logic — phase ordering, queue refresh, slug deduplication, publish protocol — and has zero test coverage.

**Why it matters:** This is the code most likely to regress during changes, and the code whose bugs are most expensive (duplicate posts, missed publications, state corruption).

**Recommended solution:** Extract pure functions from `orchestrator.ts` (e.g., `refreshQueue`, `ensureUniqueSlug`) and test them. Create an integration test with a mock `GeminiClient` and in-memory `StateStore`.

---

### 🔴 Critical: No Tests for Validation Gates

**Location:** `src/gates/content.ts`, `src/gates/structure.ts`, `src/gates/assets.ts` (0 tests)

**Problem:** The gates are the safety net that prevents broken content from being published. None of them have unit tests.

**Why it matters:** A gate that fails to catch a defect results in a broken production deployment. A gate that over-fires blocks the pipeline from publishing. Both are serious, and both are easily testable.

**Recommended solution:** Each gate accepts a `GateContext` and returns findings. Write tests with constructed contexts covering both positive (passes) and negative (catches the defect) cases.

---

### 🟠 High: Grounding Currently Disabled

**Location:** `src/research/discover.ts:98`

```typescript
// grounded: true, // TODO: Re-enable once Google Search Grounding quota is restored
```

**Problem:** The grounding flag is commented out, meaning the research sweep runs without Google Search. This significantly reduces the quality and recency of discovered topics.

**Why it matters:** Without grounding, the model generates from its training data rather than current web content. Topics may be stale or already well-covered.

**Recommended solution:** Re-enable grounding when quota is restored. Add a fallback that logs a warning if grounding produces zero sources.

---

### 🟠 High: No Dedup Tests

**Location:** `src/research/dedup.ts` (217 lines, 0 tests)

**Problem:** The three-tier deduplication system has no automated tests. The Jaccard and cosine utilities are tested in `lib.test.ts`, but the composite `checkDuplicate()` logic — tier ordering, escalation to the LLM judge, embedding cache integration — is not.

**Why it matters:** Dedup failure is silent. A broken dedup passes identical topics through, and the agent publishes duplicate content while every run stays green.

**Recommended solution:** Test `checkDuplicate()` with a mock `GeminiClient` and `StateStore`. Cover each tier independently and the escalation path.

---

### 🟡 Medium: Commit Messages Are Not Descriptive

**Location:** Git history shows commits like `u`, `up` for blog-agent changes.

**Problem:** The project's git history lacks descriptive commit messages, making it difficult to trace changes or generate a meaningful changelog.

**Recommended solution:** Adopt conventional commits (e.g., `feat:`, `fix:`, `chore:`) for future changes.

---

### 🟡 Medium: No ESLint Configuration

**Location:** `package.json` has `"lint": "eslint src test --ext .ts"` but no `eslint.config.*` or `.eslintrc` in the agent directory.

**Problem:** The lint command exists but may rely on the parent repo's ESLint config, which may not be tailored for the agent's TypeScript.

**Recommended solution:** Add a local ESLint config or verify the parent config applies correctly.

---

## Potential Bugs

### 🟡 Medium: `RUN_CEILING_MS` Not Enforced

**Location:** `src/config/env.ts:75`

**Problem:** `RUN_CEILING_MS` is parsed and validated (default 1,200,000ms = 20 minutes) but there is no code in `orchestrator.ts` or anywhere else that actually enforces it as a run-time limit. The workflow's `timeout-minutes: 30` is the actual ceiling.

**Why it matters:** The configuration variable suggests a configurable run limit exists, but it is not implemented. A runaway API call sequence could exceed the intended ceiling without being caught until the workflow timeout fires.

**Recommended solution:** Either implement an `AbortController`-based ceiling in the orchestrator, or remove the config variable to avoid misleading operators.

---

### 🟡 Medium: `MAX_EXTERNAL_LINKS` Not Enforced in Gates

**Location:** `src/config/env.ts:77`

**Problem:** `MAX_EXTERNAL_LINKS` is parsed but never referenced outside config. The content quality gate does not check the count of external links against this limit. The prompt instructs the model to cap links, but the gate does not verify compliance.

**Recommended solution:** Add a gate finding (warn severity) when the link count exceeds the configured maximum.

---

### 🟡 Medium: `EXTERNAL_LINK_DENYLIST` Not Enforced

**Location:** `src/config/env.ts:78`

**Problem:** `EXTERNAL_LINK_DENYLIST` is parsed as a CSV array but never used. No gate checks outbound links against the denylist.

**Recommended solution:** Add filtering in the external links gate.

---

## Performance Concerns

### 🟡 Medium: Sequential Embedding Calls in Dedup

**Location:** `src/research/dedup.ts:131-139`

**Problem:** The `checkDuplicate` function embeds known items sequentially in a loop. If the cache is cold and the corpus + published + queue is large, this generates many sequential API calls.

**Recommended solution:** Batch embedding calls where the API supports it (`ai.models.embedContent` accepts multiple texts). Cache hits already skip the API call.

---

### 🟢 Low: Compile Gate Creates a Full Git Worktree

**Location:** `src/gates/compile.ts`

**Problem:** Each compile gate run creates a full git worktree, symlinks node_modules, runs the contentlayer build, and cleans up. This is correct but adds 10-30 seconds per run.

**This is by design:** The isolation is necessary to avoid dirtying the main tree. No change recommended.

---

## Missing Tests (Prioritised)

| Priority | Module | Why |
|----------|--------|-----|
| 🔴 Critical | `src/pipeline/orchestrator.ts` | Core business logic, most dangerous to break |
| 🔴 Critical | `src/gates/*.ts` | Safety net against broken content |
| 🟠 High | `src/research/dedup.ts` | Silent failure mode (duplicate publications) |
| 🟡 Medium | `src/stages/draft.ts` | Prompt construction and `stripAccidentalWrapper` |
| 🟡 Medium | `src/config/env.ts` | Cross-field validation, edge cases |
| 🟡 Medium | `src/corpus/reader.ts` | Frontmatter parsing edge cases |
| 🟢 Low | `src/mdx/serialize.ts` | YAML serialisation edge cases |

---

## Recommended Improvements (Prioritised)

| Priority | Improvement | Effort |
|----------|------------|--------|
| 🔴 Critical | Add orchestrator unit/integration tests | High |
| 🔴 Critical | Add gate unit tests | Medium |
| 🟠 High | Re-enable Google Search grounding | Low |
| 🟠 High | Add dedup integration tests | Medium |
| 🟡 Medium | Implement or remove `RUN_CEILING_MS` | Low |
| 🟡 Medium | Enforce `MAX_EXTERNAL_LINKS` and `EXTERNAL_LINK_DENYLIST` in gates | Low |
| 🟡 Medium | Batch embedding calls in dedup | Medium |
| 🟡 Medium | Add concurrency limiter to external link checker | Low |
| 🟡 Medium | Expand secret scanning patterns | Low |
| 🟢 Low | Adopt conventional commit messages | Low |
| 🟢 Low | Add local ESLint configuration | Low |
| 🟢 Low | Add a `calibrate` subcommand (referenced in `.env.example` but not implemented) | Medium |

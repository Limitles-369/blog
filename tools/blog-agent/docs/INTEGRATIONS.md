# Integrations

## 1. Google Gemini AI (`@google/genai` SDK)

### Purpose

All AI capabilities used by publication: text generation, structured JSON generation, and embeddings.

### Integration Method

Direct SDK usage via `@google/genai` package (^1.0.0). All calls are wrapped in the `GeminiClient` interface (`src/gemini/types.ts`), with the concrete implementation in `src/gemini/client.ts`.

### API Surfaces Used

| Capability                | SDK Method                                                                 | Model Config Variable    | Used By                                               |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------- |
| Text generation           | `ai.models.generateContent()`                                              | `GEMINI_TEXT_MODEL`      | Research, drafting, critique, refinement, dedup judge |
| Structured JSON           | `ai.models.generateContent()` with `responseMimeType: 'application/json'`  | `GEMINI_TEXT_MODEL`      | Outline, metadata, scoring, discovery structuring     |
| Embeddings                | `ai.models.embedContent()`                                                 | `GEMINI_EMBEDDING_MODEL` | Semantic dedup (cosine similarity)                    |
| Model listing             | `ai.models.list()`                                                         | —                        | `doctor` command verification                         |

### Authentication

Single API key via `GEMINI_API_KEY` environment variable, passed to `new GoogleGenAI({ apiKey })`.

### Environment Variables

| Variable                     | Required | Description                                          |
| ---------------------------- | -------- | ---------------------------------------------------- |
| `GEMINI_API_KEY`             | Yes      | API key for authentication                           |
| `GEMINI_TEXT_MODEL`          | Yes      | Model ID for text/JSON calls                         |
| `GEMINI_EMBEDDING_MODEL`     | Yes      | Model ID for embeddings                              |
| `GEMINI_EMBEDDING_TASK_TYPE` | No       | Embedding task type (default: `SEMANTIC_SIMILARITY`) |
| `GEMINI_EMBEDDING_DIM`       | No       | Output dimensionality (default: 1536)                |

### Grounding (Google Search)

Text generation calls can enable grounding via `config.tools: [{googleSearch: {}}]`. Source URLs are extracted from `res.candidates[0].groundingMetadata.groundingChunks[].web.uri`.

**Current status:** Grounding is currently commented out in `discover.ts` with `// TODO: Re-enable once Google Search Grounding quota is restored`.

**Known limitation:** Grounded search and constrained JSON output have historically been mutually exclusive in a single call. The pipeline is built to work either way — discovery runs grounded free-text, then a separate ungrounded call structures it.

### Thinking Model Support

The client supports thinking-enabled models via `thinkingConfig.thinkingBudget`:

- Thinking tokens are drawn from `maxOutputTokens`
- A tight cap on a thinking model can leave nothing for the visible reply
- The `doctor` command disables thinking (`thinkingBudget: 0`) for its probe calls
- Mechanical stages (critique, metadata) should set `thinkingBudget: 0`

### Error Handling

| Error Type                                  | Behaviour                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| **Rate limit (429 with RetryInfo)**         | Retried with server-specified delay                                            |
| **Exhausted quota (429 without RetryInfo)** | Fails fast, no retry attempts consumed                                         |
| **Model overload (503)**                    | Retried with exponential backoff                                               |
| **Transient network errors**                | Retried (ECONNRESET, ETIMEDOUT, etc.)                                          |
| **Client errors (400, 403)**                | Not retried; thrown immediately                                                |
| **Empty response**                          | `ModelResponseError` with diagnosis (thinking budget consumed? finish reason?) |
| **Schema mismatch**                         | `ModelResponseError` with Zod validation details                               |

### Retry Configuration

- Exponential backoff with full jitter
- Honours `Retry-After` header and Google's `RetryInfo` delay
- Default: 5 attempts, 1s base, 60s cap
- Configurable via `RETRY_ATTEMPTS`, `RETRY_BASE_MS`, `RETRY_CAP_MS`

### Token Usage Tracking

Cumulative `TokenUsage` (input, output, thoughts, total) tracked across all calls per run via `client.totalUsage()`. Reported in the run outcome.

---

## 2. GitHub API (via `gh` CLI)

### Purpose

PR creation, PR listing for reconciliation, and remote branch listing.

### Integration Method

Shell execution of the `gh` CLI tool via `node:child_process.execFile`. Not a direct REST API integration.

### Operations

| Operation | Command                                                                                             | Used By                    |
| --------- | --------------------------------------------------------------------------------------------------- | -------------------------- |
| Create PR | `gh pr create --base <branch> --head <branch> --title <title> --body <body>`                        | `src/publish/pr.ts`        |
| List PRs  | `gh pr list --state all --limit 50 --search head:<prefix> --json number,headRefName,state,mergedAt` | `src/publish/reconcile.ts` |

### Authentication

Uses `GITHUB_TOKEN` environment variable. In GitHub Actions, this is provided automatically. Locally, it requires a configured `gh` CLI or a PAT.

### Environment Variables

| Variable            | Required    | Description          |
| ------------------- | ----------- | -------------------- |
| `GITHUB_TOKEN`      | For publish | Authentication token |
| `GITHUB_REPOSITORY` | For publish | `owner/repo` format  |

### Error Handling

- **403 / "not authorized"** — Specific error message directing the user to enable "Allow GitHub Actions to create and approve pull requests"
- **Reconcile API failure** — Propagated as an error rather than assuming "nothing is open" (which would duplicate posts)

---

## 3. Git (via `node:child_process`)

### Purpose

Branch creation, committing posts, pushing branches, state branch management, worktree creation for the compile gate.

### Operations

| Operation                            | Context                                    |
| ------------------------------------ | ------------------------------------------ |
| `git worktree add --detach`          | Compile gate: isolated build environment   |
| `git clone --branch --single-branch` | State branch checkout to scratch directory |
| `git checkout --orphan`              | First-run state branch bootstrap           |
| `git checkout -b`                    | Post branch creation                       |
| `git commit --no-verify`             | Post commit (bypasses husky lint-staged)   |
| `git push --set-upstream`            | Branch publishing                          |
| `git push origin HEAD:<branch>`      | State branch push with rebase-retry        |
| `git status --porcelain`             | Dirty-tree guard before publish            |
| `git ls-remote --heads`              | List remote branches for reconciliation    |

### State Branch Protocol

- State lives on a dedicated orphan branch (`blog-agent-state`)
- Checked out to a scratch directory **outside** the workspace (avoids gitlink issues)
- Pushes use a 5-attempt rebase-retry loop to handle concurrent updates
- First run bootstraps the branch if it doesn't exist remotely

---

## 4. Contentlayer (Build-Time)

### Purpose

The compile gate runs the real Contentlayer build to prove the generated post compiles without breaking the site.

### Integration Method

Executed as a child process: `node node_modules/contentlayer2/bin/cli.cjs build` in an isolated git worktree with symlinked `node_modules`.

### Verification Points

The gate checks more than just exit code 0:

1. Slug appears in `.contentlayer/generated/Blog/_index.json`
2. Compiled body is non-empty
3. `readingTime` is computed
4. Table of contents is present
5. `structuredData` (JSON-LD) is generated

### Side Effect

Captures `app/tag-data.json` from the build output and includes it in the commit to keep tag counts current.

---

## 5. Prettier (Build-Time)

### Purpose

Formats the generated MDX before gates validate it, ensuring the committed bytes match what husky's lint-staged would produce.

### Integration Method

```bash
npx prettier --write <tmp-file>
```

### Error Handling

If Prettier is unavailable, the post is committed unformatted (with a warning). Formatting is a normalisation step, not a correctness gate.

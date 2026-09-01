# Configuration

All configuration is sourced from environment variables, validated at startup by `src/config/env.ts` using Zod. The only module that reads `process.env` is `config/env.ts`; everything downstream receives a validated `Config` object.

## Required Variables

| Variable                 | Example                      | Description                                      |
| ------------------------ | ---------------------------- | ------------------------------------------------ |
| `GEMINI_API_KEY`         | `AIza...`                    | Google Gemini API key                            |
| `GEMINI_TEXT_MODEL`      | `gemini-3.5-flash`           | Text generation model ID. No default on purpose. |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2-preview` | Embedding model for dedup                        |

## Embedding Configuration

These three values form the embedding cache key. Changing any of them invalidates cached vectors, which is correct: comparing vectors across embedding spaces silently disables duplicate detection.

| Variable                     | Default               | Range    | Description           |
| ---------------------------- | --------------------- | -------- | --------------------- |
| `GEMINI_EMBEDDING_TASK_TYPE` | `SEMANTIC_SIMILARITY` | —        | Embedding task type   |
| `GEMINI_EMBEDDING_DIM`       | `1536`                | 128–3072 | Output dimensionality |

## Site Configuration

| Variable              | Default                 | Description                                                                             |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `SITE_URL`            | `https://akashsamui.in` | Blog URL (used in metadata)                                                             |
| `POST_AUTHOR`         | `default`               | Frontmatter `authors` entry                                                             |
| `POST_LAYOUT`         | `PostLayout`            | Layout component. Valid: `PostSimple`, `PostLayout`, `PostBanner`                       |

## Deduplication Thresholds

Provisional values. Run `npm run start -- calibrate` to print the pairwise cosine matrix over the real corpus and calibrate from observed values.

| Variable                | Default | Range | Description                                                        |
| ----------------------- | ------- | ----- | ------------------------------------------------------------------ |
| `DEDUP_REJECT_COSINE`   | `0.86`  | 0–1   | Cosine similarity above which a candidate is rejected as duplicate |
| `DEDUP_ESCALATE_COSINE` | `0.78`  | 0–1   | Cosine similarity above which the LLM judge is invoked             |
| `DEDUP_JACCARD`         | `0.6`   | 0–1   | Jaccard token overlap threshold for rejection                      |

**Constraint:** `DEDUP_ESCALATE_COSINE` must be ≤ `DEDUP_REJECT_COSINE`.

## Article Shape

| Variable           | Default | Range      | Description               |
| ------------------ | ------- | ---------- | ------------------------- |
| `TARGET_WORDS_MIN` | `1400`  | 300–10,000 | Minimum word count target |
| `TARGET_WORDS_MAX` | `2200`  | 300–10,000 | Maximum word count target |

**Constraint:** `TARGET_WORDS_MIN` must be ≤ `TARGET_WORDS_MAX`.

## Publishing Cadence

| Variable                  | Default | Range | Description                        |
| ------------------------- | ------- | ----- | ---------------------------------- |
| `MIN_HOURS_BETWEEN_POSTS` | `20`    | 0–168 | Minimum hours between publications |
| `MAX_OPEN_BOT_PRS`        | `1`     | 1–10  | Maximum concurrent open bot PRs    |

`MAX_OPEN_BOT_PRS=1` is load-bearing: the daily cap limits PR _creation_, not publication. Without it, a merged backlog puts several back-dated posts live at once.

## Reliability

| Variable           | Default   | Range            | Description                        |
| ------------------ | --------- | ---------------- | ---------------------------------- |
| `RETRY_ATTEMPTS`   | `5`       | 1–10             | Max retry attempts per API call    |
| `RETRY_BASE_MS`    | `1000`    | 100–30,000       | Base delay for exponential backoff |
| `RETRY_CAP_MS`     | `60000`   | 1,000–300,000    | Maximum backoff delay              |
| `TEXT_TIMEOUT_MS`  | `120000`  | 5,000–600,000    | Timeout for text generation calls  |
| `RUN_CEILING_MS`   | `1200000` | 60,000–3,600,000 | Maximum total run time (20 min)    |

**Constraint:** `RETRY_BASE_MS` must be ≤ `RETRY_CAP_MS`.

## Link Policy

Grounded search reads arbitrary pages, so outbound links are capped and filtered.

| Variable                 | Default   | Description                      |
| ------------------------ | --------- | -------------------------------- |
| `MAX_EXTERNAL_LINKS`     | `8`       | Maximum external links in a post |
| `EXTERNAL_LINK_DENYLIST` | _(empty)_ | Comma-separated domains to block |

## Logging

| Variable     | Default  | Options                          | Description                      |
| ------------ | -------- | -------------------------------- | -------------------------------- |
| `LOG_LEVEL`  | `info`   | `debug`, `info`, `warn`, `error` | Minimum log level                |
| `LOG_FORMAT` | `pretty` | `json`, `pretty`                 | Output format. Use `json` in CI. |

## Git / GitHub

| Variable            | Default            | Description                                                 |
| ------------------- | ------------------ | ----------------------------------------------------------- |
| `GITHUB_TOKEN`      | _(none)_           | PAT or Actions token. Only needed for `run` (publish step). |
| `GITHUB_REPOSITORY` | _(none)_           | `owner/repo` format                                         |
| `STATE_BRANCH`      | `blog-agent-state` | Branch name for persistent state                            |
| `BRANCH_PREFIX`     | `bot/post-`        | Prefix for post branches                                    |

## Local Development

| Variable  | Default | Description                                          |
| --------- | ------- | ---------------------------------------------------- |
| `DRY_RUN` | `false` | Generate and validate, but never commit or open a PR |
| `OFFLINE` | `false` | Skip network gates (external link checking)          |

## Cross-Field Validation

The following constraints are enforced at config load time:

1. `TARGET_WORDS_MIN ≤ TARGET_WORDS_MAX`
2. `DEDUP_ESCALATE_COSINE ≤ DEDUP_REJECT_COSINE`
3. `RETRY_BASE_MS ≤ RETRY_CAP_MS`

Violation produces a `ConfigError` with a clear message at startup.

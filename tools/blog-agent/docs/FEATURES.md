# Features

## 1. Topic Discovery

### Purpose
Automatically discovers fresh, relevant software engineering topics by surveying recent developments using Google Search grounding through the Gemini API.

### Flow

1. **Research sweep** — A grounded search call queries recent changes in web frameworks, TypeScript/JavaScript, backend, databases, DevOps, cloud, security, and applied AI engineering
2. **Structuring** — A second, ungrounded call converts the free-text research notes into 8-12 structured `TopicCandidate` objects with title, angle, tags, and rationale
3. **Scoring** — Each candidate is scored 0-100 based on: new information carried (highest weight), staying power, suitability for a practitioner audience, and write-ability without proprietary access
4. **Deduplication** — Candidates are checked against the full corpus, published ledger, and current queue (see Feature #2)
5. **Queue insertion** — Surviving candidates are appended to the persistent queue

### Implementation

- **Frontend components:** None (CLI tool)
- **Source files:** `src/research/discover.ts`
- **API calls:** 3 Gemini calls (research, structure, score)
- **State:** Queue entries written to `state/queue.json`

### Data Flow

```
Existing corpus titles → avoidTitles list
Rejected PR titles → rejectedTitles list (negative examples)
Blog's established tags → prompt grounding
↓
Gemini (grounded free-text) → research notes + source URLs from metadata
↓
Gemini (structured JSON) → TopicCandidate[]
↓
Gemini (structured JSON) → score per candidate
↓
Dedup filter → surviving candidates → queue
```

### Edge Cases

- **Grounding unavailable** — Research still works but without Google Search results; the model generates from its training data. The `doctor` command probes this.
- **Empty results** — If the structuring call returns no candidates, the queue is unchanged.
- **Source URL fidelity** — URLs come from the grounding metadata, not from the model's text output. Model-recited URLs are a known hallucination surface.

---

## 2. Three-Tier Duplicate Detection

### Purpose
Prevents the agent from proposing topics that substantially overlap with existing posts, published/PR'd topics, or already-queued candidates.

### Flow

1. **Tier 1: Normalised title match** — Stopwords removed, tokens sorted, case-folded. Zero API cost.
2. **Tier 2: Jaccard token overlap** — Compares token sets of title + tags. Threshold: `DEDUP_JACCARD` (default 0.6). Zero API cost.
3. **Tier 3: Semantic cosine similarity** — Embeds the candidate and compares against cached vectors. Two sub-thresholds:
   - Above `DEDUP_REJECT_COSINE` (0.86) → reject
   - Between `DEDUP_ESCALATE_COSINE` (0.78) and reject → invoke LLM judge
   - Below escalate → accept

### Implementation

- **Source files:** `src/research/dedup.ts`, `src/lib/vector.ts`, `src/lib/slugify.ts`
- **Dependencies:** Embedding cache in `state/embeddings/`
- **API calls:** 1 embedding per candidate (cached vectors for known items), optionally 1 text generation for LLM judge

### Edge Cases

- **Embedding space change** — If the model, task type, or dimensionality changes, cached vectors are invalidated by descriptor mismatch. This is correct: comparing across spaces yields plausible-looking nonsense.
- **Quantisation** — Vectors are stored as int8 + base64 (~12x smaller than float64 JSON). Cosine similarity loss at int8 is negligible relative to the thresholds in use.
- **Dimension mismatch** — `VectorMismatchError` is thrown rather than returning a plausible number, which would silently disable dedup.

---

## 3. Style-Aware Content Generation

### Purpose
Generates blog posts that match the measurable style characteristics of existing posts on the blog, rather than relying on hand-written style descriptions that drift over time.

### Flow

1. **Style metrics computation** — Analyses all published posts to derive: word count distribution, heading structure (H2/H3 counts), paragraph length, code fence ratio, bullet frequency, external link density, recurring section headings, and top tags
2. **Outline generation** — Structured JSON call producing working title, thesis, and 4-12 sections with heading, purpose, and target word count
3. **Draft writing** — Free-text call with style brief, few-shot exemplars (2 recent posts), internal link candidates, and source URLs
4. **Self-critique** — Structured JSON call reviewing the draft for: unsupported claims, invented data, unknown URLs, H1s, unknown components, filler phrasing, and documentation restatement
5. **Refinement** — If blocking issues or a rewrite flag are raised, a refinement pass fixes only the cited issues
6. **Metadata generation** — Structured JSON call deriving title, slug, summary, tags, and image prompt from the finished body

### Implementation

- **Source files:** `src/corpus/style.ts`, `src/stages/draft.ts`, `src/stages/metadata.ts`
- **System prompt rules:**
  - Never emit an H1 (PostLayout renders the title from frontmatter)
  - Only `<Image>`, `<TOCInline>`, and `<BlogNewsletterForm>` components allowed
  - No markdown images or `<video>` tags
  - No invented statistics, benchmarks, version numbers, dates, or quotes
  - Links only from supplied research notes
  - First person, developer voice, no marketing language

### Edge Cases

- **Model wraps output in a code fence** — `stripAccidentalWrapper()` strips both fences and accidentally-emitted frontmatter
- **Empty corpus** — Style metrics still work; the `style` CLI command exits with an error message
- **Metadata after body** — Summary describes what was actually written, not what was planned

---

## 4. Multi-Gate Validation

### Purpose
Validates generated content through 8+ gates before any commit, catching structural defects, security issues, broken links, and build-breaking content.

### Gates

| Gate | Type | Severity | What It Catches |
|------|------|----------|----------------|
| `frontmatter` | Cheap | Error | Schema violations, duplicate slugs, unknown authors, invalid layouts, `draft: true` |
| `date-sanity` | Cheap | Error | Date mismatch (not today's UTC date) |
| `heading-hierarchy` | Cheap | Error/Warn | H1 presence, skipped heading levels, duplicate headings, low H2 count |
| `component-allowlist` | Cheap | Error | Unknown JSX components that would break the production build |
| `secret-scan` | Cheap | Error | Google API keys, GitHub tokens, AWS keys, private keys, Slack tokens, bearer tokens |
| `assets-exist` | Cheap | Error | Missing frontmatter images, missing referenced local assets |
| `internal-links` | Cheap | Error/Warn | Links to non-existent posts, missing trailing slashes |
| `content-quality` | Cheap | Error/Warn | Truncated generation (< 400 words), word count outside target range, long paragraphs, formulaic phrasing, placeholder text |
| `external-links` | Network | Warn | Broken external URLs (HEAD → GET fallback for 405/403/501) |
| `mdx-compiles` | Expensive | Error | Full Contentlayer build in isolated git worktree. Asserts slug is in generated output with non-empty body, readingTime, TOC, and structuredData. |

### Implementation

- **Source files:** `src/gates/run.ts`, `src/gates/types.ts`, `src/gates/content.ts`, `src/gates/structure.ts`, `src/gates/assets.ts`, `src/gates/compile.ts`
- **Execution order:** Cheap gates → network gates → compile gate (only if no prior errors)
- **Offline mode:** Network gates skipped when `OFFLINE=true`

### Edge Cases

- **Compile gate exit-code 0 is insufficient** — Upstream defaults are `onMissingOrIncompatibleData: 'skip-warn'`, so a post with a missing title is silently skipped. The gate asserts the slug is actually present in the generated output.
- **Compile gate isolation** — Runs in a detached git worktree to avoid dirtying the repo or racing a running `next dev`
- **`StackBlogLayout.tsx`** — Exists on disk but is NOT in the layout map in `app/blog/[...slug]/page.tsx`. The gate catches this.

---

## 5. Hero Image Generation

### Purpose
Generates visually consistent hero images for each blog post, maintaining a unified design language across all agent-generated content.

### Style Protocol

All heroes share a fixed visual signature:
- Dark navy and near-black background
- Neon cyan and emerald green accents with occasional warm amber highlights
- Isometric 3D abstract technical shapes
- Subtle circuit traces and connection nodes
- No text, letters, numbers, logos, watermarks, people, faces, or hands

Only the **subject matter** varies per post; the style prefix is constant.

### Implementation

- **Source files:** `src/stages/metadata.ts` (hero generation), `src/pipeline/orchestrator.ts` (image placement)
- **Aspect ratio:** 16:9 (PostLayout renders into `aspect-2/1` container; square defaults get badly centre-cropped)
- **Two generation paths:**
  - Gemini-native models → `generateContent` with `responseModalities: ['IMAGE', 'TEXT']`
  - Imagen models → dedicated `generateImages` endpoint
- **Detection:** Regex `/(?:^|[^a-z])gemini/i` on the model name determines the path

### Data Flow

```
Metadata stage → imagePrompt (subject only)
↓
HERO_STYLE_PREFIX + imagePrompt → full prompt
↓
Gemini Image API → base64 bytes
↓
Written to .artifacts/<runId>/hero.png (dry-run) or committed to public/static/images/blog/<key>/hero.png
```

---

## 6. Write-Ahead Publish Protocol

### Purpose
Ensures crash-safety during the publish operation. A CI runner dying mid-publish must not result in a duplicate post on the next run.

### Protocol

1. Write `inflight` record to `published.json` and push state branch
2. Create git branch, commit post + assets, push branch
3. Open PR via `gh pr create`
4. Update record from `inflight` → `open` with PR number
5. Update cadence timers, pop topic from queue, push state

### Recovery Cases

| Crash Point | Next Run Behaviour |
|------------|-------------------|
| After step 1, before step 2 | Reconcile sees `inflight` with no branch → releases the topic |
| After step 2, before step 3 | Reconcile sees `inflight` with branch but no PR → keeps claim |
| After step 3, before step 4 | Reconcile sees `inflight`, finds matching PR → promotes to `open` |
| After step 4 | Normal: PR is open, state is consistent |

---

## 7. Cadence Control

### Purpose
Limits the agent to at most one published post per day, preventing content bursts and maintaining a natural publishing rhythm.

### Three Independent Conditions

1. **UTC-day key** — No repeat on the same UTC date (jitter-immune, unlike elapsed-time checks)
2. **20-hour floor** — Prevents 23:50 → 00:10 pairs from slipping through the day boundary
3. **One open PR** — Caps concurrent PRs so merging a backlog doesn't burst-publish

### Stall Detection

After 12 consecutive idle runs (~72 hours at 4 runs/day) with no PR opened, the agent logs an error. This catches silent failures where the agent runs but never produces anything.

---

## 8. CLI Commands

### `run`

The main pipeline. Researches topics, and if the cadence gate allows, drafts and opens a PR.

```bash
npm run start -- run [--dry-run] [--research-only] [--force-publish] [--json]
```

### `doctor`

Validates the environment, verifies model IDs against the API, and probes SDK capabilities.

```bash
npm run start -- doctor
```

### `style`

Prints the machine-derived style brief from existing posts. No API calls.

```bash
npm run start -- style
```

### `corpus`

Lists what the agent sees on disk. No API calls.

```bash
npm run start -- corpus [--json]
```

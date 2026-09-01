# Blog Agent Setup and Architecture Flow

## 1. Setup Instructions

The `blog-agent` is designed to be an autonomous pipeline, running either via a scheduled cron job or manual CI triggers.

### Prerequisites
- Node.js `20.11` or higher.
- A Google Gemini API Key.
- A GitHub Personal Access Token (PAT) with `repo` and `workflow` scopes.

### Installation & Configuration

1. **Install Dependencies**:
   ```bash
   cd tools/blog-agent
   npm install
   ```

2. **Environment Variables**:
   Copy the example config and edit it:
   ```bash
   cp .env.example .env
   ```
   **Critical values to set**:
   - `GEMINI_API_KEY`: Your GenAI API key.
   - `GITHUB_TOKEN`: The PAT (Ensure it has `workflow` scope so it can push branches).
   - `GEMINI_TEXT_MODEL`: defaults to `gemini-3.5-flash-lite`.
   - `GEMINI_EMBEDDING_MODEL`: the separate embedding model used for deduplication.

3. **Verify Environment**:
   Run the doctor command to ensure your keys are valid and quotas aren't exhausted:
   ```bash
   npm run start -- doctor
   ```

### Commands

- **`npm run start -- run`**: The primary command. It researches, queues, drafts, validates, and publishes via PR.
- **`npm run start -- run --dry-run`**: Runs the entire pipeline without pushing to GitHub.
- **`npm run start -- style`**: Prints the machine-derived style brief from your existing posts.

---

## 2. Overall Pipeline Flow

The agent runs a strict pipeline defined in `src/pipeline/orchestrator.ts`. The order of operations ensures we don't duplicate work or bypass limits.

### Phase 1: Reconcile (GitHub Sync)
GitHub is the ultimate source of truth. The agent checks its local state against actual GitHub PRs. If the agent crashed midway during its previous run (after committing an `inflight` state but before opening the PR), it reconciles that here.

### Phase 2: Research & Discover (Every Run)
- The agent reads all your existing posts (`data/blog`).
- It contacts Gemini with a **grounded search** prompt to find trending, relevant topics.
- It filters out duplicate ideas using an embedding model (Cosine Similarity) and Jaccard similarity.
- It scores the surviving topics and pushes them onto the local `queue`.

### Phase 3: Cadence Gate
This phase enforces rate limits so the agent doesn't spam your repository.
- Checks `MIN_HOURS_BETWEEN_POSTS` and `MAX_OPEN_BOT_PRS`.
- If a post was already made today, the pipeline exits gracefully.
- If allowed, it pulls the highest-scoring topic from the queue.

### Phase 4: Generation (Drafting)
1. **Compute Style Metrics**: It analyzes your existing posts (e.g., word count, headings, list frequency) to instruct Gemini on how to match your writing style.
2. **Build Outline**: Gemini builds a structured outline.
3. **Write Draft**: Gemini writes the full body of the post.
4. **Critique & Refine**: The agent forces Gemini to critique its own draft. If major issues are found (e.g., "sounds too robotic"), a second refinement pass is executed.
5. **Metadata & Assets**: It generates SEO-friendly frontmatter (title, summary, tags) and calls the Image model to generate a hero image.
6. **Formatting**: Runs Prettier on the Markdown.

### Phase 5: Verification Gates
Before proposing the PR, the draft is subjected to strict tests (`src/gates/run.ts`):
- **Cheap Gates**: Verifies frontmatter schema, date correctness, heading hierarchy (blocks H1s), and scans for leaked secrets.
- **Network Gates**: Checks all external links in the post to ensure they return a `200 OK`.
- **Compile Gate**: Creates an isolated git worktree and runs the site's `contentlayer` build on the draft. If it fails to compile, the PR is rejected!

### Phase 6: Publish
1. **Write Inflight State**: Logs that it is *about* to publish.
2. **Branch & Commit**: Checks out a new branch (`bot/post-<slug>`), commits the MDX and images.
3. **Push & Pull Request**: Pushes to GitHub and opens the PR.
4. **Confirm State**: Logs the PR number in the local state files and pops the item off the topic queue.

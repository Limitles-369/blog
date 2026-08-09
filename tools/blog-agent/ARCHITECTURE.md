# Architecture and Pipeline Flow

This document details the internal architecture, pipeline flow, and state management of `blog-agent`.

## Pipeline Flow

The agent operates in a continuous loop designed to be run repeatedly (e.g., by a cron scheduler). Each run goes through a specific sequence of phases (`src/pipeline/orchestrator.ts`). 

The ordering is critical: Research happens on every invocation, but writing is gated by a cadence check. This ensures the topic queue builds up, and the agent selects the highest-scoring topic rather than the first one it finds.

### 1. Reconcile (GitHub Sync)
GitHub is the source of truth. The agent first reconciles its local state (`published.json`) against GitHub PRs. If a previous run died between writing `inflight` state and opening a PR, the agent uses this phase to avoid getting wedged permanently.

### 2. Research and Queue (Discover)
- **Corpus Read**: Reads existing published and drafted posts.
- **Discover Topics**: Uses Gemini (with grounded search) to find new, relevant topics that avoid existing titles and rejected PRs.
- **Deduplication**: Checks new candidates against the existing corpus and the current queue using embeddings (cosine similarity) and Jaccard similarity.
- **Scoring**: Ranks the deduplicated topics and adds them to the queue.

### 3. Cadence Gate
Checks if the agent is allowed to publish based on the configured rate limits (e.g., `MIN_HOURS_BETWEEN_POSTS`, `MAX_OPEN_BOT_PRS`). 
- If not allowed (or if no items are in the queue), the pipeline exits early.
- If allowed, it selects the highest-scored topic from the queue.

### 4. Generate (Drafting)
This is the core content generation phase.
- **Compute Style Metrics**: Analyzes existing posts to inform the style guidelines.
- **Build Outline**: Gemini builds a structured outline for the topic.
- **Write Draft**: Generates the full post body based on the outline.
- **Critique & Refine**: The agent critiques its own draft. If blocking issues or rewrite flags are raised, it refines the draft in a secondary pass.
- **Metadata**: Generates SEO-friendly titles, summaries, tags, and image prompts.
- **Hero Image (Optional)**: If enabled, calls the Gemini Image model to generate a hero image for the post.

### 5. Gates (Validation)
Before anything is committed, the output bytes are subjected to multiple strict validation gates (`src/gates/run.ts`):
- **Cheap Gates**: Frontmatter checks, date checks, heading hierarchy, component allowlists, secret scanning, and word count validation.
- **Network Gates**: Validates external links to ensure no 404s.
- **Compile Gate**: The final MDX is passed through a local Contentlayer build to ensure it will not break the main site's build process.

If any gate fails, the pipeline aborts the publish phase.

### 6. Write-Ahead State & Publish
- **Inflight State**: An `inflight` record is written locally *before* branching or committing, protecting against agent crashes mid-publish.
- **Publish**: A new git branch is created, the formatted MDX and assets (hero images) are committed, and a Pull Request is opened via the GitHub API.
- **Commit State**: The `inflight` record is transitioned to `open`, the queue is popped, and cadence timers are reset.

## State Management

State is persisted locally (or in a separate git branch, `blog-agent-state`, depending on configuration). This provides memory across ephemeral CI runner lifecycles.

State is structured into three main stores (`src/state/schema.ts`):
- **Queue**: A list of scored `TopicCandidate`s waiting to be written.
- **Published**: A ledger of all posts the agent has created (`inflight`, `open`, `merged`, `rejected`), preventing duplicate work.
- **Cadence**: Timestamps tracking the last run, last published post, and last PR opened.
- **Control**: A kill-switch configuration allowing human operators to remotely disable the agent without changing code.

## Subsystems

- **`gemini/`**: Encapsulates all calls to the `@google/genai` SDK, managing retries, rate-limits (Quota `429`s), and structured output schemas.
- **`mdx/`**: Utilities for parsing and serializing `gray-matter` Markdown.
- **`publish/`**: Interfaces with Git and the GitHub API for branching, committing, PR creation, and reconciliation.

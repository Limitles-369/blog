# Blog Agent

An autonomous research-and-draft pipeline that researches topics, writes image-free MDX blog posts, and opens pull requests on a daily cadence. It uses Gemini AI for content generation and metadata extraction.

## Overview

`blog-agent` is designed to run automatically (e.g., via a cron job or CI/CD workflow), maintain a queue of potential topics, research them, draft an image-free MDX blog post, and open a Pull Request against the main repository.

## Installation

Ensure you are using Node.js version 20.11 or greater.

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in the required values.

```bash
cp .env.example .env
```

### Essential Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `GEMINI_TEXT_MODEL`: ID for the text generation model (e.g., `gemini-1.5-pro`).
- `GEMINI_EMBEDDING_MODEL`: ID for the embeddings model.
- `GITHUB_TOKEN` & `GITHUB_REPOSITORY`: For PR creation and state reconciliation.

For full configuration options, refer to `src/config/env.ts` or `.env.example`.

## Commands

The agent exposes several CLI commands via `npm run start`:

- **`npm run start -- run`**
  The main pipeline command. Researches topics, scores them, and if the cadence gate allows, drafts and opens a PR for a new post.
  _Options:_
  - `--dry-run`: Generate and validate, but never commit or open a PR.
  - `--research-only`: Refresh the topic queue and stop.
  - `--force-publish`: Bypass the once-per-day cadence gate.
- **`npm run start -- doctor`**
  Validates the environment, verifies model IDs, and probes SDK capabilities (useful for checking API quotas and capabilities).

- **`npm run start -- style`**
  Prints a machine-derived style brief based on existing posts in `data/blog/*.mdx`.

- **`npm run start -- corpus`**
  Summarizes the posts currently on disk.

## Development

- `npm run typecheck`: Run TypeScript compiler in type-checking mode.
- `npm run test`: Run the Vitest test suite.
- `npm run lint`: Run ESLint.
- `npm run verify`: Run typecheck and tests.

## Architecture & Flow

For a detailed breakdown of the pipeline stages, state management, and architectural decisions, please read [ARCHITECTURE.md](ARCHITECTURE.md).

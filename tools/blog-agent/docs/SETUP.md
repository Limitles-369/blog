# Setup

## Requirements

- **Node.js** ≥ 20.11 (required for native fetch, crypto, and ES module support)
- **Git** (used for worktree creation in the compile gate and for publish operations)
- **GitHub CLI (`gh`)** (required for PR creation and reconciliation; only needed for the `run` command)
- **Google Gemini API Key** with access to text, embedding, and image generation models
- **Parent blog repository** — the agent must be run from within the `tools/blog-agent/` directory of the blog repo (it walks upward to find `contentlayer.config.ts`)

## Installation

### 1. Clone the blog repository

```bash
git clone https://github.com/<your-username>/blog.git
cd blog
```

### 2. Install site dependencies

The agent's compile gate uses the site's `node_modules` (symlinked into a throwaway worktree), so the parent project must be installed:

```bash
corepack enable
yarn install --immutable
```

### 3. Install agent dependencies

```bash
cd tools/blog-agent
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```env
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_TEXT_MODEL=gemini-3.5-flash
GEMINI_IMAGE_MODEL=imagen-4.0-generate-001
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
```

> **Important:** Model IDs have no defaults on purpose. Gemini model names change faster than this repo will be maintained, and a stale default baked into source is worse than an explicit failure.

### 5. Verify the setup

```bash
npm run doctor
```

This command:
- Validates all environment variables
- Resolves the repo root path
- Lists available models from the API
- Verifies each configured model ID exists
- Makes a test text generation call
- Makes a test embedding call
- Probes whether grounded search works
- Probes whether grounding + JSON can be combined in one call

Expected output on success:

```
Environment
  ok    config parsed
  ok    repo root /path/to/blog

Models
  ok    models.list() returned N model(s)
  ok    GEMINI_TEXT_MODEL=gemini-3.5-flash
  ok    GEMINI_IMAGE_MODEL=imagen-4.0-generate-001
  ok    GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview

Round trips
  ok    text generation — 42 tokens
  ok    embeddings — 1536 dims

Capability probe
  ok    grounded search — 3 source(s)
  ok    grounding + JSON in one call — NOT supported

All checks passed.
```

### 6. Run a dry-run test

```bash
npm run start -- run --dry-run
```

This executes the full pipeline (research, draft, gates) but never commits or opens a PR. Generated output is written to `.artifacts/`.

## GitHub Actions Setup

For automated runs, configure the following in your GitHub repository:

### Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GITHUB_TOKEN` | Auto | Provided by Actions automatically |

### Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_TEXT_MODEL` | `gemini-3.5-flash` | Text generation model ID |
| `GEMINI_IMAGE_MODEL` | `imagen-4.0-generate-001` | Image generation model ID |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2-preview` | Embedding model ID |

### Repository Settings

Enable **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** — without this, `gh pr create` returns a 403.

If using a Personal Access Token instead of the default `GITHUB_TOKEN`, ensure it has the `workflow` scope (required to push changes that include modifications to `.github/workflows/`).

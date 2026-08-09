# Blog Agent — Documentation

> Autonomous research-and-draft pipeline that discovers topics, writes blog posts, and opens pull requests on a daily cadence using Google Gemini AI.

## 📚 Documentation Index

| Document | Description |
|----------|-------------|
| [README.md](README.md) | This file — project overview and documentation index |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Pipeline flow, state machine, data flow diagrams |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Directory layout and module responsibilities |
| [SETUP.md](SETUP.md) | Installation, environment setup, first-run guide |
| [CONFIGURATION.md](CONFIGURATION.md) | All environment variables and tuning knobs |
| [FEATURES.md](FEATURES.md) | Detailed feature documentation with data flows |
| [INTEGRATIONS.md](INTEGRATIONS.md) | Google Gemini AI and GitHub API integration details |
| [SECURITY.md](SECURITY.md) | Security analysis, implemented controls, and recommendations |
| [TESTING.md](TESTING.md) | Test suite, coverage, and testing strategy |
| [DEPLOYMENT.md](DEPLOYMENT.md) | GitHub Actions workflow and CI/CD configuration |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | Contributing guide for developers joining the project |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and resolution steps |
| [CODEBASE_AUDIT.md](CODEBASE_AUDIT.md) | Technical debt, risks, and improvement recommendations |

---

## Project Overview

**Blog Agent** is a fully autonomous content pipeline that runs on a cron schedule (every 6 hours via GitHub Actions), researches current software engineering topics using Google Search grounding, drafts blog posts in MDX format, validates them through a multi-layer gate system, and opens pull requests for human review.

### Purpose

Maintains a consistent publishing cadence on a personal developer blog ([akashsamui.in](https://akashsamui.in)) without requiring the author to manually research and write every post. The agent handles the mechanical parts — topic discovery, drafting, formatting, validation — while the human retains editorial control through PR review.

### Key Capabilities

- **Topic Discovery** — Uses Gemini with Google Search grounding to find recent, relevant software engineering developments
- **Three-Tier Deduplication** — Normalised title matching, Jaccard token overlap, and semantic cosine similarity prevent duplicate topics
- **Style-Aware Drafting** — Analyses existing posts to derive measurable style metrics (word counts, heading structure, paragraph length) and generates content matching the blog's voice
- **Self-Critique Loop** — Reviews its own draft for hallucinated claims, invented URLs, and filler phrasing before refinement
- **Multi-Gate Validation** — 8+ validation gates including frontmatter schema, heading hierarchy, component allowlists, secret scanning, link checking, and a full Contentlayer compile
- **Hero Image Generation** — Generates consistent-style hero images using Imagen/Gemini image models
- **Write-Ahead State** — Crash-safe publish protocol that prevents duplicate posts even if a CI runner dies mid-operation
- **GitHub-Authoritative Reconciliation** — Syncs local state against GitHub PRs on every run to recover from partial failures

### Current Status

**v0.1.0** — Operational. Running on a 4×/day cron schedule via GitHub Actions. The agent successfully discovers topics, drafts posts, and opens PRs.

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | ≥20.11 |
| Language | TypeScript | 5.7.2 |
| Execution | tsx (direct TS execution) | 4.19.2 |
| AI Provider | Google Gemini (`@google/genai`) | ^1.0.0 |
| Validation | Zod | 3.23.8 |
| MDX Parsing | gray-matter | 4.0.3 |
| Testing | Vitest | 2.1.8 |
| CI/CD | GitHub Actions | — |
| Blog Framework | Next.js + Contentlayer (parent repo) | — |

---

## Quick Start

```bash
# Navigate to the agent directory
cd tools/blog-agent

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and model IDs

# Verify everything works
npm run doctor

# Run the full pipeline (dry run)
npm run start -- run --dry-run

# Run tests
npm run test
```

See [SETUP.md](SETUP.md) for detailed installation and [CONFIGURATION.md](CONFIGURATION.md) for all environment variables.

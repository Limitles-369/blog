# Troubleshooting

## Installation Issues

### `Could not locate the blog repo root`

**Problem:**

```
Error: Could not locate the blog repo root above /path/to/blog-agent (looked for contentlayer.config.ts)
```

**Cause:** The agent walks upward from its directory looking for `contentlayer.config.ts` as the root marker. It was not found within 10 parent directories.

**Solution:** Ensure the agent is located at `tools/blog-agent/` within the blog repository that contains `contentlayer.config.ts` at its root.

**Verification:**

```bash
ls ../../contentlayer.config.ts
```

---

### `Invalid environment: GEMINI_API_KEY`

**Problem:**

```
ConfigError: Invalid environment:
  GEMINI_API_KEY: String must contain at least 1 character(s)
```

**Cause:** Required environment variables are missing or empty.

**Solution:**

```bash
cp .env.example .env
# Edit .env and fill in GEMINI_API_KEY, GEMINI_TEXT_MODEL, etc.
```

**Verification:**

```bash
npm run doctor
```

---

### `TARGET_WORDS_MIN must not exceed TARGET_WORDS_MAX`

**Problem:** Cross-field validation failure at startup.

**Cause:** Invalid combination of values in `.env`.

**Solution:** Check and correct the related values. All cross-field constraints:

- `TARGET_WORDS_MIN ≤ TARGET_WORDS_MAX`
- `DEDUP_ESCALATE_COSINE ≤ DEDUP_REJECT_COSINE`
- `RETRY_BASE_MS ≤ RETRY_CAP_MS`

---

## Model / API Issues

### `GEMINI_TEXT_MODEL=xxx — not in models.list()`

**Problem:** The configured model ID does not exist in the API.

**Cause:** Model names change frequently. A previously valid ID may have been retired.

**Solution:**

```bash
npm run doctor
```

The command prints all available models. Update `.env` with a valid model ID.

---

### `429: RESOURCE_EXHAUSTED` (Quota Exhausted)

**Problem:**

```
ERROR  text generation failed  err=429: You exceeded your current quota
```

**Cause:** Daily API quota is exhausted. This is NOT a rate limit — it will not clear within any reasonable backoff window.

**Solution:** Wait for quota to reset (usually midnight Pacific Time). The agent correctly distinguishes quota exhaustion from rate limits and fails fast rather than burning retry attempts.

**Verification:** Check your quota at [Google AI Studio](https://ai.google.dev/).

---

### `429 with RetryInfo` (Rate Limit)

**Problem:** Transient 429 with a `retryDelay` in the response.

**Cause:** Per-minute rate limit hit. The agent handles this automatically.

**Solution:** No action needed. The agent retries with the server-specified delay.

---

### `model returned no text (the model used N reasoning token(s) and produced no visible output)`

**Problem:** A thinking model consumed its entire token budget on internal reasoning.

**Cause:** `maxOutputTokens` was too low for a thinking model, or `thinkingBudget` was not set.

**Solution:** Either increase `maxOutputTokens` or set `thinkingBudget: 0` for the affected stage.

---

## State Issues

### `StateCorruptError: published.json at /path is not valid JSON`

**Problem:** A state file is corrupted.

**Cause:** Likely a process killed during write (though the atomic write pattern should prevent this) or manual editing error.

**Solution:**

1. Check out the state branch: `git fetch origin blog-agent-state && git worktree add /tmp/state blog-agent-state`
2. Inspect and fix the corrupted file
3. Commit and push the fix

**Important:** The agent deliberately refuses to treat a corrupt file as empty, because silently resetting `published.json` would republish every topic it contains.

---

### Agent appears stalled / not publishing

**Problem:** The agent runs but never produces PRs.

**Possible causes and checks:**

1. **Kill switch enabled:**

   ```bash
   cat state/control.json  # Check enabled: true
   ```

2. **Inflight entry blocking:**

   ```bash
   cat state/published.json | jq '.entries[] | select(.state == "inflight")'
   ```

   Fix: The next non-dry-run should reconcile it. If not, manually set the entry's state to `rejected`.

3. **Open PR blocking:**

   ```bash
   cat state/published.json | jq '.entries[] | select(.state == "open")'
   ```

   Fix: Merge or close the open PR.

4. **Queue empty:**

   ```bash
   cat state/queue.json | jq '.entries | length'
   ```

   Fix: Run with `--research-only` to populate the queue.

5. **Cadence gate:**
   ```bash
   cat state/cadence.json
   ```
   Check `lastPublishedDay` — if it's today, the agent won't publish again until tomorrow.

---

### `refusing to run: post or image paths have uncommitted changes`

**Problem:** The agent refuses to start because `data/blog/` or `public/static/images/blog/` have uncommitted changes.

**Cause:** Local modifications in the post or image directories.

**Solution:**

```bash
git status data/blog public/static/images/blog
# Either commit, stash, or discard the changes
git stash  # or git checkout -- data/blog public/static/images/blog
```

---

## Build / Compile Gate Issues

### `contentlayer build failed`

**Problem:** The compile gate reports a build failure.

**Cause:** The generated MDX is invalid, references undefined variables, or triggers a contentlayer error.

**Solution:** Check the `.artifacts/<runId>/<slug>.mdx` file for issues. Common problems:

- Unknown JSX components (should be caught by the component allowlist gate first)
- Invalid frontmatter (should be caught by the frontmatter gate first)
- YAML parsing errors

---

### `Build exited 0 but "slug" is absent from the generated output`

**Problem:** Contentlayer built successfully but silently skipped the post.

**Cause:** The post had a structural issue that contentlayer skips with a warning (e.g., missing required field).

**Solution:** The compile gate is designed to catch exactly this case. Check the generated MDX for missing or malformed fields.

---

## GitHub / Publish Issues

### `gh pr create was refused`

**Problem:**

```
Error: gh pr create was refused. Enable Settings -> Actions -> General ->
"Allow GitHub Actions to create and approve pull requests"
```

**Cause:** The default `GITHUB_TOKEN` lacks PR creation permissions.

**Solution:** Go to your repository **Settings → Actions → General** and enable "Allow GitHub Actions to create and approve pull requests".

**Alternative:** Use a fine-grained Personal Access Token with `pull-requests: write` scope.

---

### `refusing to allow a Personal Access Token to create or update workflow`

**Problem:** Git push fails when the commit includes changes to `.github/workflows/`.

**Cause:** The PAT does not have the `workflow` scope.

**Solution:** Regenerate the PAT with the `workflow` scope enabled.

---

### `Could not list bot PRs via gh`

**Problem:** Reconciliation fails because `gh pr list` is unreachable.

**Cause:** `gh` is not authenticated, or the network is unavailable.

**Solution:** The agent deliberately refuses to continue rather than assuming "nothing is open" (which would duplicate posts). Ensure `gh` is authenticated:

```bash
gh auth status
```

---

## Debugging Tips

### Enable debug logging

```bash
LOG_LEVEL=debug npm run start -- run --dry-run
```

### Inspect a generated post without publishing

```bash
npm run start -- run --dry-run
ls .artifacts/
```

### Check what the agent sees on disk

```bash
npm run start -- corpus
npm run start -- style
```

### Verify model access and capabilities

```bash
npm run doctor
```

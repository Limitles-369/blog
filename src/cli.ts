import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Root CLI entrypoint bridge for blog-agent.
 * Enables: npx tsx src/cli.ts <command> [options]
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const agentCliPath = path.join(__dirname, '..', 'tools', 'blog-agent', 'src', 'cli.ts')

// Import and run the blog-agent CLI
import(agentCliPath).catch((err) => {
  console.error('[cli] Error running blog-agent CLI:', err)
  process.exit(1)
})

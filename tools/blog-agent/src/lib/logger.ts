/**
 * Structured logger with no dependencies.
 *
 * Two output modes: `json` for Actions, where lines get grepped and parsed,
 * and `pretty` for a local terminal. Everything goes to stderr so stdout
 * stays clean for machine-readable CLI output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const COLOR: Record<LogLevel, string> = {
  debug: '\x1b[2m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
}
const RESET = '\x1b[0m'

export type Fields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: Fields): void
  info(msg: string, fields?: Fields): void
  warn(msg: string, fields?: Fields): void
  error(msg: string, fields?: Fields): void
  /** Derive a logger that stamps every line with extra fields. */
  child(fields: Fields): Logger
  /** Time an operation and log its duration and outcome. */
  timed<T>(msg: string, fn: () => Promise<T>, fields?: Fields): Promise<T>
}

export interface LoggerOptions {
  level: LogLevel
  format: 'json' | 'pretty'
  base?: Fields
  /** Injected for tests. */
  write?: (line: string) => void
  now?: () => number
}

/**
 * Redact anything that looks like a credential. The agent logs prompts and
 * API error bodies, both of which can echo a key back.
 */
const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /gh[pousr]_[0-9A-Za-z]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[0-9A-Za-z._-]{20,}/gi,
]

export function redact(value: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), value)
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth limit]'
  if (typeof value === 'string') return redact(value)
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message) }
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Fields).map(([k, v]) => [k, scrub(v, depth + 1)])
    )
  }
  return value
}

export function createLogger(opts: LoggerOptions): Logger {
  const write = opts.write ?? ((line: string) => process.stderr.write(line + '\n'))
  const now = opts.now ?? Date.now
  const base = opts.base ?? {}
  const threshold = RANK[opts.level]

  function emit(level: LogLevel, msg: string, fields?: Fields): void {
    if (RANK[level] < threshold) return
    const merged = scrub({ ...base, ...fields }) as Fields
    const message = redact(msg)
    const ts = new Date(now()).toISOString()

    if (opts.format === 'json') {
      write(JSON.stringify({ ts, level, msg: message, ...merged }))
      return
    }
    const tail = Object.entries(merged)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
    const tag = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`
    write(`${ts} ${tag} ${message}${tail ? '  ' + tail : ''}`)
  }

  const self: Logger = {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ ...opts, base: { ...base, ...fields }, write, now }),
    async timed(msg, fn, fields) {
      const started = now()
      self.debug(`${msg} started`, fields)
      try {
        const result = await fn()
        self.info(`${msg} ok`, { ...fields, ms: now() - started })
        return result
      } catch (err) {
        self.error(`${msg} failed`, { ...fields, ms: now() - started, err })
        throw err
      }
    },
  }
  return self
}

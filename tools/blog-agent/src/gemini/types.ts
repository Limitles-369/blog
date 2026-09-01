import type { z } from 'zod'

/**
 * The model surface the pipeline depends on.
 *
 * Every stage is written against this interface, never against the SDK. That
 * keeps the SDK's exact shape — which is the part of this design I could not
 * verify against live docs — confined to client.ts, and it makes every stage
 * unit-testable with a plain object instead of a network mock.
 */

export interface GroundingSource {
  uri: string
  title?: string
}

export interface TextResult {
  text: string
  sources: GroundingSource[]
  /** Search queries the model actually issued, when grounding was on. */
  queries: string[]
  usage: TokenUsage
}

export interface JsonResult<T> {
  value: T
  usage: TokenUsage
}

export interface TokenUsage {
  input: number
  output: number
  /**
   * Internal reasoning tokens. Billed and charged against maxOutputTokens, but
   * NOT part of the visible response — so a budget that looks generous can be
   * consumed entirely by thinking, yielding an empty completion.
   */
  thoughts: number
  total: number
}

export interface EmbedResult {
  vectors: number[][]
  usage: TokenUsage
}

export interface GenerateTextOptions {
  prompt: string
  system?: string
  /** Enable Google Search grounding. */
  grounded?: boolean
  temperature?: number
  maxOutputTokens?: number
  label: string
}

export interface GenerateJsonOptions<T> {
  prompt: string
  system?: string
  schema: z.ZodType<T>
  /**
   * Enable Google Search grounding alongside constrained decoding.
   *
   * Historically the API rejected this combination, which is why the discovery
   * stage is split into a grounded free-text call followed by an ungrounded
   * structuring call. Exposed so `doctor` can probe whether that restriction
   * still holds; production stages should not rely on it until it does.
   */
  grounded?: boolean
  /**
   * JSON Schema handed to the API for constrained decoding. Supplied
   * separately because the API accepts an OpenAPI subset rather than
   * arbitrary JSON Schema, so it cannot always be derived from the Zod type.
   */
  responseSchema: Record<string, unknown>
  temperature?: number
  maxOutputTokens?: number
  label: string
}

export interface EmbedOptions {
  texts: string[]
  taskType: string
  outputDimensionality: number
  label: string
}

export interface GeminiClient {
  generateText(opts: GenerateTextOptions): Promise<TextResult>
  generateJson<T>(opts: GenerateJsonOptions<T>): Promise<JsonResult<T>>
  embed(opts: EmbedOptions): Promise<EmbedResult>
  /** Used by `doctor` to verify configured model IDs exist. */
  listModels(): Promise<string[]>
  /** Cumulative usage across every call, for the per-run budget ledger. */
  totalUsage(): TokenUsage
  /** Number of provider requests, including retries and fallback calls. */
  requestCount(): number
}

export class ModelResponseError extends Error {
  override readonly name = 'ModelResponseError'
  constructor(
    message: string,
    readonly raw?: string
  ) {
    super(message)
  }
}

export const zeroUsage = (): TokenUsage => ({ input: 0, output: 0, thoughts: 0, total: 0 })

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    thoughts: a.thoughts + b.thoughts,
    total: a.total + b.total,
  }
}

import { GoogleGenAI } from '@google/genai'

import type { Config } from '../config/env.js'
import type { Logger } from '../lib/logger.js'
import { withRetry, withTimeout } from '../lib/retry.js'
import {
  addUsage,
  ModelResponseError,
  zeroUsage,
  type EmbedOptions,
  type EmbedResult,
  type GeminiClient,
  type GenerateImageOptions,
  type GenerateJsonOptions,
  type GenerateTextOptions,
  type GroundingSource,
  type ImageResult,
  type JsonResult,
  type TextResult,
  type TokenUsage,
} from './types.js'

/**
 * Concrete Gemini client.
 *
 * VERIFY AT IMPLEMENTATION TIME. The network was unavailable when this was
 * written, so the SDK call shapes below are from recall, not from live docs.
 * `npm run doctor` exercises every one of them against the real API and is
 * the intended way to confirm them. The specific things to check:
 *
 *   1. `ai.models.generateContent({model, contents, config})` and that
 *      `res.text` is a getter property rather than a method.
 *   2. Grounding as `config.tools: [{googleSearch: {}}]`, with metadata at
 *      `res.candidates[0].groundingMetadata.groundingChunks[].web.uri`.
 *   3. Whether grounding may be combined with `responseSchema` in ONE call.
 *      Recall says no. The pipeline therefore never asks for both — the
 *      discover stage runs grounded free-text, then a second ungrounded call
 *      structures it. If the restriction has lifted, the two can be merged,
 *      but the split is correct either way.
 *   4. `ai.models.embedContent` shape and `res.embeddings[].values`.
 *   5. Image generation: whether the configured model wants
 *      `generateImages()` or `generateContent()` with responseModalities.
 *      Both paths are implemented; `IMAGE_VIA_GENERATE_CONTENT` selects.
 */

const IMAGE_VIA_GENERATE_CONTENT = /(?:^|[^a-z])gemini/i

export function createGeminiClient(config: Config, logger: Logger): GeminiClient {
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY })
  let running: TokenUsage = zeroUsage()

  const log = logger.child({ component: 'gemini' })

  function track(raw: unknown): TokenUsage {
    const m = (raw ?? {}) as Record<string, number | undefined>
    const usage: TokenUsage = {
      input: m['promptTokenCount'] ?? 0,
      output: m['candidatesTokenCount'] ?? 0,
      total: m['totalTokenCount'] ?? 0,
    }
    running = addUsage(running, usage)
    return usage
  }

  /** Wrap every API call in the same timeout + retry + logging envelope. */
  async function call<T>(label: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    return withRetry(() => withTimeout(() => fn(), timeoutMs, label), {
      attempts: config.RETRY_ATTEMPTS,
      baseMs: config.RETRY_BASE_MS,
      capMs: config.RETRY_CAP_MS,
      label,
      logger: log,
    })
  }

  function extractSources(res: unknown): { sources: GroundingSource[]; queries: string[] } {
    const candidate = (res as { candidates?: unknown[] })?.candidates?.[0] as
      | Record<string, unknown>
      | undefined
    const meta = candidate?.['groundingMetadata'] as Record<string, unknown> | undefined
    if (!meta) return { sources: [], queries: [] }

    const chunks = (meta['groundingChunks'] as unknown[] | undefined) ?? []
    const seen = new Set<string>()
    const sources: GroundingSource[] = []
    for (const chunk of chunks) {
      const web = (chunk as Record<string, unknown>)?.['web'] as
        | Record<string, string>
        | undefined
      const uri = web?.['uri']
      if (typeof uri === 'string' && !seen.has(uri)) {
        seen.add(uri)
        sources.push(web?.['title'] ? { uri, title: web['title'] } : { uri })
      }
    }
    const queries = ((meta['webSearchQueries'] as unknown[] | undefined) ?? []).filter(
      (q): q is string => typeof q === 'string'
    )
    return { sources, queries }
  }

  function textOf(res: unknown, label: string): string {
    const direct = (res as { text?: unknown })?.text
    if (typeof direct === 'string' && direct.length > 0) return direct

    // Fall back to walking parts, in case `.text` is absent or a method.
    const parts =
      ((res as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]?.content
        ?.parts ?? []) as Record<string, unknown>[]
    const joined = parts
      .map((p) => (typeof p['text'] === 'string' ? (p['text'] as string) : ''))
      .join('')
    if (joined.length > 0) return joined

    throw new ModelResponseError(`${label}: model returned no text`, JSON.stringify(res).slice(0, 800))
  }

  return {
    async generateText(opts: GenerateTextOptions): Promise<TextResult> {
      const res = await call(opts.label, config.TEXT_TIMEOUT_MS, () =>
        ai.models.generateContent({
          model: config.GEMINI_TEXT_MODEL,
          contents: opts.prompt,
          config: {
            ...(opts.system ? { systemInstruction: opts.system } : {}),
            ...(opts.grounded ? { tools: [{ googleSearch: {} }] } : {}),
            temperature: opts.temperature ?? 0.7,
            ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
          },
        })
      )
      const { sources, queries } = extractSources(res)
      const usage = track((res as Record<string, unknown>)['usageMetadata'])
      log.debug('generateText', {
        label: opts.label,
        grounded: Boolean(opts.grounded),
        sources: sources.length,
        ...usage,
      })
      return { text: textOf(res, opts.label), sources, queries, usage }
    },

    async generateJson<T>(opts: GenerateJsonOptions<T>): Promise<JsonResult<T>> {
      const res = await call(opts.label, config.TEXT_TIMEOUT_MS, () =>
        ai.models.generateContent({
          model: config.GEMINI_TEXT_MODEL,
          contents: opts.prompt,
          config: {
            ...(opts.system ? { systemInstruction: opts.system } : {}),
            responseMimeType: 'application/json',
            responseSchema: opts.responseSchema,
            temperature: opts.temperature ?? 0.3,
            ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
          },
        })
      )
      const usage = track((res as Record<string, unknown>)['usageMetadata'])
      const raw = textOf(res, opts.label)

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Constrained decoding should make this unreachable; a truncated
        // response from hitting maxOutputTokens is the realistic cause.
        throw new ModelResponseError(`${opts.label}: response was not valid JSON`, raw.slice(0, 800))
      }

      const checked = opts.schema.safeParse(parsed)
      if (!checked.success) {
        const detail = checked.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')
        throw new ModelResponseError(`${opts.label}: schema mismatch — ${detail}`, raw.slice(0, 800))
      }
      log.debug('generateJson', { label: opts.label, ...usage })
      return { value: checked.data, usage }
    },

    async embed(opts: EmbedOptions): Promise<EmbedResult> {
      const res = await call(opts.label, config.TEXT_TIMEOUT_MS, () =>
        ai.models.embedContent({
          model: config.GEMINI_EMBEDDING_MODEL,
          contents: opts.texts,
          config: {
            taskType: opts.taskType,
            outputDimensionality: opts.outputDimensionality,
          },
        })
      )
      const raw = ((res as { embeddings?: unknown[] })?.embeddings ?? []) as {
        values?: number[]
      }[]
      const vectors = raw.map((e) => e.values ?? [])
      if (vectors.length !== opts.texts.length) {
        throw new ModelResponseError(
          `${opts.label}: expected ${opts.texts.length} embeddings, got ${vectors.length}`
        )
      }
      for (const [i, v] of vectors.entries()) {
        if (v.length === 0) throw new ModelResponseError(`${opts.label}: embedding ${i} was empty`)
      }
      const usage = track((res as Record<string, unknown>)['usageMetadata'])
      return { vectors, usage }
    },

    async generateImage(opts: GenerateImageOptions): Promise<ImageResult> {
      const model = config.GEMINI_IMAGE_MODEL

      // Gemini-native image models emit images through generateContent;
      // Imagen models use the dedicated generateImages endpoint.
      if (IMAGE_VIA_GENERATE_CONTENT.test(model)) {
        const res = await call(opts.label, config.IMAGE_TIMEOUT_MS, () =>
          ai.models.generateContent({
            model,
            contents: opts.prompt,
            config: { responseModalities: ['IMAGE', 'TEXT'] },
          })
        )
        const parts =
          ((res as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]
            ?.content?.parts ?? []) as Record<string, unknown>[]
        for (const part of parts) {
          const inline = part['inlineData'] as { data?: string; mimeType?: string } | undefined
          if (inline?.data) {
            const usage = track((res as Record<string, unknown>)['usageMetadata'])
            return {
              bytes: Buffer.from(inline.data, 'base64'),
              mimeType: inline.mimeType ?? 'image/png',
              usage,
            }
          }
        }
        throw new ModelResponseError(`${opts.label}: no inline image data in response`)
      }

      const res = await call(opts.label, config.IMAGE_TIMEOUT_MS, () =>
        ai.models.generateImages({
          model,
          prompt: opts.prompt,
          config: { numberOfImages: 1, aspectRatio: opts.aspectRatio },
        })
      )
      const first = (
        (res as { generatedImages?: { image?: { imageBytes?: string } }[] })?.generatedImages ?? []
      )[0]
      const data = first?.image?.imageBytes
      if (!data) throw new ModelResponseError(`${opts.label}: no image bytes in response`)
      const usage = track((res as Record<string, unknown>)['usageMetadata'])
      return { bytes: Buffer.from(data, 'base64'), mimeType: 'image/png', usage }
    },

    async listModels(): Promise<string[]> {
      const out: string[] = []
      const pager = await call('models.list', config.TEXT_TIMEOUT_MS, () => ai.models.list())
      for await (const m of pager as AsyncIterable<{ name?: string }>) {
        if (m.name) out.push(m.name.replace(/^models\//, ''))
      }
      return out
    },

    totalUsage: () => running,
  }
}

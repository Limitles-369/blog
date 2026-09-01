import { z } from 'zod'

import type { Config } from '../config/env.js'
import type { GeminiClient } from '../gemini/types.js'
import type { Logger } from '../lib/logger.js'

/**
 * Metadata is derived from the finished body, not the plan, so the summary
 * describes what was actually written. It feeds OG and Twitter descriptions,
 * the BlogPosting JSON-LD, and the RSS <description>, so a weak summary is a
 * silent SEO hole rather than a visible defect.
 */

export const postMetadata = z.object({
  title: z.string().min(10).max(110),
  slug: z
    .string()
    .min(3)
    .max(70)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  summary: z.string().min(80).max(280),
  tags: z.array(z.string().min(1)).min(1).max(8),
  category: z.enum([
    'software-architecture',
    'system-design',
    'programming',
    'ai-engineering',
    'developer-tools',
    'cloud-infrastructure',
    'engineering-culture',
  ]),
})
export type PostMetadata = z.infer<typeof postMetadata>

const METADATA_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    category: { type: 'string' },
  },
  required: ['title', 'slug', 'summary', 'tags', 'category'],
}

export async function generateMetadata(input: {
  client: GeminiClient
  config: Config
  body: string
  workingTitle: string
  knownTags: readonly string[]
  category: string
  logger: Logger
}): Promise<PostMetadata> {
  const res = await input.client.generateJson({
    prompt: [
      'Produce publication metadata for this finished article.',
      '',
      `Working title was: ${input.workingTitle}`,
      '',
      'Requirements:',
      '- title: specific and accurate to the article. Under 60 characters reads best in search results.',
      '- slug: lowercase kebab-case derived from the title, no stop-word padding, under 70 chars.',
      '- summary: 120-200 characters. This is the search-result and RSS description, so it must',
      '  stand alone and state what the reader gets.',
      "- tags: 1-6, lowercase. Reuse the blog's established tags where they genuinely fit.",
      `- category: must be exactly ${input.category}; do not change it.`,
      '',
      input.knownTags.length > 0 ? `Established tags: ${input.knownTags.join(', ')}` : '',
      '',
      '--- ARTICLE ---',
      input.body,
    ]
      .filter(Boolean)
      .join('\n'),
    schema: postMetadata,
    responseSchema: METADATA_SCHEMA,
    label: 'metadata.generate',
    maxOutputTokens: 2048,
  })
  return res.value
}

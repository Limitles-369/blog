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
  imagePrompt: z.string().min(30).max(600),
})
export type PostMetadata = z.infer<typeof postMetadata>

const METADATA_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    imagePrompt: { type: 'string' },
  },
  required: ['title', 'slug', 'summary', 'tags', 'imagePrompt'],
}

/**
 * The visual signature of the existing heroes: dark navy ground, neon cyan and
 * green with occasional amber, isometric abstract tech illustration, wide
 * framing, and no text at all. Held constant so every post's hero looks like it
 * came from the same site — only the subject varies.
 *
 * "No text" is stated emphatically because image models render mangled
 * pseudo-text, which is the most obvious tell of an AI-generated hero.
 */
export const HERO_STYLE_PREFIX = [
  'Wide 2:1 landscape digital illustration for a software engineering blog header.',
  'Style: dark navy and near-black background, glowing neon cyan and emerald green accents,',
  'occasional warm amber highlight, isometric 3D abstract technical shapes, subtle circuit',
  'traces and connection nodes, soft volumetric glow, clean and modern, high detail.',
  'ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO LOGOS, NO WATERMARKS anywhere in the image.',
  'No people, no faces, no hands.',
  'Subject:',
].join(' ')

export async function generateMetadata(input: {
  client: GeminiClient
  config: Config
  body: string
  workingTitle: string
  knownTags: readonly string[]
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
      '- tags: 1-6, lowercase. Reuse the blog\'s established tags where they genuinely fit.',
      '- imagePrompt: describe ONLY the subject matter for a hero illustration — an abstract',
      '  visual metaphor for the topic. Do not describe style, colours, or composition; those',
      '  are supplied separately. Never request text in the image.',
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

export interface HeroImage {
  bytes: Buffer
  mimeType: string
}

/**
 * Generates the hero at 2:1.
 *
 * PostLayout renders images[0] into an `aspect-2/1` container with
 * `object-cover`, and the same file feeds the `summary_large_image` Twitter
 * card, so a square default gets badly centre-cropped in both places.
 */
export async function generateHero(input: {
  client: GeminiClient
  subject: string
  logger: Logger
}): Promise<HeroImage> {
  const res = await input.client.generateImage({
    prompt: `${HERO_STYLE_PREFIX} ${input.subject}`,
    aspectRatio: '2:1',
    label: 'image.hero',
  })
  input.logger.info('hero image generated', { bytes: res.bytes.length, mime: res.mimeType })
  return { bytes: res.bytes, mimeType: res.mimeType }
}

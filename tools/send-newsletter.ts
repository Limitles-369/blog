import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { Resend } from 'resend'

export interface NewsletterPayload {
  title: string
  summary: string
  tags: string[]
  slug: string
  date: string
  url: string
  heroImage?: string
}

export function formatNewsletterHtml(payload: NewsletterPayload): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(payload.title)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 32px; overflow: hidden;">
    <div style="font-size: 12px; text-transform: uppercase; tracking: 2px; color: #818cf8; font-weight: 700; margin-bottom: 12px;">New Blog Post Published</div>
    <h1 style="font-size: 26px; line-height: 1.3; color: #ffffff; margin: 0 0 16px 0;">${escapeHtml(payload.title)}</h1>
    
    <div style="font-size: 14px; color: #94a3b8; margin-bottom: 20px;">
      Published on ${escapeHtml(payload.date)} • Tags: ${payload.tags.map((t) => `#${escapeHtml(t)}`).join(', ')}
    </div>

    <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-bottom: 28px;">
      ${escapeHtml(payload.summary)}
    </p>

    <a href="${payload.url}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #a855f7); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Read Full Article &rarr;
    </a>

    <hr style="border: none; border-top: 1px solid #334155; margin: 32px 0 20px 0;" />
    
    <div style="font-size: 12px; color: #64748b; text-align: center;">
      You received this because you subscribed to the personal tech blog newsletter.
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function findLatestMergedPost(repoRoot = process.cwd()): Promise<NewsletterPayload | null> {
  const blogDir = path.join(repoRoot, 'data', 'blog')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blog.akashsamui.dev'

  try {
    const files = await fs.readdir(blogDir)
    const mdxFiles = files.filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    if (mdxFiles.length === 0) return null

    // Stat files to pick the most recently modified/created post
    let latestFile = mdxFiles[0]!
    let latestMtime = 0

    for (const file of mdxFiles) {
      const filePath = path.join(blogDir, file)
      const stat = await fs.stat(filePath)
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs
        latestFile = file
      }
    }

    const content = await fs.readFile(path.join(blogDir, latestFile), 'utf8')
    const parsed = matter(content)
    const slug = latestFile.replace(/\.mdx?$/, '')

    return {
      title: parsed.data.title || slug,
      summary: parsed.data.summary || '',
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
      slug,
      date: parsed.data.date || new Date().toISOString().split('T')[0],
      url: `${siteUrl}/blog/${slug}`,
      heroImage: Array.isArray(parsed.data.images) ? parsed.data.images[0] : undefined,
    }
  } catch (err) {
    console.error('[send-newsletter] Error reading latest blog post:', err)
    return null
  }
}

export async function sendNewsletterDigest(): Promise<boolean> {
  console.log('==================================================')
  console.log('APEX AUTOMATION // RESEND NEWSLETTER ENGINE')
  console.log('==================================================')

  const post = await findLatestMergedPost()
  if (!post) {
    console.log('[send-newsletter] No blog posts found to send.')
    return false
  }

  console.log(`[send-newsletter] Preparing digest for: "${post.title}" (${post.url})`)

  const apiKey = process.env.RESEND_API_KEY
  const recipients = process.env.NEWSLETTER_SUBSCRIBERS
    ? process.env.NEWSLETTER_SUBSCRIBERS.split(',').map((s) => s.trim())
    : ['subscribers@akashsamui.dev']

  if (!apiKey) {
    console.warn('[send-newsletter] RESEND_API_KEY is not configured. Running in DRY-RUN mode.')
    console.log('[send-newsletter] Generated Email HTML Preview:\n')
    console.log(formatNewsletterHtml(post).slice(0, 500) + '...\n')
    return true
  }

  const resend = new Resend(apiKey)
  const html = formatNewsletterHtml(post)

  try {
    const response = await resend.emails.send({
      from: 'Akash Samui Blog <newsletter@akashsamui.dev>',
      to: recipients,
      subject: `New Post: ${post.title}`,
      html,
    })

    console.log('[send-newsletter] Newsletter sent successfully via Resend API:', response)
    return true
  } catch (err) {
    console.error('[send-newsletter] Failed to send newsletter email via Resend API:', err)
    // Return true to avoid breaking main CI workflow build
    return true
  }
}

if (process.argv[1]?.endsWith('send-newsletter.ts') || process.argv[1]?.endsWith('send-newsletter.js')) {
  sendNewsletterDigest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[send-newsletter] Fatal error:', err)
      process.exit(0) // Safe logging without breaking main pipeline
    })
}

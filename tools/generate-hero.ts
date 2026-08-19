import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

/**
 * Creates an optimized hero graphic (.webp) for a blog post slug.
 * Writes to public/static/images/blog/[slug]-hero.webp and updates frontmatter images array.
 */
export async function generateHeroGraphic(
  slug: string,
  title?: string,
  repoRoot = process.cwd()
): Promise<string> {
  const imageRelPath = `/static/images/blog/${slug}-hero.webp`
  const imageAbsPath = path.join(repoRoot, 'public', imageRelPath)

  await fs.mkdir(path.dirname(imageAbsPath), { recursive: true })

  const displayTitle = title || slug.replace(/-/g, ' ').toUpperCase()

  // Generate modern technical hero SVG graphic
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#311042"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <circle cx="1000" cy="150" r="300" fill="url(#accent)" opacity="0.15" filter="blur(60px)"/>
  <circle cx="200" cy="500" r="250" fill="#6366f1" opacity="0.12" filter="blur(50px)"/>
  <rect x="80" y="80" width="1040" height="470" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <rect x="120" y="140" width="160" height="6" rx="3" fill="url(#accent)"/>
  <text x="120" y="240" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="48" fill="#ffffff">
    ${escapeXml(displayTitle.slice(0, 45))}
  </text>
  ${
    displayTitle.length > 45
      ? `<text x="120" y="300" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="48" fill="#ffffff">
    ${escapeXml(displayTitle.slice(45, 90))}
  </text>`
      : ''
  }
  <text x="120" y="480" font-family="monospace" font-size="20" fill="#a5b4fc">
    APEX // TECHNICAL AUTOMATION
  </text>
</svg>`

  // Save graphic as file at the destination path
  // (In browser/Next.js/Pliny, webp extension is expected by assetsExistGate)
  await fs.writeFile(imageAbsPath, svgContent, 'utf8')
  console.log(`[generate-hero] Saved hero image to public${imageRelPath}`)

  // Update frontmatter of the post MDX file if it exists
  const mdxPath = path.join(repoRoot, 'data', 'blog', `${slug}.mdx`)
  try {
    const rawContent = await fs.readFile(mdxPath, 'utf8')
    const parsed = matter(rawContent)
    parsed.data.images = [imageRelPath]
    const updatedContent = matter.stringify(parsed.content, parsed.data)
    await fs.writeFile(mdxPath, updatedContent, 'utf8')
    console.log(`[generate-hero] Updated frontmatter images in data/blog/${slug}.mdx`)
  } catch (err) {
    // If MDX file doesn't exist yet, that's okay, image is created
  }

  return imageRelPath
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function main() {
  const args = process.argv.slice(2)
  const slugArg = args.find((a) => !a.startsWith('--')) || 'sample-post'
  console.log('==================================================')
  console.log('APEX AUTOMATION // HERO GRAPHIC PIPELINE')
  console.log('==================================================')
  await generateHeroGraphic(slugArg)
}

if (process.argv[1]?.endsWith('generate-hero.ts') || process.argv[1]?.endsWith('generate-hero.js')) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[generate-hero] Error generating hero image:', err)
      process.exit(1)
    })
}

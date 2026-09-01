import { describe, expect, it } from 'vitest'

import { mediaFreeGate } from '../src/gates/structure.js'
import type { GateContext } from '../src/gates/types.js'

function context(over: Partial<GateContext> = {}): GateContext {
  return {
    source: '',
    body: '## A section\n\nUseful text.',
    slug: 'test-post',
    frontmatter: {},
    existingSlugs: new Set(),
    knownAuthors: new Set(['default']),
    publicDir: '/tmp',
    bodyLineOffset: 2,
    ...over,
  }
}

describe('mediaFreeGate', () => {
  it('accepts ordinary image-free MDX', async () => {
    expect(await mediaFreeGate.run(context())).toEqual([])
  })

  it('rejects image frontmatter and markdown media', async () => {
    const findings = await mediaFreeGate.run(
      context({
        frontmatter: { images: { url: '/static/example.png' } },
        body: '## A section\n\n![diagram](/static/example.png)',
      })
    )
    expect(findings).toHaveLength(2)
    expect(findings.every((finding) => finding.severity === 'error')).toBe(true)
  })

  it('rejects HTML media tags', async () => {
    const findings = await mediaFreeGate.run(
      context({ body: '## A section\n\n<video src="demo.mp4" />' })
    )
    expect(findings[0]?.line).toBe(5)
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = async (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('editorial layouts keep explicit light and dark theme classes', async () => {
  const hero = await source('app/HeroMain.tsx')
  const cards = await source('layouts/StackBlogLayout.tsx')
  assert.match(hero, /dark:/)
  assert.match(cards, /dark:/)
})

test('category navigation is present and generated content remains media-free', async () => {
  const categories = await source('app/categories/page.tsx')
  const gate = await source('tools/blog-agent/src/gates/structure.ts')
  assert.match(categories, /categories\/\$\{category\.id\}/)
  assert.match(gate, /mediaFreeGate/)
})

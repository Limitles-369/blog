export const categories = [
  {
    id: 'software-architecture',
    name: 'Software Architecture',
    description: 'Boundaries, patterns, and decisions that keep systems maintainable.',
    accent: '#f97316',
  },
  {
    id: 'system-design',
    name: 'System Design',
    description: 'Designing reliable, scalable services and data systems.',
    accent: '#38bdf8',
  },
  {
    id: 'programming',
    name: 'Programming',
    description: 'Languages, runtime behavior, and practical implementation craft.',
    accent: '#a78bfa',
  },
  {
    id: 'ai-engineering',
    name: 'AI Engineering',
    description: 'Building useful, reliable software with modern AI systems.',
    accent: '#34d399',
  },
  {
    id: 'developer-tools',
    name: 'Developer Tools',
    description: 'Tools and workflows that improve the engineering feedback loop.',
    accent: '#facc15',
  },
  {
    id: 'cloud-infrastructure',
    name: 'Cloud Infrastructure',
    description: 'Containers, deployment, observability, and production operations.',
    accent: '#60a5fa',
  },
  {
    id: 'engineering-culture',
    name: 'Engineering Culture',
    description: 'The habits and practices behind healthy technical teams.',
    accent: '#fb7185',
  },
] as const

export type CategoryId = (typeof categories)[number]['id']
export const categoryIds = categories.map((category) => category.id) as unknown as CategoryId[]
export const categoryById = (id: string) => categories.find((category) => category.id === id)

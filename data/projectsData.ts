export interface Project {
  /** Project name as it should read on the card. */
  title: string
  /** One or two sentences: what it does and what was hard about it. */
  description: string
  /** Tech actually used — rendered as chips. Keep to 3-5 entries. */
  stack?: string[]
  /** Live deployment. Omit if there isn't one. */
  href?: string
  /** Source repository. Omit if private. */
  repo?: string
  /** 16:9 screenshot under /public/static/images/projects/. */
  imgSrc?: string
}

/**
 * Real projects only. This page is usually a recruiter's first click, so a
 * placeholder here costs more than an empty state — the page renders a short
 * "in progress" message when this array is empty.
 */
const projectsData: Project[] = []

export default projectsData

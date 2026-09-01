# Technical Report

This report documents the current state of the project based on a read-only codebase analysis. No source code, configuration, routing, styles, data files, generated content, or application behavior were intentionally changed during the analysis.a

Verification note: TypeScript passed via:

```sh
./node_modules/.bin/tsc --noEmit --composite false --incremental false --pretty false
```

`yarn` was not available in the shell, so the local TypeScript binary was used instead.

## 1. Project Overview

This is a **Next.js App Router personal developer blog and portfolio**.

| Area           | Details                                                                |
| -------------- | ---------------------------------------------------------------------- |
| Framework      | Next.js`15.2.8`                                                      |
| UI             | React`19.2.4`, Tailwind CSS `4.1.x`                                |
| Language       | TypeScript and JavaScript                                              |
| Content        | MDX through`contentlayer2` / `next-contentlayer2`                  |
| Blog utilities | `pliny`, `reading-time`, `github-slugger`, remark/rehype plugins |
| Styling        | Tailwind v4 CSS-first config in`css/tailwind.css`                    |
| Theme          | `next-themes` dark/light/system mode                                 |
| Search         | Pliny KBar local search                                                |
| Comments       | Pliny comments with Giscus config                                      |
| Newsletter     | Pliny newsletter API, configured for Buttondown                        |

The project appears to be based on **Tailwind Next.js Starter Blog**, then partially customized into an **Akash Samui personal site** with blog cards, portfolio metadata, custom header/footer, and orange editorial styling.

Main purpose:

- Publish MDX blog posts.
- Render author/about content.
- List and filter posts by tags.
- Show project cards.
- Support comments, local search, newsletter subscription, RSS, sitemap, and robots metadata.

## 2. Codebase Structure

Important directories:

| Path               | Purpose                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `app/`           | Next.js App Router pages, layout, metadata helpers, API routes, sitemap, robots      |
| `components/`    | Shared UI: header, footer, link/image wrappers, search, theme switch, MDX components |
| `layouts/`       | Blog post layouts, list layouts, author layout                                       |
| `data/`          | Site metadata, nav links, projects data, MDX blog posts, author MDX, bibliography    |
| `css/`           | Tailwind global stylesheet and Prism code highlighting                               |
| `public/static/` | Favicons and local images                                                            |
| `scripts/`       | Postbuild RSS generation                                                             |
| `faq/`           | Starter-template documentation pages, not app routes                                 |
| `.contentlayer/` | Generated Contentlayer output, ignored by git                                        |
| `.next/`         | Next build/dev output, ignored by git                                                |

Main entry points:

| Route/File                              | Behavior                                                     |
| --------------------------------------- | ------------------------------------------------------------ |
| `app/layout.tsx`                      | Global HTML shell, fonts, metadata, providers, header/footer |
| `app/page.tsx`                        | Home route; loads all blogs and renders`HeroMain`          |
| `app/blog/page.tsx`                   | Blog index using`StackBlogLayout`                          |
| `app/blog/page/[page]/page.tsx`       | Paginated blog pages                                         |
| `app/blog/[...slug]/page.tsx`         | Dynamic MDX blog post route                                  |
| `app/tags/page.tsx`                   | Tag index                                                    |
| `app/tags/[tag]/page.tsx`             | Tag archive                                                  |
| `app/tags/[tag]/page/[page]/page.tsx` | Paginated tag archive                                        |
| `app/about/page.tsx`                  | Author MDX rendered through`AuthorLayout`                  |
| `app/projects/page.tsx`               | Project cards from`data/projectsData.ts`                   |
| `app/api/newsletter/route.ts`         | Pliny newsletter API wrapper                                 |
| `app/sitemap.ts`, `app/robots.ts`   | SEO metadata routes                                          |

Routing is entirely App Router based. Content routes are statically generated from Contentlayer's `allBlogs` and `allAuthors`.

## 3. Features And Functionality

Implemented features:

| Feature           | How It Works                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| MDX blog posts    | `contentlayer.config.ts` reads `data/blog/**/*.mdx`, computes slug/path/toc/reading time, and exposes `allBlogs`       |
| Blog detail pages | `app/blog/[...slug]/page.tsx` finds a post by slug, selects `PostLayout`, `PostSimple`, or `PostBanner`, renders MDX |
| Blog listing      | `app/blog/page.tsx` and paginated routes render cards through `StackBlogLayout`                                          |
| Tag pages         | Tag counts are generated into`app/tag-data.json`; pages filter posts by slugified tags                                     |
| Search            | KBar search uses generated`public/search.json` from Contentlayer success hook                                              |
| Theme switcher    | `next-themes` provider plus `ThemeSwitch` dropdown                                                                       |
| Comments          | `Comments` lazily loads Pliny comments/Giscus after button click                                                           |
| Newsletter API    | `app/api/newsletter/route.ts` delegates GET/POST to Pliny's `NewsletterAPI`                                              |
| Sitemap/robots    | Uses`siteMetadata.siteUrl` and Contentlayer blog list                                                                      |
| RSS               | `scripts/postbuild.mjs` calls `scripts/rss.mjs` after build                                                              |
| Project page      | Renders hardcoded project data through`Card`                                                                               |
| About page        | Renders`data/authors/default.mdx`                                                                                          |

Incomplete, placeholder, duplicate, or unused-looking areas:

| Area                               | Finding                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `README.md`                      | Still mostly starter-template documentation, not project-specific            |
| `data/projectsData.ts`           | Placeholder projects: Google search engine and The Time Machine              |
| `app/projects/page.tsx`          | Placeholder copy: "Showcase your projects with a hero image"                 |
| `app/Main.tsx`                   | Older starter homepage component, not used by current`app/page.tsx`        |
| `components/LayoutWrapper.tsx`   | Appears unused; root layout now handles header/footer                        |
| `layouts/ListLayout.tsx`         | Older listing layout, not currently used by blog route                       |
| `layouts/ListLayoutWithTags.tsx` | Used by tag pages, while blog uses`StackBlogLayout`; visual systems differ |
| Sample MDX                         | Many posts are still starter/demo posts                                      |
| `.env.example`                   | Includes multiple newsletter providers though current config uses Buttondown |

## 4. UI/UX And Frontend Analysis

Current UI direction is a clean personal/editorial blog, not the "Indoor Kids Playzone" design described in `AGENTS.md`. The active implementation uses neutral surfaces, orange accents, rounded cards, a pill header, and dark mode support.

Strengths:

- Homepage blog cards are polished, responsive, and image-led.
- Header is compact and modern.
- Dark mode is supported across main surfaces.
- Blog cards use stable image aspect ratios.
- Main content is mostly accessible through semantic routes and headings.
- Mobile menu uses Headless UI `Dialog`, which is a good accessibility base.

Issues and improvement areas:

| Severity | Issue                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Medium   | Visual inconsistency between newer`HeroMain` / `StackBlogLayout` and older pages like Projects, Tags, About, and Legal            |
| Medium   | Blog listing copy says "Find all tools that will help you grow" in`layouts/StackBlogLayout.tsx`, which does not match articles/blog |
| Medium   | Header CTA says "Newsletter" but links to`/blog` in `components/Header.tsx`                                                       |
| Medium   | Homepage newsletter CTA has no actual newsletter form; buttons only link to blog/about                                                |
| Medium   | Projects page still looks like starter content and does not match the custom homepage polish                                          |
| Low      | Decorative comments in JSX contain non-ASCII divider characters; harmless, but inconsistent with minimal code style                   |
| Low      | Some buttons use arrow text characters instead of icon components; acceptable, but less consistent                                    |
| Low      | Mobile nav does not include search/theme labels inside the drawer; controls remain only in header                                     |

## 5. Backend / API / Data Flow

There is no custom database layer. The app is mostly static/content-driven.

Data flow:

1. MDX files live in `data/blog` and `data/authors`.
2. `contentlayer.config.ts` defines schemas and computed fields.
3. Generated `contentlayer/generated` exports are imported by App Router pages.
4. Pages pass normalized `CoreContent` into layouts/components.
5. Contentlayer success hook writes `app/tag-data.json` and `public/search.json`.
6. Postbuild script writes RSS XML to `public` or `out`.

External integrations:

| Integration           | Config Source                                  |
| --------------------- | ---------------------------------------------- |
| Umami analytics       | `NEXT_UMAMI_ID`                              |
| Giscus comments       | `NEXT_PUBLIC_GISCUS_*` variables             |
| Buttondown newsletter | `BUTTONDOWN_API_KEY`                         |
| KBar search           | Generated local`search.json`                 |
| Remote image          | `picsum.photos` allowed in Next image config |

Required/current environment variables:

| Variable                             | Used For                                           |
| ------------------------------------ | -------------------------------------------------- |
| `NEXT_UMAMI_ID`                    | Optional Umami analytics website ID                |
| `NEXT_PUBLIC_GISCUS_REPO`          | Giscus repo                                        |
| `NEXT_PUBLIC_GISCUS_REPOSITORY_ID` | Giscus repository ID                               |
| `NEXT_PUBLIC_GISCUS_CATEGORY`      | Giscus category                                    |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID`   | Giscus category ID                                 |
| `BUTTONDOWN_API_KEY`               | Newsletter subscription API                        |
| `BASE_PATH`                        | Optional deployment base path                      |
| `EXPORT`                           | Enables static export                              |
| `UNOPTIMIZED`                      | Disables Next image optimization for static export |
| `ANALYZE`                          | Enables bundle analyzer                            |

## 6. Configuration And Environment

Key config notes:

| File                  | Notes                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `package.json`      | Scripts are simple, but`lint` runs with `--fix` by default                                    |
| `next.config.js`    | Contentlayer plus bundle analyzer plugins, CSP/security headers, SVG loader, trailing slash       |
| `tsconfig.json`     | `strict: false`, but `strictNullChecks: true`; includes generated Contentlayer and Next types |
| `eslint.config.mjs` | Flat config, but disables several important TypeScript rules                                      |
| `css/tailwind.css`  | Tailwind v4 CSS-first theme, custom orange primary palette and animations                         |
| `postcss.config.js` | Tailwind v4 PostCSS plugin                                                                        |
| `.env.example`      | Broad starter env list, not narrowed to current selected providers                                |
| `.gitignore`        | Correctly ignores`.next`, `.contentlayer`, generated feed/search output, env files            |

Risky or unnecessary config:

- CSP in `next.config.js` is broad: `'unsafe-eval'`, `'unsafe-inline'`, `img-src *`, `connect-src *`.
- `package.json` lint script auto-fixes, which is risky for analysis/CI because it mutates files.
- `tsconfig.json` has `composite: true`; a plain `tsc --noEmit --incremental false` fails unless `composite` is overridden.
- `siteMetadata.siteRepo` is empty, but post pages generate "View on GitHub" links from it.

## 7. Performance Analysis

Potential performance issues:

| Area                 | Concern                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client components    | `StackBlogLayout`, `Header`, `MobileNav`, `ThemeSwitch`, comments, and scroll buttons all run client-side; acceptable, but blog filtering/search makes the entire listing interactive |
| Images               | Blog cards use optimized`next/image`; good. `img-src *` allows any source at CSP level, broader than Next image remote patterns                                                           |
| Search index         | `public/search.json` includes all core blog content; fine at current scale, but grows with posts                                                                                            |
| MDX plugins          | Many remark/rehype plugins increase build complexity, not runtime cost                                                                                                                        |
| Bundle               | Pliny, Headless UI, body-scroll-lock, KBar, comments/search/theme add client JS                                                                                                               |
| Duplicate card logic | Blog card implementation is duplicated in`HeroMain` and `StackBlogLayout`                                                                                                                 |
| Fonts                | Three Google font families are loaded in`app/layout.tsx`; only one appears primary in CSS                                                                                                   |

Safe improvements:

- Extract a shared blog-card component.
- Reduce loaded fonts to the families actually used.
- Keep tag/search filtering, but consider server-rendered tag pages as primary and client filtering as progressive enhancement.
- Add real bundle analysis only when needed via `ANALYZE=true`.

## 8. Security And Best Practices

Good:

- Security headers exist.
- `X-Frame-Options: DENY`, `nosniff`, HSTS, and referrer policy are configured.
- Secrets are referenced through environment variables, not hardcoded.
- External links use `noopener noreferrer` in `components/Link.tsx`.

Risks:

| Severity | Finding                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | CSP is too permissive:`script-src` allows unsafe inline/eval, `connect-src *`, `img-src *`                                                                           |
| High     | Newsletter route is marked`force-static` in `app/api/newsletter/route.ts`; POST subscription behavior should be verified because newsletter APIs are dynamic by nature |
| Medium   | Giscus public env vars may be undefined while comments provider remains enabled, leading to broken comment UI                                                              |
| Medium   | `siteRepo` is empty, causing post "View on GitHub" links to be invalid                                                                                                   |
| Medium   | `.env.example` lists many providers, which can confuse deployment setup                                                                                                  |
| Low      | `Permissions-Policy` disables geolocation globally; fine for this app                                                                                                    |

## 9. Bugs, Warnings, And Technical Debt

### Critical

None found from static inspection and TypeScript check.

### High

| Issue                                    | Evidence                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Newsletter API may be incorrectly static | `app/api/newsletter/route.ts` uses `dynamic = 'force-static'` while exporting POST |
| Overly broad CSP                         | `next.config.js` allows unsafe script behavior and all connect/image origins         |

### Medium

| Issue                                | Evidence                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Broken GitHub edit links             | `siteMetadata.siteRepo` is empty; `PostLayout` builds edit links from it                        |
| Placeholder project data             | `data/projectsData.ts`                                                                            |
| Placeholder projects page copy       | `app/projects/page.tsx`                                                                           |
| Header Newsletter CTA points to blog | `components/Header.tsx`                                                                           |
| Blog copy mismatch                   | `layouts/StackBlogLayout.tsx` references "tools"                                                  |
| Duplicate BlogCard code              | `app/HeroMain.tsx` and `layouts/StackBlogLayout.tsx` have separate similar card implementations |
| Unused older components/layouts      | `app/Main.tsx`, `components/LayoutWrapper.tsx`, `layouts/ListLayout.tsx` appear inactive      |
| README stale                         | Still documents the starter template heavily                                                        |

### Low

| Issue                                                           | Evidence                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Lint script mutates by default                                  | `package.json`                                                       |
| Several ESLint safety rules disabled                            | `eslint.config.mjs` disables unused vars and other TypeScript checks |
| Inconsistent route visual design                                | New homepage/blog cards vs older About/Projects/Tags/legal layouts     |
| `last updated` dates on legal pages change every render/build | `app/privacy/page.tsx`, `app/terms/page.tsx`                       |

## 10. Recommended Improvements

### Safe Quick Fixes

- Replace placeholder projects with real portfolio projects.
- Fix Projects page subtitle.
- Change header "Newsletter" CTA target to a real newsletter anchor/page/form, or rename it.
- Fix `StackBlogLayout` helper copy from "tools" to article/blog language.
- Set `siteMetadata.siteRepo` or remove "View on GitHub".
- Narrow `.env.example` to current selected providers or clearly mark optional groups.
- Add a non-mutating script like `"typecheck": "tsc --noEmit --composite false --incremental false"`.

### Medium Improvements

- Extract a shared `BlogCard` component.
- Consolidate list layouts or document which one is canonical.
- Update README to describe this actual Akash Samui site.
- Replace starter/sample MDX posts with real content or mark them as drafts.
- Add a real newsletter form to the homepage CTA.
- Review and tighten CSP by provider actually used.
- Make comments render only when required Giscus config exists.

### Larger Refactoring Tasks

- Create a unified design system for all pages, not only home/blog.
- Split app shell/client pieces so only interactive controls hydrate.
- Decide whether this is primarily a portfolio, blog, or hybrid, then align navigation, homepage CTA, projects, and metadata.
- Add basic tests or smoke checks for route generation, Contentlayer content, and API handler behavior.

### Optional Future Enhancements

- Add Open Graph images per post/project.
- Add project detail pages.
- Add contact form or dedicated contact page.
- Add sitemap routes for privacy/terms/about if desired.
- Add analytics consent or privacy note if analytics is enabled.

## 11. Final Summary

Overall health: **good foundation, partially customized, with visible starter-template residue**.

What works well:

- Next App Router structure is clean.
- Contentlayer/MDX pipeline is solid.
- Blog routes, tags, sitemap, RSS, search, theme switching, and comments are all wired.
- TypeScript passed after using a non-writing local check.
- The newer homepage/blog card UI is noticeably more polished than the starter baseline.

What should be fixed first:

1. Fix the high-risk config/API items: newsletter `force-static`, broad CSP, missing Giscus/env assumptions.
2. Remove or replace placeholder content in projects, README, and sample posts.
3. Align visual design across Projects/About/Tags/legal pages.
4. Extract duplicate blog-card logic before the UI diverges further.

No tracked source files were modified as part of creating this report.

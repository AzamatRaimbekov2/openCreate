// apps/web/src/entry-server.tsx
// Build-time SSR entry for the landing prerender (spec §1: "Landing route
// prerendered at build for SEO; full meta/OG tags" — the explicit mitigation
// the user approved for choosing SPA + separate API over Next.js). It is NOT
// part of the browser bundle: scripts/prerender.mjs imports the `vite build
// --ssr` output of this file after the client build and injects the rendered
// '/' HTML into dist/index.html, so crawlers get the hero/claims/price copy
// instead of an empty #root. The SPA then boots on top via main.tsx.
import { renderToString } from 'react-dom/server'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
// i18n side-effect init: landing copy comes from translation keys. Outside a
// browser there is no stored language, so the prerender is the EN default —
// matching index.html's lang="en" and the meta tags.
import 'shared/config/i18n'

// Renders the given route to static HTML. Memory history instead of browser
// history — there is no window during the build. router.load() resolves the
// matched routes' code-split components before the synchronous renderToString.
// During renderToString no effects run and TanStack Query never fetches, so
// the session resolves to signed-out and CTAs point at /login — exactly what
// an anonymous crawler should see.
export async function render(url: string): Promise<string> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}

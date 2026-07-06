// apps/web/scripts/prerender.mjs
// Post-build prerender step (spec §1: landing prerendered at build for SEO).
// Runs AFTER `vite build` (client → dist/) and `vite build --ssr` (server →
// dist/server/): renders '/' with the SSR bundle and injects the HTML into
// dist/index.html's #root, then removes the temporary server bundle. Fails the
// build loudly if the landing copy is missing — a silently empty prerender
// would regress the whole SEO story without anything else noticing.
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The SSR pass must never touch the network. better-auth's client resolves a
// relative '/api/auth' base URL outside a browser, and its session store may
// fire a get-session fetch when the landing route reads the session — in Node
// that relative fetch would reject (unparseable URL) as an unhandled
// rejection. Answer every request with a signed-out `null` instead: the
// prerendered page must be exactly what an anonymous crawler sees anyway.
globalThis.fetch = async () =>
  new Response('null', { status: 200, headers: { 'content-type': 'application/json' } })

const { render } = await import(
  pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href
)
const appHtml = await render('/')

// Guardrails: the hero headline and claims MUST be present in the output —
// this is the acceptance criterion of the prerender itself. (The headline's
// '&' is HTML-escaped by renderToString, so assert on unambiguous substrings.)
const requiredCopy = ['Pay pennies, not plans.', 'Credits never expire', 'Honest price comparison']
for (const copy of requiredCopy) {
  if (!appHtml.includes(copy)) {
    throw new Error(`prerender: landing copy missing from rendered HTML: "${copy}"`)
  }
}

const indexPath = resolve(root, 'dist/index.html')
const template = await readFile(indexPath, 'utf8')
const marker = '<div id="root"></div>'
if (!template.includes(marker)) {
  throw new Error('prerender: could not find the #root marker in dist/index.html')
}
// Replacement via callback: the rendered HTML may contain `$` sequences that
// String.replace would otherwise expand as substitution patterns.
await writeFile(
  indexPath,
  template.replace(marker, () => `<div id="root">${appHtml}</div>`),
)
// The server bundle is an intermediate artifact — never ship it.
await rm(resolve(root, 'dist/server'), { recursive: true, force: true })
console.log('prerender: injected / into dist/index.html')

// Pins the spec's SEO requirement: the '/' landing route must be renderable to
// static HTML at build time (spec §1 "Landing route prerendered at build for
// SEO" — the explicit mitigation for choosing SPA over Next.js). Without this,
// crawlers receive an empty <div id="root"></div>. scripts/prerender.mjs uses
// the same render() during `pnpm build`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from './entry-server'

beforeEach(() => {
  // The SSR pass must never hit the network: better-auth's session store may
  // fire a get-session fetch — answer it with a signed-out `null`.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('entry-server (landing prerender)', () => {
  it('renders the landing hero, claims and price table headline into static HTML', async () => {
    const html = await render('/')
    // Hero headline ("Create images & video. Pay pennies, not plans." — the &
    // is HTML-escaped by renderToString, so assert on the unambiguous part)
    expect(html).toContain('Pay pennies, not plans.')
    // The three approved claims travel together in the hero claims line
    expect(html).toContain('Credits never expire')
    // Price-comparison section — the honest-pricing story crawlers must see
    expect(html).toContain('Honest price comparison')
  })
})

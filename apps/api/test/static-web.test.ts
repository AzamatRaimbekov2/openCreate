// Production single-origin serving (ops hardening Task 5): when
// NODE_ENV=production AND the built SPA exists at WEB_DIST_PATH, the API
// serves it at / with an SPA fallback (non-/api, non-/media GETs → index.html)
// so one process serves both app and API behind one origin. Outside
// production — or when the dist is missing — nothing changes.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers/build-test-app'

// Minimal fixture dist: an index.html plus one hashed asset, like vite emits.
function makeDistFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'oc-web-dist-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>openCreate SPA</title>')
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("spa")')
  return dir
}

describe('production single-origin serving', () => {
  it('serves index.html at / when NODE_ENV=production and dist exists', async () => {
    const app = await buildTestApp({ nodeEnv: 'production', webDistPath: makeDistFixture() })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('openCreate SPA')
  })

  it('serves static assets from the dist dir', async () => {
    const app = await buildTestApp({ nodeEnv: 'production', webDistPath: makeDistFixture() })
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('console.log("spa")')
  })

  it('falls back to index.html for client-routed GETs (SPA deep links)', async () => {
    const app = await buildTestApp({ nodeEnv: 'production', webDistPath: makeDistFixture() })
    const res = await app.inject({ method: 'GET', url: '/library/some-generation' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('openCreate SPA')
  })

  it('never swallows unknown /api routes into the SPA fallback', async () => {
    const app = await buildTestApp({ nodeEnv: 'production', webDistPath: makeDistFixture() })
    const res = await app.inject({ method: 'GET', url: '/api/definitely-not-a-route' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.json().error.code).toBe('not_found')
  })

  it('keeps API routes working alongside the SPA', async () => {
    const app = await buildTestApp({ nodeEnv: 'production', webDistPath: makeDistFixture() })
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('does not serve the SPA outside production', async () => {
    const app = await buildTestApp({ webDistPath: makeDistFixture() })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(404)
  })

  it('boots normally in production when the dist dir is missing', async () => {
    const app = await buildTestApp({
      nodeEnv: 'production',
      webDistPath: '/definitely/not/a/dist',
    })
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
    const root = await app.inject({ method: 'GET', url: '/' })
    expect(root.statusCode).toBe(404)
  })
})

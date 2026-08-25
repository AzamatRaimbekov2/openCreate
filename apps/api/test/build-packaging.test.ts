// The deploy-only failure class (2026-08-25).
//
// Adding @opencreate/mcp to apps/api dependencies broke PRODUCTION and nothing
// else: typecheck passed, 1231 tests passed, the image built, and the container
// crashed on boot. Two independent causes, both invisible locally because `tsx`
// reads TypeScript straight from the workspace and Docker does not:
//
//   1. scripts/build.mjs marked every dependency external EXCEPT a hardcoded
//      '@opencreate/contracts', so the bundle kept a bare import of a .ts file
//      that node cannot load.
//   2. The Dockerfile copies each workspace manifest by name for the
//      --frozen-lockfile installs, and the new one was not on the list.
//
// Both are "someone must remember to add it in a second place". These tests are
// the thing that remembers.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const repoRoot = new URL('../../../', import.meta.url)
const read = (rel: string) => readFileSync(new URL(rel, repoRoot), 'utf8')

const apiPkg = JSON.parse(read('apps/api/package.json')) as {
  dependencies: Record<string, string>
}
const workspaceDeps = Object.entries(apiPkg.dependencies)
  .filter(([, v]) => v.startsWith('workspace:'))
  .map(([name]) => name)

describe('production packaging', () => {
  it('has workspace dependencies to check (the test would be vacuous otherwise)', () => {
    expect(workspaceDeps.length).toBeGreaterThan(0)
  })

  it('bundles workspace packages by PROTOCOL, never by a hardcoded name list', () => {
    // A name list is only correct until the next workspace package, and the
    // failure it produces is a boot crash on the deployed container.
    const build = read('apps/api/scripts/build.mjs')
    expect(build).toContain("startsWith('workspace:')")
    expect(build).not.toMatch(/!==\s*'@opencreate\/contracts'/)
  })

  it('copies EVERY workspace manifest into both Docker install stages', () => {
    // --frozen-lockfile resolves against the workspace it can see. A missing
    // manifest means the install does not match the lockfile, and the first
    // signal is production.
    const dockerfile = read('Dockerfile')
    for (const dep of workspaceDeps) {
      const dir = dep.replace('@opencreate/', 'packages/')
      const copies = dockerfile.split('\n').filter((l) => l.includes(`COPY ${dir}/package.json`))
      // Two stages install with the lockfile: `build` and `prod-deps`.
      expect(copies.length, `${dir} manifest COPY lines`).toBeGreaterThanOrEqual(2)
    }
  })
})

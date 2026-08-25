// Production build (ops hardening): bundle the API into ONE runnable
// dist/index.js. Why a bundle instead of plain tsc output: our WORKSPACE
// packages ship TypeScript source (`exports: ./src/*.ts` with extensionless
// relative imports), which plain `node` cannot load — Node 22's type stripping
// requires explicit extensions, and a tsc dist would crash on the first
// `import ... from '@opencreate/contracts'`.
//
// Bundling inlines those sources while every REAL dependency (fastify,
// better-sqlite3 with its native binding, better-auth, the MCP SDK, …) stays
// external and resolves from node_modules at runtime. `pnpm start` then just
// runs `node --enable-source-maps dist/index.js`.
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// Clean slate: stale per-file tsc output must never coexist with the bundle.
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })

await build({
  absWorkingDir: pkgRoot,
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true, // start scripts pass --enable-source-maps
  outfile: 'dist/index.js',
  // External = every runtime dependency EXCEPT our own workspace packages,
  // detected by their `workspace:*` version rather than by name.
  //
  // The name list this replaces was a trap that sprang exactly once: adding
  // @opencreate/mcp to dependencies marked it external, so the bundle kept a
  // bare import of a .ts file that production could not load — and the failure
  // was a boot crash on the deployed container, not a build error. Keying on
  // the protocol makes the rule self-maintaining: a workspace package is
  // inlined because it is a workspace package, not because someone remembered.
  external: Object.entries(pkg.dependencies)
    .filter(([, version]) => !String(version).startsWith('workspace:'))
    .map(([name]) => name),
})

console.log('dist/index.js bundled')

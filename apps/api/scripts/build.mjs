// Production build (ops hardening): bundle the API into ONE runnable
// dist/index.js. Why a bundle instead of plain tsc output: the workspace
// package @opencreate/contracts ships TypeScript source (`exports: ./src/
// index.ts` with extensionless relative imports), which plain `node` cannot
// load — Node 22's type stripping requires explicit extensions and the tsc
// dist would crash on the first `import ... from '@opencreate/contracts'`.
// Bundling inlines the contracts source while every REAL dependency (fastify,
// better-sqlite3 with its native binding, better-auth, …) stays external and
// resolves from node_modules at runtime. `pnpm start` then just runs
// `node --enable-source-maps dist/index.js`.
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
  // External = every runtime dependency EXCEPT the contracts workspace
  // package (derived from package.json so a new dep can never be silently
  // bundled). Contracts is the one thing that MUST be inlined — see header.
  external: Object.keys(pkg.dependencies).filter((d) => d !== '@opencreate/contracts'),
})

console.log('dist/index.js bundled')

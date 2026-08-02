// Flat ESLint config — the same baseline apps/api and packages/contracts carry:
// typescript-eslint recommended plus a hard error on explicit `any`, so the
// workspace-wide "zero any" rule holds in the MCP server too. The package
// shipped without this file, which made `pnpm -r lint` fail outright ("ESLint
// couldn't find an eslint.config.js") rather than report violations.
import tseslint from 'typescript-eslint'

export default tseslint.config(tseslint.configs.recommended, {
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
})

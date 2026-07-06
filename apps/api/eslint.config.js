// Flat ESLint config per plan Task 3: typescript-eslint recommended plus a hard
// error on explicit `any` — enforces the workspace "zero any" rule at lint time.
import tseslint from 'typescript-eslint'

export default tseslint.config(tseslint.configs.recommended, {
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
})

// Flat ESLint config (same baseline as apps/api per plan Task 3): typescript-eslint
// recommended + hard ban on `any` — the workspace-wide "zero any" rule.
import tseslint from 'typescript-eslint'

export default tseslint.config(tseslint.configs.recommended, {
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
})

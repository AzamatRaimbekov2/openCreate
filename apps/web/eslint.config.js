// Flat ESLint config per plan Task 3 note ("same file copied in web with react
// additions"): typescript-eslint recommended + react-hooks rules (rules-of-hooks
// correctness for React 19) + the workspace-wide hard ban on explicit `any`.
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Build output must never be linted (flat config does not ignore it by
  // default): dist/ appears once `pnpm build` has run and its minified chunks
  // would drown the report in thousands of false positives.
  { ignores: ['dist'] },
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
)

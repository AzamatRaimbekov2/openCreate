// apps/web/src/shared/model/enhancePrompt.ts
// Shared mutation for POST /api/prompt/enhance — the FREE, stateless text
// transform that rewrites a rough shot idea into one detailed cinematic prompt.
// It lives in shared/ (not a module) because BOTH the /create composer and the
// Cinema shot prompt drive the same wire call; a module home would force a
// forbidden cross-module import. This hook owns only the 'enhance' mode — the
// 'soften' variant is a separate content_blocked-retry concern (toast-ux).
import { useMutation } from '@tanstack/react-query'
import type { PromptEnhanceResult } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// The mutation takes the raw draft text and returns the finished prompt. The
// contract bounds text to 1..2000 at the boundary; the button gates the min so
// a whitespace draft never reaches the wire. Errors surface as ApiClientError
// (provider_error 502 → "unavailable", rate_limited 429, else generic) at the
// call site — this hook stays domain-agnostic and does no copy mapping.
export function useEnhancePrompt() {
  return useMutation<PromptEnhanceResult, unknown, string>({
    mutationFn: (text: string) =>
      api<PromptEnhanceResult>('/api/prompt/enhance', {
        method: 'POST',
        body: JSON.stringify({ text, mode: 'enhance' }),
      }),
  })
}

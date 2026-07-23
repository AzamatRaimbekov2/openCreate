// apps/web/src/modules/Cinema/model/softenRetry.ts
// The content_blocked "soften & retry" money-path, extracted from the shot dock
// so its DEGRADE branch is unit-testable without mounting the whole
// ShotInspector.
//
// `softenPrompt` is the imperative 'soften' call to POST /api/prompt/enhance —
// the counterpart to shared/model's `useEnhancePrompt` (which owns 'enhance').
// It is a plain async fn, not a hook, because it runs inside a TOAST ACTION (a
// non-React callback), and it validates the reply against the contract schema so
// a degraded 200 (wrong/empty shape) is treated as a failure, not rendered.
//
// `createSoftenRetry` orchestrates the whole recovery: soften the blocked text,
// then hand the rewrite to `onSoftened` (which patches the shot + regenerates).
// If the endpoint is ABSENT (404 — provider not configured / not yet deployed)
// or answers oddly, it DEGRADES to a plain "edit it yourself" info toast and
// does NOT regenerate — the action is never a dead click, never a raw error,
// never a surprise charge.
import type { TFunction } from 'i18next'
import { promptEnhanceResultSchema } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { toast } from 'shared/ui'

// Imperative 'soften' call. Returns the rewritten prompt; THROWS (ApiClientError
// on non-2xx, or a zod parse error on a malformed 200) — createSoftenRetry
// catches both and degrades. Reuses the contract schema so the web and API can
// never drift on the response shape.
export async function softenPrompt(text: string): Promise<string> {
  const body = await api<unknown>('/api/prompt/enhance', {
    method: 'POST',
    body: JSON.stringify({ text, mode: 'soften' }),
  })
  return promptEnhanceResultSchema.parse(body).prompt
}

export type SoftenRetryDeps = {
  // The blocked prompt to rewrite — the exact text the provider rejected
  text: string
  // Applies the softened prompt: patch the shot's prompt + kick off a fresh
  // generation. Owned by ShotInspector, which holds the model + regenerate path.
  onSoftened: (softened: string) => void
  // Bound translator (from the caller's useTranslation) for the degrade copy
  t: TFunction
}

// Build the toast-action handler. Async: the <Toaster> shows the button busy
// until it settles and dismisses the content_blocked toast when it resolves.
export function createSoftenRetry({ text, onSoftened, t }: SoftenRetryDeps) {
  return async (): Promise<void> => {
    let softened: string
    try {
      softened = await softenPrompt(text)
    } catch {
      // Endpoint absent / provider off / malformed reply → degrade to a manual
      // edit prompt. Resolving (not throwing) lets the <Toaster> dismiss the
      // original content_blocked toast while THIS fallback stays on screen.
      toast.info({
        title: t('toasts.contentBlocked.title'),
        description: t('toasts.contentBlocked.manual'),
      })
      return
    }
    onSoftened(softened)
  }
}

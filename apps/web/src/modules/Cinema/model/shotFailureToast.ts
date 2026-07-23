// apps/web/src/modules/Cinema/model/shotFailureToast.ts
// Raises a TOAST the first time a shot's polled clip is seen `failed`. The quiet
// inline ShotClipStatus line stays as the persistent record; this is the
// attention-grabber the record cannot be — the user may have scrolled away from
// the shot they just paid to generate.
//
// content_blocked gets RICH, actionable copy plus a "soften & retry" action;
// every other code gets the mapped reason (shared errorCopy → errors.codes.*),
// never raw provider text (design.md §9).
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Generation } from '@opencreate/contracts'
import { toast } from 'shared/ui'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'

// Permanent per-session dedupe: a shot's clip fails ONCE, so it must toast once
// — even if the inspector REMOUNTS (the shot is re-selected) or the query
// re-renders with the same failed row. The store's dedupeKey only collapses
// CONCURRENT live copies; this Set is the durable guarantee across remounts,
// which is why the dedupe lives here (domain policy) and not in the store.
const surfacedFailures = new Set<string>()

// Test-only reset — the module-level Set persists across tests otherwise, so a
// second test reusing a generationId would see it "already surfaced".
export function __resetShotFailureDedup(): void {
  surfacedFailures.clear()
}

export type ShotFailureToastArgs = {
  // The polled clip. undefined until the shared ['generation', id] cache answers.
  generation: Generation | undefined
  // Attached ONLY to a content_blocked toast — softens the blocked prompt and
  // regenerates. Async; the toast button shows pending until it settles.
  // Explicit `| undefined` (exactOptionalPropertyTypes): a caller may hand it
  // through from its own optional prop.
  onSoften?: (() => Promise<void>) | undefined
}

export function useShotFailureToast({ generation, onSoften }: ShotFailureToastArgs) {
  const { t } = useTranslation()
  // Latest onSoften behind a ref: it is a fresh closure every render, so keeping
  // it OUT of the effect deps avoids re-runs while still firing with the newest
  // handler (the freshest captured prompt) when the failure is detected.
  const onSoftenRef = useRef(onSoften)
  useEffect(() => {
    onSoftenRef.current = onSoften
  })

  const status = generation?.status
  const id = generation?.id
  const code = generation?.errorCode ?? null

  useEffect(() => {
    if (status !== 'failed' || id === undefined) return
    // Fire exactly once per generationId, for this whole session
    if (surfacedFailures.has(id)) return
    surfacedFailures.add(id)

    if (code === 'content_blocked') {
      const soften = onSoftenRef.current
      toast.error({
        title: t('toasts.contentBlocked.title'),
        description: t('toasts.contentBlocked.description'),
        dedupeKey: `shot-fail:${id}`,
        // Include the action key ONLY when a handler is wired (spread, not
        // `action: undefined` — exactOptionalPropertyTypes rejects the latter).
        // No handler (e.g. a non-inspector caller) → no dead button, just the
        // informational toast; the user still learns why and can edit by hand.
        ...(soften ? { action: { label: t('toasts.contentBlocked.soften'), onClick: soften } } : {}),
      })
      return
    }
    // Any other terminal failure: the failed-clip heading + the mapped reason
    toast.error({
      title: t('toasts.shot.failedTitle'),
      description: t(errorCodeMessageKey(code)),
      dedupeKey: `shot-fail:${id}`,
    })
  }, [status, id, code, t])
}

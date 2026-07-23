// apps/web/src/modules/Cinema/components/RenderBar.tsx
// The export STATUS STRIP — CLIENT-side export (client-side-export ADR). The
// trigger is the header's «Собрать mp4» button; this strip appears with the work
// and carries its progress/result. Since the export now runs in the BROWSER
// (WebCodecs), the states changed from the server render's:
//   unsupported → a calm persistent note (no WebCodecs / File System Access here);
//   running     → determinate progress + percent + a CANCEL that tears the encode
//                 down cleanly;
//   done        → a quiet "saved" confirmation (the mp4 downloaded or streamed to
//                 disk — there is no served /media url any more);
//   error       → a calm localized retry (never the raw WebCodecs/encoder text);
//   blocked     → the client refusal reason (a clip still generating/failed, no
//                 renderable shots), named + "show me", exactly as the server did.
// PURE PRESENTATION: every value + the gating comes from `useExportController` in
// FilmEditor. The server-render props (FilmRender row, poll, 409, served download)
// are gone with the server path.
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorState, Progress } from 'shared/ui'

export type RenderBarProps = {
  // The client pipeline's state.
  state: 'idle' | 'running' | 'done' | 'error'
  // 0–100 while running.
  progress: number
  // The client refusal, already localized, or null (a clip not ready / no shots).
  blockedMessage: string | null
  // Jump to the shot the refusal names, when it is a shot. null otherwise.
  onShowSubject: (() => void) | null
  // A calm message when WebCodecs / File System Access is unavailable, or null.
  unsupportedMessage: string | null
  // Abort a running export (tears the encoder/stream down).
  onCancel: () => void
  // Start a fresh export after a failure or after fixing what blocked it.
  onRetry: () => void
}

export function RenderBar({
  state,
  progress,
  blockedMessage,
  onShowSubject,
  unsupportedMessage,
  onCancel,
  onRetry,
}: RenderBarProps) {
  const { t } = useTranslation()

  // Idle with nothing to say → no strip: the export lives in the header until it
  // runs or is refused.
  if (state === 'idle' && blockedMessage === null && unsupportedMessage === null) return null

  return (
    <Card>
      <section aria-label={t('cinema.render.title')} className="flex flex-col gap-3">
        <span className="text-xs text-mist-dim">{t('cinema.render.title')}</span>

        {/* UNSUPPORTED — a calm note; when this shows, nothing else does (the button
            is disabled, so there is no run/block to report). */}
        {unsupportedMessage !== null ? (
          <p
            role="status"
            className="rounded-lg border-l-2 border-glow-amber bg-steel px-3 py-2 text-sm text-mist"
          >
            {unsupportedMessage}
          </p>
        ) : (
          <>
            {/* RUNNING — determinate bar + percent + a real cancel. */}
            {state === 'running' ? (
              <div className="flex flex-col gap-1.5">
                <Progress value={progress} label={t('cinema.render.exporting')} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p role="status" className="text-xs text-glow-amber">
                    {`${t('cinema.render.exporting')} · ${progress}%`}
                  </p>
                  <Button variant="ghost" size="sm" onClick={onCancel}>
                    {t('cinema.render.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* DONE — the file downloaded or streamed straight to disk. */}
            {state === 'done' ? (
              <p role="status" className="text-sm text-glow-green">
                {t('cinema.render.done')}
              </p>
            ) : null}

            {/* FAILED — one calm localized retry, never the raw encoder text. */}
            {state === 'error' ? (
              <ErrorState message={t('cinema.render.failed')} onRetry={onRetry} />
            ) : null}

            {/* BLOCKED — the client refused before starting; the reason names the
                thing to fix, with a jump when it is a shot. No retry pill here:
                retrying cannot help until the user fixes what the message names. */}
            {blockedMessage !== null ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-2 border-glow-amber bg-steel px-3 py-2"
              >
                <p className="text-sm text-mist">{blockedMessage}</p>
                {onShowSubject ? (
                  <Button variant="ghost" size="sm" onClick={onShowSubject}>
                    {t('cinema.render.showSubject')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    </Card>
  )
}

# RenderBar.tsx — AI component doc

> AI-facing sidecar for `RenderBar.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The export STATUS STRIP — CLIENT-side export (client-side-export ADR, 2026-07-23).
Renders NOTHING while idle (the trigger is the header's «Собрать mp4» button), and
appears with the work: a RUNNING progress bar + a CANCEL, a DONE confirmation, a
calm FAILED retry, the client-refusal BLOCKED reason, or an UNSUPPORTED note. Pure
presentation — `useExportController` owns the state. The server-render props
(`FilmRender` row, poll, 409, served `/media` download) are gone with the server
path.

## What it does (for an AI reader)

- Responsibilities: present the tracked render's lifecycle. PURE since v7 — no
  mutation, no polling; the row arrives as a prop.
- Public API / exports / props: `RenderBar`, `RenderBarProps`
  (`state: 'idle'|'running'|'done'|'error'`, `progress: number`, `blockedMessage:
  string | null`, `onShowSubject: (() => void) | null`, `unsupportedMessage: string
  | null`, `onCancel: () => void`, `onRetry: () => void`).
- Inputs → Outputs: idle + no block/unsupported → `null`; **unsupported** → a calm
  amber note (`role="status"`, shown alone); **running** → `Progress` + amber
  percent + a CANCEL ghost button (`onCancel`); **done** → a green "saved"
  confirmation; **error** → `ErrorState` + `onRetry` (never raw encoder text);
  **blocked** → amber `role="alert"` with the client reason + optional "Show me"
  (`onShowSubject`) and NO retry pill.
- Side effects: none.

## Dependencies

- Imports: `react-i18next`, `shared/ui` (`Button`, `Card`, `ErrorState`,
  `Progress`).
- Used by: `FilmEditor`, fed by `useExportController` (the client pipeline state +
  the client validation + the capability gate).
- Tested by: `RenderBar.test.tsx` (pure: idle=null, unsupported note, running
  progress + cancel, done confirm, error retry, blocked reason with no retry,
  show-me only for a shot).

## Diagram

```mermaid
flowchart LR
  FE["FilmEditor ← useExportController (client pipeline + validation + gate)"] -->|state/progress/blocked/unsupported| RB[RenderBar]
  BTN["header «Собрать mp4»"] -->|onExport| FE
  RB -->|idle| NULL[renders nothing]
  RB -->|unsupported| U[calm amber note]
  RB -->|running| P[Progress + % + Cancel → onCancel]
  RB -->|done| D[green "saved"]
  RB -->|blocked| B[amber alert, reason + Show me, no retry]
  RB -->|error| E[ErrorState → onRetry]
```

## Key decisions / gotchas

- **v7: the standing card is gone.** A block that exists to hold one button is
  chrome; a strip that appears WITH the work and carries its progress/result is
  information. Idle = `null`, so the stage owns the pixels back.
- **Pure on purpose:** the kick-off and the poll moved up to `FilmEditor` — the
  ⋯ menu (hide while in flight, via `MenuItem.isAvailable`) and this strip must
  read ONE state, and the component that owns none of the triggers cannot own it.
- Failure copy stays localized and calm — the raw ffmpeg tail never reaches the
  user (2026-07-12 finding), pinned by a test asserting `SIGSEGV` never renders.
- **BLOCKED ≠ FAILED (2026-07-21), and the distinction is STRUCTURAL.** An export
  refused before it started is not an export that died. The strip used to call
  both "the render didn't finish", which is untrue for a refusal — ffmpeg never
  ran, and the retry pill it offered could not help until the user fixed what the
  server named. That is the same "retry that is a lie" removed from the Assembly
  stage; reintroducing it here while fixing its cousin would miss the point.
  So blocked gets its own amber alert with the reason and **no button at all** —
  not a relabelled one — pinned by a test asserting `queryAllByRole('button')` is
  empty in that state.
  The failed branch is additionally guarded by `blockedMessage === null`: `render`
  may still be a STALE failed row from a previous attempt while the refusal we
  just received is about the attempt made NOW. Rendering both had the strip
  contradicting itself about whether ffmpeg ran, and put the lying retry pill back
  on screen directly under a message explaining that retrying cannot work yet.
  A test pins that the two never render together.
- **Where the seven refusals will slot in.** `blockedMessage` arrives
  already-localized, so the pending per-reason upgrade (plan option A) does not
  touch this component at all — it widens the discriminator in `FilmEditor`'s
  `blockedMessage` derivation. See `FilmEditor.tsx.md` § SEAM.
- **A render we cannot see is not a render in progress (2026-07-21).** When the
  poll gives up, `isRunning` goes false so the strip never shows a percentage it
  cannot stand behind, and the amber "lost" alert offers `onRefreshStatus`.
  `onRefreshStatus` is a SEPARATE prop from `onRetryExport` on purpose: when we
  have merely lost sight of a render, starting a second ffmpeg job is the one
  thing that must not happen.

## Update 2026-07-21 — `onShowSubject`

The blocked strip gained an optional "Show me" action. `blockedMessage` now names the
blocker ("Shot 2 is still generating…"), and this jumps to it.

`null` when the blocker is NOT a shot — an audio track or the film itself has nothing to
select in this editor, and a dead button is worse than no button. Naming the subject is most
of the fix; reaching it is the rest.

## Update 2026-07-23 — CLIENT-side export cutover

The export runs in the BROWSER now (streaming WebCodecs), so the strip's states
changed: the served-`/media` Download link is gone (the mp4 downloads or streams to
disk locally — DONE is a quiet green "saved"), a RUNNING export shows a CANCEL
(there is a real encode to abort), and the server-only bits — the `FilmRender` row,
the poll, `isPollFailed`/`onRefreshStatus`, the 409 "already running" — are gone
with the server path. What stays: BLOCKED ≠ FAILED (the client refusal still names
the reason with no lying retry), and copy is calm + localized (never raw encoder
text). All values come from `useExportController`. The historical decisions above
about the ffmpeg poll are retained for provenance but no longer apply to the code.

## Commits

- _no commit yet (v7 rework; render persistence + poll-wedge fix 2026-07-21)_

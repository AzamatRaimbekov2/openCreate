# GenerationCard.tsx — AI component doc

> AI-facing sidecar for `GenerationCard.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

One generation in the gallery grid as a FIGURE (v3 terminal: abyss media plate +
quiet mono prompt caption + white/10 hairline meta row — no card wrapper),
covering the three per-item states in the status triad (processing=amber,
succeeded=green, failed=red): processing (progress + amber percent), succeeded
(playable/enlargeable media + actions), failed (glow-red hairline well + reason +
refunded chip).

## What it does (for an AI reader)

- Responsibilities: render the live state of one generation; own the detail
  modal open/close; trigger delete. Keeps itself live via `useLiveGeneration`.
- Public API / exports: `GenerationCard` with `GenerationCardProps = { generation: Generation }`
  (the list-cache item as seed).
- Inputs → Outputs:
  - processing → `animate-skeleton` abyss well (real aspect, the stepped surface
    pulse) + `Progress` + glow-amber "n%" numeral, NO `<video>`.
  - succeeded video → `<video controls src>` on the abyss well; image → media
    button (lift hover, motion-safe) opening `GenerationDetail`; hairline
    footer: cost + portal download link + danger-pill delete.
  - failed → glow-red-HAIRLINE abyss well (`border-glow-red` on the well),
    stored failure reason, success-variant "Credits refunded" chip, delete.
- Side effects: polling + invalidations via `useLiveGeneration`; DELETE via `useDeleteGeneration`.

## Dependencies

- Imports: `react` (`useState`), `react-i18next`, `@opencreate/contracts`,
  `shared/ui` (`Badge`, `Button`, `Progress`), module model (`generationsApi`),
  sibling `GenerationDetail`.
- Used by: `components/GalleryGrid.tsx`.

## Diagram

```mermaid
flowchart TD
  SEED[list item seed] --> UL[useLiveGeneration 4s poll while processing]
  UL -->|processing| P[media well pulse + Progress %]
  UL -->|succeeded| S[video controls / img button -> GenerationDetail]
  UL -->|failed| F[glow-red border + reason + refunded Badge]
  F -->|errorCode content_blocked| CB[localized safety-filter copy]
  S & F --> A[footer: cost · download · delete -> useDeleteGeneration]
```

## Key decisions / gotchas

- Media wells use the generation's REAL aspect ratio (`aspectClasses` literal
  map — Tailwind cannot see computed class names) so nothing jumps when the
  asset arrives (CLS budget, design.md §4).
- Failed cards show the stored `errorMessage` as a secondary caption per the
  plan's card contract — a deliberate, recorded exception to design.md §8's
  "no raw server text" (the primary line stays localized).
- EXCEPT safety blocks: when `errorCode === 'content_blocked'` the card renders
  the localized `gallery.contentBlocked` copy instead of the raw provider
  message — moderation failures are user-facing product copy, never provider text.
- Status is never color-only (a11y §7): glow-red border + "Generation failed"
  text + refunded chip all carry it together.
- Delete is offered only for terminal states — a processing task can't be
  cancelled in the MVP API.
- v3 terminal restyle intent: media plates moved to `bg-abyss rounded-lg` (the
  recessed surface step reserved for user media); the processing well now runs
  `animate-skeleton` — the SAME stepped surface pulse as Skeleton, because a
  loading well IS a skeleton (tests query `.animate-skeleton`); the percent
  numeral wears glow-AMBER (processing status color, weight 400); download is a
  portal-blue link (prose-link law); delete graduated from ghost+red-text to the
  real `variant="danger"` red specimen pill — v2 faked the destructive tint
  because its danger was a solid fill, v3's is translucent so it can be used
  honestly. Tests updated: `.border-danger` → `.border-glow-red`. Behavior,
  roles and i18n untouched.

## Commits

- 9ffc310 2026-07-06 feat(web): gallery with 4-state cards and 4s polling of processing items
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy
- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs

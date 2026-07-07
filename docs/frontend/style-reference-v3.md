# openCreate Design v4 — "Bioluminescent Terminal" (user-provided Midjourney style reference)

Status: ACTIVE design law (chosen by the owner 2026-07-07, supersedes v2 Light Editorial).
Source: owner-supplied style reference of midjourney.com. Apply it to openCreate with the adaptations in §Adaptations.

## Core system (from the reference)

**Colors**
- Base page background: `#06051d` (Cosmic Void — near-black with violet undertone; never pure #000).
- Surface elevation via color steps, NOT shadows: `#0f1c36` (abyssal) → `#1d293d` (steel navy: nav/cards) → `#314062` (deep slate: hover/elevated).
- Text: body `#cad5e2` (mist), headings `#ffffff`, secondary `#90a1b9`-range, links `#63b3ed` (portal blue — the only chromatic accent in prose).
- Specimen pill triad (closed system, translucent ~20% opacity tinted backgrounds + white 10% border + matching bright text):
  - Green: bg `#004f3b`/20%, text `#00bc7d`
  - Amber: bg `#733e0a`/20%, text `#fefce8` (icon accent `#f0b100`)
  - Red: bg `#8b0836`/20%, text `#fff1f2`
- Icon/status accents: `#00bc7d`, `#f0b100`, `#ff2056` — sparing, icons/status only.

**Typography**
- `JetBrains Mono` is THE typeface — nav, headings, buttons, body, links. Headings 30px weight 400 (never bold, no uppercase transform), body 16px/1.5, caption 14px/1.63. `DM Sans` only as sparing secondary body prose.
- Whisper-weight display: large sizes at weight 400 are the signature. Font-weight above 500 is forbidden.

**Shape & layout**
- Buttons: 9999px pills. Cards/images/inputs: 8px radius. No intermediate radii.
- Elevation by surface color steps; the ONLY shadow allowed is the soft double shadow on pills.
- Landing: narrow centered column max-width ~800px, 64px section gaps, research-lab document feel. Hero is full-viewport with a generative ASCII sphere as the visual (the text IS the hero, no photos).
- Showcase imagery: monochromatic blue-violet "specimen" renders (eye/brain/hand/arch symbolism), square tiles, 4-col grid, 8px gap+radius, subtle fog border, no captions/overlays.

**Don'ts (from the reference)**
No sans/serif headings; no solid opaque CTA fills (translucent specimen tints only); no light backgrounds anywhere; max three button tint colors; no bold headings; no photography/decorative illustration; body prose sits directly on the void, not in cards.

## Adaptations for openCreate

1. **NO GRADIENTS — hard owner rule** overrides the reference's one background gradient: use flat `#06051d` everywhere the reference used `linear-gradient(0deg,#06051d 30%,#061434)`.
2. **Specimen triad mapping:** green = primary create/submit actions («Начать создавать», Generate, Sign up), amber = explore/browse (Pricing, model picker highlights, processing status), red = auth-exit/destructive (Log in per reference taxonomy → keep; delete/errors use `#ff2056` icon accent). Generation statuses: processing=amber, succeeded=green, failed=red — same closed triad.
3. **App screens** (create/library) keep the color/type system but use a wider grid (the 800px column is landing/prose only); cards on `#1d293d`, panel steps per surface table.
4. **ASCII hero**: implement as a dependency-free React canvas/pre component (animated ASCII ellipsoid in `#cad5e2` at low opacity) with `prefers-reduced-motion` fallback to a static frame. Overlaid wordmark `openCreate` + specimen pills.
5. **Showcase**: replace v2 editorial posters with blue-violet duotone SVG "specimens" (flat fills + SVG patterns, no gradients), square 4-col grid, honest sample labeling kept (i18n `landing.showcase.sampleLabel`), one tile marked video.
6. **Cyrillic**: JetBrains Mono supports Cyrillic natively. If DM Sans Cyrillic is missing in the installed subset, fall back to system sans for RU prose.
7. All existing behavior/routes/i18n keys/claims stay intact; both en.json and ru.json for any new strings.

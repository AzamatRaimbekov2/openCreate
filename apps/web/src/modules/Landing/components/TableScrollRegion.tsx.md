# TableScrollRegion.tsx — AI component doc

> AI-facing sidecar for `TableScrollRegion.tsx`. Created 2026-07-07. Keep this in sync with the code on every change.

## Purpose
The no-gradient horizontal-scroll affordances for the wide "index" tables
(v4 QA round 2 + the 390px affordance finding): on narrow screens the tables
clip mid-column inside an `overflow-x-auto` region with no cue that they
scroll. An edge fade would need a CSS gradient (banned by the owner rule), so
this wrapper shows a quiet mono "scroll →" hint AND a translucent SOLID
right-edge overlay strip — both only while there is really overflow, the strip
only while more columns actually hide to the right.

## What it does (for an AI reader)
- Responsibilities: wrap a wide table in a keyboard-focusable scroll region;
  measure `scrollWidth > clientWidth` (initially + via `ResizeObserver` on the
  region and its first child, falling back to a window `resize` listener where
  the API is missing, e.g. jsdom); render the localized `common.scrollHint`
  caption (aria-hidden, `text-xs text-mist-dim`, right-aligned) only when the
  content overflows; track `scrollLeft` (onScroll + the same measure) to show
  the solid `bg-void/60` edge strip (`data-testid="table-scroll-edge"`,
  aria-hidden, pointer-events-none, `w-6`, pinned by a `relative` wrapper)
  only while NOT scrolled to the far right.
- Public API / exports / props: `TableScrollRegion`, `TableScrollRegionProps`
  — `label: string` (accessible name of the region, usually the table title),
  `children: ReactNode` (the table).
- Inputs → Outputs: label + table → hint `<p>` + `relative` wrapper holding
  `<div role="region" aria-label tabIndex=0 class="overflow-x-auto …">` and the
  optional absolute edge strip.
- Side effects: none beyond the observer/listener (cleaned up on unmount).

## Dependencies
- Imports / depends on: `react` (`useEffect/useRef/useState`), `react-i18next`
  (`common.scrollHint` in BOTH en.json and ru.json).
- Used by: `PriceTable.tsx` (landing + /pricing) and `ModelCreditTable.tsx`
  (/pricing) — module-internal, not exported from `modules/Landing/index.ts`.

## Diagram
```mermaid
flowchart LR
  PT[PriceTable] --> TSR[TableScrollRegion]
  MCT[ModelCreditTable] --> TSR
  TSR -->|overflow?| HINT[mono scroll-hint caption]
  TSR -->|overflow and not at far right| STRIP[solid bg-void/60 edge strip]
  TSR --> REGION[focusable overflow-x-auto region]
  REGION -->|onScroll| STRIP
  REGION --> TABLE[wide table child]
```

## Key decisions / gotchas
- Hint visibility is DYNAMIC (measured), not breakpoint-guessed: a `md:hidden`
  static hint would lie between ~600–768px where the 36rem tables already fit.
- The edge "fade" is ONE translucent solid color (`bg-void/60`) — the simplest
  overlay that dims the cut-off column edge without a gradient (owner rule).
  It retires at the far right (`scrollLeft + clientWidth >= scrollWidth - 1`,
  the -1 tolerating sub-pixel positions on fractional zoom) because an
  affordance pointing at nothing would misreport "more columns".
- The hint and the strip are `aria-hidden` — screen-reader users get the
  labelled, focusable region itself; announcing decorations would be noise.
  The strip is also `pointer-events-none` so it never eats taps on the last
  visible column.
- `tabIndex={0}` + `role="region"` + `aria-label` make the overflow area
  keyboard-scrollable (a11y: scrollable regions must be focusable).
- Focus style follows the design-system rule: portal ring, no removed outline.
- jsdom has no ResizeObserver and no layout: tests shadow
  `HTMLElement.prototype.scrollWidth/clientWidth` and rely on the resize-
  listener fallback branch.

## Commits
- 70fb5cc 2026-07-07 restyle(web): v4 qa round 2 (component introduced — no-gradient scroll affordance + keyboard-focusable region)
- f4c7cff 2026-07-07 chore(web): dead export cleanup + mobile table affordance (adds the solid right-edge strip)

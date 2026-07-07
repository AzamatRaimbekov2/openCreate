# openCreate — Design System v2 ("Light Editorial")

> Canonical design source of truth for `apps/web`. Every screen, component, and token
> decision starts here. v2 created 2026-07-07 (editorial redesign, stage 1) after the
> product owner rejected v1 "Paper & Ink" as template-like. Keep in sync with
> `apps/web/src/shared/config/theme.css` and `apps/web/src/shared/ui/`.

## 1. Intent & identity

openCreate is an honest, cheaper AI image/video generation product. The UI must read
like a **premium print magazine about generative art**: light, typographic,
art-forward, unmistakably designed — never a dashboard template, never dark-cinema.

- Direction: **"Light Editorial"** — warm cream canvas, ink typography with a display
  serif, ONE vermillion accent used like an editor's red pen, hairline rules,
  poster-grade showcase art, generous asymmetric whitespace.
- Audience: creators comparing generation prices; EN + RU locales, desktop-first,
  fully responsive (390px must wrap cleanly).
- Voice: honest copy — short verbs, sentence case, no exclamation marks, no blame.
  All strings via i18next keys present in BOTH `en.json` and `ru.json`. The four
  approved claims ($0.01 images / $0.35 5s video / credits never expire / no
  subscription) keep their exact meaning everywhere.
- Depth: **no heavy shadows.** Hierarchy comes from hairlines (`border-ink/15`),
  tinted sand blocks, and type scale. Media (generated output) is the only dark
  element — the user's work is always the hero.

## 2. Color tokens

Defined once in `apps/web/src/shared/config/theme.css` via Tailwind v4 `@theme`.
Use utility classes (`bg-cream`, `text-ink`, `ring-vermillion`, …) — never raw hex in
components (single exception: `ShowcasePoster` art data, §5).

| Token | Value | Role | Use when | Avoid when |
|---|---|---|---|---|
| `--color-cream` | `#faf7f2` | The canvas | Page/body background, standalone screens, modal sheets, menu panels | Nothing "sits on white" anymore — cards are hairline frames on cream |
| `--color-ink` | `#161412` | Ink | Headings, body copy, solid CTA pills, selected pills, hairlines via opacity | Large decorative fills |
| `--color-ink-soft` | `#6e675e` | Soft ink | Secondary text, captions, micro-labels, inactive nav | Primary copy the user must read to act |
| `--color-vermillion` | `#e8442e` | THE accent (editor's red pen) | One italic hero word, active nav/states, "us" price column, stamps/badges, CTA hover, focus rings, progress fill | Body text at any size; backgrounds; status meaning (success/danger own that) |
| `--color-sand` | `#efe9df` | Tinted block | Quiet hovers, skeleton shimmer, manifesto/tinted sections, selected-card wash | Text on sand other than ink/ink-soft |
| `--color-media` | `#141413` | Media well | ONLY behind image/video previews and media cards | Any non-media surface — the app stays light |
| `--color-success` | `#1e6b41` | Positive status | Refund stamps, "+credits" amounts | Buttons/CTAs (ink owns actions) |
| `--color-danger` | `#b3261e` | Destructive / failure | Delete fill, failed-card borders, "-credits", validation text | Error screens (calm neutrals + ghost retry instead — §9); never as "accent #2" |

Hairlines and in-between grays are opacity modifiers — `border-ink/15` (the standard
hairline), `border-ink/20`–`/30` (controls), `bg-ink/5`, `bg-ink/10` — do not add gray
tokens. `bg-white` is retired from the kit; module surfaces migrate to cream/hairline
in redesign stage 2.

Decorative glyphs (bolts, play marks, arrows) are inline SVG in `currentColor` or
plain text characters — **never OS color emoji**, which render in their own palette
(yellow ⚡, blue ▶️) and smuggle a second accent past the token system (QA r1 fix).

### Contrast rules (checked against cream #faf7f2)

- ink 16.6:1, ink-soft 5.5:1 — body/secondary text AA+.
- **vermillion 3.7:1 — NOT for body text.** Allowed only: ≥18px/bold display text,
  non-text (rules, fills, rings, progress), active nav micro-labels, and stamp badges
  (brief-sanctioned exception, recorded here). Failure text never uses vermillion.
- danger 6.1:1 and success 5.6:1 — safe at small sizes for status text.
- Text on sand: ink or ink-soft only.

## 3. Typography

Two self-hosted variable families (imported in `main.tsx` via @fontsource, declared as
`@theme` font tokens — `font-display` / `font-sans` utilities):

| Token | Family | Role |
|---|---|---|
| `--font-display` | **Fraunces Variable** (opsz + italic axes), fallback Georgia | Hero + section headings, oversized numerals, modal titles, the ONE italic accent word in headlines |
| `--font-sans` | **Space Grotesk Variable**, fallback system-ui | Default everywhere: body, buttons, labels, tables, nav |

Neither family ships Cyrillic — RU renders in the serif/system fallbacks by design
(accepted; identity is carried by layout, hairlines, and the accent as well as type).

### Type scale

| Level | Classes | Use |
|---|---|---|
| Hero display | `font-display text-[clamp(3.5rem,8vw,7rem)] leading-[0.98] font-semibold tracking-tight` | Landing hero only; one word `italic text-vermillion` |
| Section title | `font-display text-4xl md:text-5xl font-semibold tracking-tight` | Landing sections, error screens (404/crash/offline) |
| H2 / modal title | `font-display text-2xl font-semibold tracking-tight` | Modal titles, EmptyState titles, card headings |
| Body | `text-base text-ink` | Default copy |
| Secondary | `text-sm text-ink-soft` | Descriptions, helper text, figure captions |
| Micro-label | `text-[11px] font-medium uppercase tracking-[0.18em] text-ink-soft` | Field labels, kickers, section numbers' captions; hero kicker may use `tracking-[0.2em]`+ |
| Serif numeral | `font-display font-semibold` (size per context) | Price columns, section ordinals 01/02/03, cost lines |

Uppercase is always CSS `text-transform` — DOM/i18n text stays sentence case.

## 4. Structure, spacing, radius, motion

- **Magazine structure**: hairline rules between sections, asymmetric 12-col grids,
  oversized serif section numbers (01/02/03), figure captions under media
  (`fig. 01 — "…" · Studio (provider)` in secondary text). Landing sections keep
  ≥96px vertical rhythm on desktop (`py-24`+).
- **Spacing**: 4px scale. `gap-1` inside controls, `gap-4` between fields, `p-6`–`p-8`
  framed blocks. When in doubt add space, not boxes.
- **Radius language**: pills for interactive controls (`rounded-full` — buttons,
  toggles, chips); near-flat for surfaces (`rounded-sm` sheets/menus, `rounded-[3px]`
  stamps); square ends for rules/progress. `rounded-xl/2xl` cards are v1 — retire on
  touch.
- **Elevation**: hairline borders first. `shadow-lg` only on floating layers (modal
  sheet, menus). Nothing else casts a shadow.
- **Motion**: opacity/translate/color only, 150–250ms (`duration-200` default).
  Hovers must be FELT (ink→vermillion flip, hairline solidifying, ≤1deg rotation or
  slight lift on art cards). `animate-pulse` reserved for skeletons/processing media.
  Respect `prefers-reduced-motion` for any added animation.

## 5. Showcase art direction (`ShowcasePoster`)

Poster-grade **SVG compositions** replace all placeholder gradients. Component:
`ShowcasePoster` (`shared/ui`), data: `showcasePosterArt.ts`. Rules:

- Each palette is a deliberate composition (backdrop gradient + shapes + feTurbulence
  grain overlay), 400×500 canvas, `preserveAspectRatio: slice` so cards may crop.
- **No text inside the art**; `aria-hidden` — the honest i18n'd figure caption lives
  outside (`landing.showcase.*`, labeled "sample style" / «пример стиля»).
- Art colors are content, not chrome — the ONLY sanctioned raw-hex site.

| Palette | Mood | Composition |
|---|---|---|
| `dusk` | orange/rose evening | pale sun disc + halo over a dark rose horizon band |
| `sea` | deep blue/teal night water | pale moon + orbit ring over two teal wave layers |
| `botanical` | green on warm cream | one great leaf blob, stem, seeds, cream vein ring |
| `mono` | ink print-shop geometry | concentric ink rules, offset ink disc, one diagonal |
| `ultraviolet` | after-dark aura | magenta core in a violet glow, lilac orbit + comet line |
| `koi` | brand plate (vermillion/cream) | vermillion koi form, ink eye, faint pond ring |

Spread layout (done, stage 2 — `modules/Landing/ShowcaseSpread`): asymmetric 12-col
grid in reading order fig. 01–06 (spans 7+5 / 4-tall-9:16+4+4 / full-width 21:9 plate,
two cards vertically offset), hover = print-lift (≤1deg tilt + 1.5% scale,
`motion-safe` only). Captions: serif-italic `fig. 0N` — localized sample title in
typographic quotes — the REAL catalog model (`Flash (FLUX schnell)` / `Studio (FLUX
dev)` / `Cinema (Wan 2.7)`) + neutral "sample style" stamp `Badge`. The one video
sample (sea) carries a vermillion `video · 5s` stamp with a play glyph on a
`bg-cream/90` backing so it reads on dark art.

## 6. Component inventory (`apps/web/src/shared/ui/`)

Import from `'shared/ui'` only (public API via `index.ts`). Reuse these before creating
anything new; new shared components must be added to this table in the same task.

| Component | Variants / props | Editorial treatment & states |
|---|---|---|
| `Button` | `variant: primary \| ghost \| danger`, `size: md \| lg`, `isLoading` | primary = solid-ink pill, hover→vermillion; ghost = hairline outline pill, hover solidifies + sand wash; danger = solid danger pill. Focus = vermillion ring (+cream offset); disabled 50%; loading spinner + `aria-busy` |
| `Input` | `label`, `error`; native props incl. `ref` (RHF-ready) | hairline underline field: uppercase micro-label, transparent body, `border-b border-ink/30`; focus = vermillion rule (+1px shadow, no layout shift); error = danger rule + `role="alert"` |
| `Select` | `label`, `options`, `error` | same underline treatment as Input; native picker kept |
| `Skeleton` | `className` for shape | cream shimmer: `animate-pulse bg-sand rounded-sm` — "unprinted paper", never gray |
| `Modal` | `isOpen`, `onClose`, `title`, `role: dialog \| alertdialog` | cream sheet, hairline border, `rounded-sm`, serif title over a hairline rule, circle hairline close; portal, Escape + overlay close, scroll lock, focus restore |
| `EmptyState` | `icon?`, `title`, `description?`, `action?` | hairline frame on cream (no card), serif title |
| `ErrorState` | `message`, `onRetry?` | calm hairline frame, ghost retry, `role="alert"` — never red-primary |
| `Badge` | `variant: neutral \| accent \| success \| danger` | STAMP: uppercase tracked 11px, hairline outline in variant color, `rounded-[3px]` — never a solid chip |
| `Progress` | `value: 0–100`, `label?` | thin square-ended rule: vermillion fill on `bg-ink/10` track; full ARIA |
| `PillGroup<T>` | `label`, `options`, `value`, `onChange` | micro-label caption; selected = solid ink pill (`bg-ink text-cream`), unselected = hairline outline; `aria-pressed` |
| `LangSwitch` | none | hairline pill group; active locale = solid ink mini-pill |
| `AppShell` | `user`, `isSessionPending?`, `onSignOut`, `balanceSlot?`, `children` | hairline masthead: serif wordmark "openCreate·" (vermillion dot, aria-hidden), uppercase grotesk nav (active = vermillion), ink-pill Sign in, cream hairline user menu |
| `ShowcasePoster` | `palette: 6 palettes (§5)`, `className?` | decorative grained SVG poster; consumer owns sizing + caption |
| `AppErrorBoundary` | wraps the app | crash → serif headline, one line, one ink-pill reload (§9) |
| `OfflineOverlay` | none (self-managed) | full-screen `role="alertdialog"` on cream; serif headline; auto-clears on reconnect |
| `NotFoundPage` | none | vermillion "404" micro-stamp, oversized serif headline, one ink-pill home link |

Buttons: primary = the single main action per view; ghost = secondary/quiet + retry;
danger = destructive only. Size `lg` only for landing/hero CTAs. Links styled as the
primary action mirror Button primary classes (ink pill, vermillion hover). Quiet
text actions/links use the editorial underline idiom: `text-ink underline
decoration-ink/30 underline-offset-4 hover:decoration-vermillion` — never small
vermillion text (§2 contrast policy).

## 7. The 4-states rule (mandatory)

Every component/screen that renders server data implements all four states:

1. **Loading** — `Skeleton` blocks shaped like the eventual content (never bare spinners).
2. **Empty** — `EmptyState` with a next action.
3. **Error** — `ErrorState` with a localized, user-safe message + retry.
4. **Data** — the real render.

No blank screens, no raw error text, ever.

## 8. Accessibility rules

- Focus: `focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none`
  on every interactive element (underline fields instead thicken + recolor their rule —
  an equally visible replacement). Never remove outlines without a replacement.
- Hit area ≥40px (`min-h-10`); 44px+ on touch layouts. Icon-only buttons get `aria-label`.
- Inputs always have visible labels; errors via `aria-describedby` + `role="alert"`.
- Vermillion text policy: see §2 contrast rules. Recorded brief-sanctioned exceptions:
  stamp badges (11px outline stamps), active nav micro-labels, the balance stamp chip,
  the index tables' "openCreate" column header (11px uppercase micro-label — the
  brief's "vermillion us column"), and the showcase `video · 5s` marker stamp.
- Status is never color-only: failed cards pair the danger border with text + stamp.
- Decorative art (`ShowcasePoster`, ordinals, the wordmark dot) is `aria-hidden`;
  uppercase is CSS-only so accessible names match i18n strings.
- `<html lang>` mirrors the active locale; RU copy is complete, not partial.

## 9. Error-UX surfaces (frontend-error-ux contract)

| Surface | Component | Behavior |
|---|---|---|
| Unknown route | `NotFoundPage` | Editorial 404 (vermillion micro-stamp + serif headline + one action). Root `notFoundComponent`. |
| Render crash | `AppErrorBoundary` | Serif "technical update" fallback + reload. Technical detail → console/monitoring only. |
| Lost connectivity | `OfflineOverlay` | `useSyncExternalStore` on `online`/`offline`; full-screen `role="alertdialog"` blocker on cream; auto-dismisses. |
| Blocking failure | `Modal role="alertdialog"` + `ErrorState` | For failures requiring acknowledgement. Non-blocking failures stay inline. |

Copy rules: never raw server text, stack traces, or status codes; no red-primary panic
styling; every error screen = serif headline, one line, one action; both locales
(`errors.*` keys).

## 10. Governance

- Tokens live only in `theme.css` `@theme`; new tokens require a repeated product
  need, an entry in §2, and a note here. One-screen needs use existing tokens + opacity.
- New shared components: only when 2+ modules need them; add to §6 in the same task.
- Documented inline-style exception: `Progress` width % (runtime-computed). Documented
  raw-hex exception: `showcasePosterArt.ts` (§5). No others.
- Dark mode: out of scope for MVP (`--color-media` is the only dark surface).
- Screens/routes: standalone screens (landing, login, 404, crash, offline) sit directly
  on cream; app screens run inside `AppShell` via the pathless `_shell` layout route.
  AppShell stays presentational (session + BalanceChip injected by `routes/_shell.tsx`).
- Prerender guard: `pnpm --filter @opencreate/web build` greps the hero/claims copy —
  redesigns must keep those strings rendering at `/`.

## 11. Page treatments (redesign map — stage 2 applies these)

| Page | Treatment |
|---|---|
| Landing `/` | Done (stage 2). Hero: micro-label kicker, giant Fraunces headline with ONE vermillion italic word (EN "video", RU «копейки» — locale-driven via `landing.headlineAccent`, split inline so the h1 accessible name and the prerender grep stay intact), claims line, ink CTA + underlined text link to /pricing. "Selected works" ShowcasePoster spread (§5). "The index" price table: `SectionHeading` (ghost serif ordinal + kicker + serif h2 over a hairline), hairline rows, serif display numerals (ours vermillion / competitor ink), caption-bottom verified footnote. How-it-works as vermillion-serif 01/02/03 hairline rows. FAQ as serif-question hairline rows. Colophon footer (wordmark, tagline, rights micro-label). Sections sit ≥96px apart on desktop (`md:gap-28`). |
| `/pricing` | Done (stage 2). Kicker + serif display h1 + "200 free credits" accent stamp `Badge`; PriceTable as section 01, `SectionHeading 02` + `ModelCreditTable` in the same hairline index treatment (serif credit numerals); visitor signup CTA as a sand tinted block with an ink-pill link. |
| `/login` | Done (stage 3). Editorial split `grid lg:grid-cols-[5fr_7fr]`: `AuthManifesto` on sand left (wordmark home link, kicker, serif quote `auth.manifesto.quote`, the three `landing.claims.*` as hairline rows); form right printed directly on cream — serif h1 over a hairline, underline `Input` fields, ink-underline mode-switch link, sand+danger-rule server banner (RHF/Zod + roles intact). Pending state keeps the same split silhouette. |
| `/create`, `/library` | Done (stage 3). Cream canvas, hairline masthead (AppShell), serif display page h1s. Generator = the "commission sheet" (hairline `rounded-sm` frame, `generator.sheet` micro-label head, `SheetField` rows with decorative serif ordinals + `divide-ink/10` separators, underline prompt field, serif `CostLabel` numeral against the closing hairline). Library/gallery cards = magazine figures: `rounded-sm bg-media` plates, serif-italic prompt captions on cream, hairline meta rows; processing % is a serif numeral. |
| 404 / crash / offline | Done (stage 1): serif headline, one line, one action. |

## 12. Module UI surfaces (kept current per task)

Module-owned components (inside `modules/*`, composed from §6 primitives). Stage 3
finished the editorial restyle of every module surface — `bg-white`, `shadow-sm`
and `rounded-xl/2xl` are fully retired from `src/`.

| Module | Surface | Composition & states |
|---|---|---|
| Auth | `AuthForm` (`/login`) | No card — printed on cream: serif h1 over a hairline, underline `Input` fields + `Button`; login↔register switch as an ink-underline text link; zod errors per field (`role="alert"`); server banner = sand block + danger left rule; Google button behind `VITE_GOOGLE_AUTH=1`. |
| Auth | `AuthManifesto` (`/login` left) | Sand panel: wordmark→`/`, `landing.kicker` micro-label, serif display quote (`auth.manifesto.*`), the three `landing.claims.*` as hairline rows (claims copy has ONE source of truth). |
| Credits | `BalanceChip` (header) | STAMP chip (bolt + n): `rounded-[3px]` vermillion hairline outline + serif numeral (vermillion lettering = recorded §2/§8 stamp exception); the bolt is a decorative `currentColor` outline SVG — NEVER an OS emoji, which paints its own yellow and breaks the one-accent rule (QA r1); loading = stamp `Skeleton`; failure = ↻ icon-button; signed-out hidden. Opens history modal. |
| Credits | `TransactionsList` (modal) | `Modal` + 4 states; editorial ledger — `divide-ink/10` rows (no hover chips), serif display amounts (`+n` success / `-n` danger; the sign carries meaning, color reinforces). |
| Generator | `GeneratorPanel` (`/create`) | The "commission sheet": hairline `rounded-sm` frame, `generator.sheet` micro-label head, ordered `SheetField` rows (hairline-divided), serif `CostLabel` + Generate against the closing hairline. Catalog 4 states (loading mirrors the sheet frame). Submit failures inline via `SubmitErrorBanner`. |
| Generator | `SheetField` | One sheet row: decorative serif ordinal (derived from render order, aria-hidden) + field group; separators owned by the parent `divide-y`. |
| Generator | `PromptField` | Micro-label + hairline underline textarea (the `Input` treatment's textarea twin — promote a shared `Textarea` if a 2nd module ever needs one). |
| Generator | `SubmitErrorBanner` | `role="alert"` sand block + danger left rule; maps `insufficient_credits` (+ ink-underline `/pricing` link) and `content_blocked` to dedicated copy. |
| Generator | `ModelPicker` | `aria-pressed` specimen cards: `rounded-sm` hairline on cream, serif display name, honest provider label + price hint; selected = vermillion hairline + sand wash; hover solidifies + washes. |
| Generator | `ImageDrop` | Dashed hairline dropzone on cream (hover solidifies + sand wash) + sr-only file input; preview thumb on `bg-media`; image/* ≤10MB; inline errors. |
| Gallery | `GalleryGrid` | 4 states: 8 plate-shaped skeletons (`rounded-sm`) / `ErrorState` / `EmptyState` + ink-pill `/create` CTA / 1-2-3-col grid + ghost Load more. |
| Gallery | `GenerationCard` | A magazine FIGURE (no card): `rounded-sm bg-media` plate in real aspect; serif-italic prompt caption on cream; hairline meta row (cost · ink-underline download · ghost delete). Processing = pulse + `Progress` + serif %; failed = danger-hairline well + reason + "Credits refunded" stamp. Image plates print-lift on hover (`motion-safe`). |
| Gallery | `GenerationDetail` (modal) | `rounded-sm bg-media` plate, serif-italic caption, ink-underline download. |
| Gallery | `GalleryFilterChips` | `PillGroup` All/Images/Videos. |
| Landing | `LandingPage`, `Hero`, `ShowcaseSpread`, `SectionHeading`, `PriceTable`, `HowItWorks`, `FaqClaims`, `ModelCreditTable` | Stage-2 editorial rebuild landed (§11). `SectionHeading` (ordinal outside the h2 — heading names are behavior) and `PriceTable` (`ordinal` prop) are also consumed by the /pricing route via the module index. Claims and honesty markers ("verified July 2026" caption as the table's accessible name, one named competitor per row, per-card "sample style" labels) are unchangeable. |

Recorded exceptions: `Modal` overlay is `role="presentation"` (2026-07-06 a11y fix);
failed cards show the stored provider failure reason as a secondary caption
(Tasks 16-17) — §9's "no raw server text" otherwise stands.

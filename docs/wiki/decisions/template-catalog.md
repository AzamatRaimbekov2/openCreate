---
type: decision
status: accepted
updated: 2026-07-11
tags:
  - decision
  - template-catalog
  - cinema-studio
  - architecture
---

# ADR: Template Catalog — pre-authored viral formats that instantiate into a film

- **Status:** ACCEPTED — approved by the owner 2026-07-11 (architecture gate; tiers / voiceover-in-v1 / 8-beat canon all chosen by the owner)
- **Date:** 2026-07-11
- **Related:** [[cinema-studio]], [[opencreate-mvp-architecture]], [[entity-library-reference-tagging]]

## Context

The owner wants a **catalog module** inside Cinema Studio: a shelf of ready-made templates whose
prompts and settings are already worked out, starting with a **Brainrot Studio** shelf of three
formats (cheating fruit, cheating cats, talking produce).

The premise behind it is that our bottleneck is not the models — it is the **blank prompt box**.
CinemaStudio can already generate a nine-shot vertical drama; nobody knows how to ask it to.
The formats that actually go viral have rigid, researched grammar (a specific look, a specific
eight-beat arc, a specific audio convention), and a user typing "strawberry drama" into an empty
field gets none of it. A template is that knowledge, written down and made executable.

### What the formats actually are (researched, not invented)

| Template | Origin | The thing that is easy to get wrong |
|---|---|---|
| **Фруктовая измена** | TikTok @trombonechef, 28 Feb 2026 — "cheating AI fruit" / "sad fruit story". ~25M views; spawned *Fruit Love Island* (300M+). | The look is **hyperreal macro**, not a cartoon: a photographically real strawberry with glossy human eyes and a mouth cut into the flesh. Rendering it in a cartoon style is a different (worse) product. |
| **Кошачья измена** | The 2024 "sad cat story" slideshows → the 2025–26 AI cat microdramas (@meowmeowaiart, Meow Story Time). | Photoreal **cat heads on human bodies** (veiny forearms, suits) — not cats on two legs. And it is **not** "Italian brainrot" (Ballerina Cappuccina et al., Mar 2025), which is a different genre with different grammar. Merging them produces neither. |
| **Говорящие фрукты** | Annoying Orange (2009) → the late-2025 AI revival driven by one-click lip-sync tooling. | The fruit stays **whole and intact** — no arms, no legs, no clothes. Give it a body and you have accidentally built the drama template. |

The dramas run on an **8-second beat grid** because that is what the video models generate
natively and what creators cut on. The canonical arc is eight beats plus a "PART 2" card —
serialization is the engine of the format, not a flourish.

### Four facts in the codebase decided most of this before any preference did

1. **A Film is three authored fields** (`title`, `aspectRatio`, `defaultStyleId`) and is created
   **empty**. A template therefore has almost nothing to say about the film and almost everything
   to say about its shots.
2. **`CreateShotInput` has every field optional.** A shot can be specified declaratively and
   completely — prompt, preset, duration, transition, title. The storyboard endpoint already
   proves the pattern: it loops `addShot` **server-side** and returns the drafts.
3. **There was no `shot.modelId`.** The video model was transient state inside the inspector,
   defaulting to `videoModels[0]` on every mount. So a template had nowhere to write down "this
   drama runs on Veo".
4. **The composition law** (`presets.ts`): the client sends structured ids, the **server** composes
   what the model sees. A template must not become a reason to break it.

## Decision

### 1. A template is CODE, and its prompts stay on the server

Templates live in `apps/api/src/modules/templates/catalog/*.ts` — one file per template — not in a
database table and not in the contracts package.

- **Not a DB table:** there is no author but us, no admin UI, and no migration worth writing.
  Code means the catalog is reviewable in a diff, type-safe, and — the part that matters —
  **testable against the model catalog** (see §3).
- **Not in `contracts`:** only a `TemplateSummary` crosses the wire — the *pitch* (name, beat
  sheet, prices, knobs), never the prose. Three reasons: the catalog is meant to grow to hundreds
  and the SPA should not carry every prompt; the prompts are the product and anything on the wire
  is public; and it keeps the composition law intact.

The prompts do become visible — as `shot.prompt`, editable, once the film exists. That is
deliberate: **a template is a starting point the user then owns.**

### 2. Applying a template is FREE

`POST /api/films/from-template` creates the film and **all** its shots in one transaction and
charges **zero credits**. Every shot lands as a draft (`generationId = null`) with its prompt,
preset, model, duration, title and spoken line filled in. The user reviews, edits, and presses
Generate **per shot** — which is where the credits go.

This is the load-bearing rule of the feature. A drama costs 448–1120 credits; a one-click
"apply" that spent them would be a trap, and a lie — the user has not seen the shots yet, and
the first thing anyone does with a template is change one beat.

**Rejected:** a "Generate all" button. It is the same trap with a better name. It can come back
later as an explicit, itemised confirmation step — not as the default path.

### 3. The price/quality TIER is the only thing that picks a model

A template names a model **per tier**, not one model:

| Tier | Model | 8 clips × 8s |
|---|---|---|
| Черновик | `pixverse-v6` | 448 cr |
| Стандарт | `wan-2-7` | 704 cr |
| Премиум | `veo-3-1-fast` | **1120 cr** |

The chosen tier's model is pinned onto every generated shot (`shot.modelId`).

Premium exists because **Veo 3.1 generates the dialogue audio itself** — and these formats *are*
dialogue. It is not an upsell; it is the version of the format that works.

**THE INVARIANT that makes the price honest:** every tier model must natively support the
template's aspect ratio **and every clip's duration**. If it does not, `composeShotClipInput`
silently snaps the duration to the nearest legal value — changing **both the cut the user was
shown and the price they were quoted**, behind their back. The three tier models were chosen
precisely because all three do **8s at 9:16**. This is asserted by `assertTemplatesValid()` at
**boot** (a bad template is a failed deploy, not a 500 the first user finds) and by
`modules/templates/templates.test.ts` in CI.

Prices are **computed from the live catalog**, never authored — an authored number goes stale the
first time a provider changes its rate.

### 4. Two new shot fields, and one on the audio track

| Field | Why it had to exist |
|---|---|
| `shot.modelId` | A template pins its tier here. It also fixes a pre-existing wart: the model choice used to die with the inspector, so re-selecting a shot forgot which model made its clip. The fallback chain is now `shot.modelId → STYLE_PRESETS[style].recommendedModelId → videoModels[0]` — that second step existed in contracts since day one and nothing read it. |
| `shot.voiceover` `{text, voice}` | These formats **are** talking characters; without a voice they are a silent slideshow. But `FilmAudio` requires a `generationId`, so a track cannot exist as a draft — a template had no way to hand over "here is what the strawberry says in beat 5" without first generating (and charging for) the TTS. This is that draft slot: free to hold, free to edit, becomes audio only when asked. |
| `film_audio.shotId` | Makes "voice this shot" a **replace**, not an append. Without it a second click adds a second overlapping line **and charges again**. It also lets the track list name a line by its beat instead of showing eight identical rows. |
| `film.templateId` | Provenance. Read back to pre-fill the audio panel with the template's music prompt — "melancholic soap-opera strings" is not something a user thinks to write, and it is most of the difference between sounding like the format and not. |

All four are nullable and additive; every existing row reads `NULL` and behaves exactly as before.

**Not done: lipsync.** No model in the catalog does it, and `createGenerationInput` has no field
for "an audio generation as an input". The mouth movement is whatever the video model hallucinates
from the prompt; the voice is mixed under it by ffmpeg. Veo's native audio is the real answer, and
it is why the premium tier exists.

### 5. Substitution has two modes, and mixing them up is silent

A knob option carries **three** strings: `label` (the picker), `prompt` (the **English** staging
fragment), `spoken` (the **Russian** noun).

- `{{var}}` in a **visual prompt** → `prompt`
- `{{var}}` in a **title or a voice line** → `spoken`

Because the video models are markedly better at English staging direction, while the TTS line and
the burned-in subtitle are Russian. Substituting one string into both gives you either a Russian
video prompt (worse footage) or an English subtitle (wrong product) — and **neither throws.**

A corollary: **free-text variables are never substituted into a visual prompt.** A user's Russian
sentence in a Veo prompt does not error, it just quietly makes the video worse; and an unbounded
user string reaching a paid prompt is a hole we would rather not have. Enforced by test.

The Russian **grammar is load-bearing** and worth knowing before editing a template:
`fruit-drama`'s `couple` options are all *feminine nominative* (клубника, вишня, малина) and its
`lover` options all *masculine nominative* (баклажан, банан, огурец) — which is what makes beat 5's
line, the verbatim catchphrase the trend is known by, decline correctly for every combination
without a grammar engine:

> «Я {{couple}}... ты {{couple}}... почему у нас родился {{lover}}?!»

Adding a neuter or feminine `lover` option silently breaks that line.

### 6. `Templates` is its own module and imports nothing from Cinema

`apps/web/src/modules/Templates`, route `/templates`. It creates a film through the API and
`navigate`s to `/cinema/$filmId`. The two meet only at the seams the codebase already uses:

- **the route** — `_shell.cinema.$filmId.tsx` reads `useTemplates()` and passes the list into
  `FilmEditor`, exactly as it already passes `useCatalog()`'s models (the `/create` pattern);
- **the shared query cache** — instantiation seeds `['film', id]` and invalidates `['films']`.

`CinemaLibrary`'s entry point is a plain `<Link to="/templates">`.

## Consequences

**Good**
- The blank-prompt problem is answered with executable knowledge, not a tutorial.
- The catalog scales to hundreds of templates: one file each, one line in the registry, zero
  bundle growth on the client (the `Templates` chunk is ~15 KB).
- `shot.modelId` fixes a real pre-existing bug and finally reads `recommendedModelId`.
- The price shown is arithmetic over the live catalog and cannot drift from what gets charged.

**Costs / risks**
- **Prompt rot.** Providers change; a prompt that produced hyperreal macro fruit in July may not
  in October. Templates need re-testing on a cadence, and there is no automated signal for
  "this template now produces garbage" — only the boot assertion, which catches structural
  breakage, not aesthetic breakage.
- **No previews.** `TemplateSummary.previewUrl` is nullable and currently `null`; the gallery
  renders a typographic card rather than a grey box pretending to be a video. Cards will sell
  substantially better once we render one real example per template. The seam is in place.
- **Category enum.** `templateCategorySchema` is `z.enum(['brainrot'])`. Adding a shelf is a
  deliberate contract change — correct while the catalog is small, worth revisiting past ~5.
- **Taste.** We are shipping, as a first-class product surface, formats whose defining traits are
  infidelity plots and deliberately-uncanny animals. That is what the owner asked for and what
  the audience is watching. It is a positioning choice, not an accident, and it should be a
  conscious one.

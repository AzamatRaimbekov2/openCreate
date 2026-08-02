# useNodeGeneration.ts — AI component doc

> AI-facing sidecar for `useNodeGeneration.ts`. Created 2026-07-29. Keep this in sync with the code on every change.

## Purpose
Turns one canvas node into a real generation: `buildRunInput` reads the node's config and its incoming wires into a `POST /api/generations` body, `useRunNode` submits it and appends the id to the node's version history, and `useNodeGeneration` polls that id to a terminal state. There is NO canvas-specific run endpoint — a node run is an ordinary generation, which is what keeps money, refunds and the Library feed unchanged (ADR canvas-mode D1).

## What it does (for an AI reader)
- Responsibilities: compose the request, gate un-runnable nodes, submit with a transient-only retry policy, seed/refresh the shared caches, poll while processing.
- Public API / exports / props / endpoints:
  - `findMediaParent(nodeId, nodes, edges) => CanvasNode | undefined` (pure) — the shared parent-lookup, factored out so `buildRunInput` and the node components (which also poll the parent's latest id for cache freshness) can never disagree on what counts as the media parent.
  - `findCharacterParent(nodeId, nodes, edges) => CanvasNode | undefined` (pure) — the same lookup for the OTHER input slot. Separate function, not a parameterized one, because the two slots are independent (`edgeRules` allows one of each on the same node) and produce different fields on the request body. Also used by `ImageNode` to decide whether to narrow its model list.
  - `buildRunInput(node, nodes, edges, generationStatus = {}) => CreateGenerationInput | null` (pure). `generationStatus` is a `Record<id, Generation['status'] | undefined>` snapshot the CALLER reads out of the shared query cache.
  - `useRunNode(nodeId)` → mutation over `POST /api/generations`.
  - `shouldRetrySubmit(failureCount, error)` and `absorbGeneration(queryClient, nodeId, generation)` — the submit POLICY and the post-submit side effects, exported for the branch runner (`useRunBranch`), which submits imperatively rather than through `useMutation`.
  - `useNodeGeneration(generationId | null)` → query over `GET /api/generations/:id`, key `['generation', id]`, 4 s interval while `processing`.
- Inputs → Outputs: a `CanvasNode` + the graph → a generation request; a generation id → its live `Generation`.
- Side effects (I/O, network, state): HTTP; `canvasStore.appendGeneration`; cache writes to `['generation', id]` and `['generations']`; invalidates `['me']` (balance).

## Dependencies
- Imports / depends on: `@tanstack/react-query`, contract types, `api`/`ApiClientError` from `shared/libs/apiClient`, `entityPlaceholderToken` from `shared/libs/mentions`, `./canvasStore`, `MEDIA_SOURCE_KINDS` from `./types`.
- Used by: `components/ImageNode.tsx` (and `VideoNode` through it), plus `model/useRunBranch.ts` — which reuses `buildRunInput`, both parent lookups, and the two exports above. The editor never runs nodes itself.

## Diagram
```mermaid
sequenceDiagram
  participant N as ImageNode / VideoNode
  participant B as buildRunInput
  participant M as useRunNode
  participant S as canvasStore
  participant Q as query cache
  N->>B: node + nodes + edges
  B-->>N: input | null (null disables Generate)
  N->>M: mutate(input)
  M->>Q: POST /api/generations
  Q-->>M: Generation
  M->>S: appendGeneration(nodeId, id)
  M->>Q: seed ['generation', id] · prepend ['generations'] · invalidate ['me']
  N->>Q: useNodeGeneration(latest id) polls 4s while processing
```

## Key decisions / gotchas
- The chain edge sends `inputGenerationId`, never image bytes: the SERVER resolves its own stored media. For an image model that citation is merged into the `referenceImages` channel and therefore COUNTS against the model's `referenceMode`/`maxReferenceImages` gate (image models have no `inputImage` path at all); for a video model it becomes the provider seed frame. Do not "simplify" the request shape on that assumption.
- **C2 fix-wave correction.** The FIRST version cited `generationIds[length-1]` with no status check — a child could cite a still-processing or a FAILED parent, sending a broken/empty reference into the provider call. `buildRunInput` now walks the parent's history from the newest entry and picks the first id whose `generationStatus[id] === 'succeeded'`; if none is, it returns `null` (Generate stays disabled). This is why the function grew a 4th parameter instead of reaching into the query cache itself — it stays pure and unit-testable with a plain object, and the CALLER (`ImageNode.tsx`) owns the cache read.
- A parent with no succeeded generation anywhere in its history — empty, still processing, or every attempt failed — returns `null`. The Generate button disables rather than submitting a chain into nothing.
- **F4 fix-wave correction.** `findMediaParent` used to exclude `'upload'` from its match even though `MEDIA_SOURCE_KINDS` includes it — so a node wired to an upload got `mediaParent === undefined`, the SAME result as an unwired node, and `buildRunInput` fell through to a plain t2i/t2v with no error and no disabled button. That charged the user for a run that silently ignored a wire they could see on the board. `findMediaParent` now matches uploads like any other media-kind parent, and `buildRunInput` explicitly returns `null` when `mediaParent.kind === 'upload'` — Generate disables with the exact same affordance as "connected but not yet succeeded". `edgeRules.ts` is untouched: the wire stays legal, it just isn't citable yet. Upload citation itself (turning the wire into a real `inputGenerationId`-equivalent) is phase 4's job.
- **The character wire (phase 3a) does TWO things, and the second is the easy one to forget.** A wired character adds `entityRefs: [{ placeholder: 'e1', entityId }]` AND puts `[[e1]]` in the prompt. Without the token the server substitutes nothing: the photo still conditions the image, but the character's name and description never reach the text encoder — a paid run that honours half of a wire the user can see on the board. So the token is PREPENDED when absent and left exactly where the user typed it when present (they may want the character mid-sentence: "a portrait of `[[e1]]` in the snow"). The placeholder key is the fixed constant `'e1'`, not a generated one, because both caps agree at exactly one: `edgeRules` allows a single character wire per node and the wire contract caps `entityRefs` at 1.
- A character parent with no `entityId` chosen yet returns `null` — the same law as an output-less media parent. The wire is visible on the board, so a run that silently drops it would charge for a different job than the graph shows.
- Both wires can be present at once: `inputGenerationId` + `entityRefs`. That costs TWO reference slots server-side (an image model's citation is merged into `referenceImages`), which `flux-kontext-pro` (max 2) allows. Models with no `referenceMode` at all are refused with a clean 400 before any charge — `ImageNode` narrows its picker to reference-capable models while a character is wired so that refusal is not reachable by an honest click.
- Retry is SUBMIT-only and allowlisted (5xx / rate_limited / provider_error / internal_error, max 2). A validation or insufficient-credits failure is final; retrying it would only re-cost the user. A bare network throw is NOT retried here — unlike Cinema's shot submit — because a dropped response may already have been charged.
- The poll key is `['generation', id ?? '']`, byte-identical to Cinema's `useShotGeneration`, so a generation open in the canvas and in the Library shares one cache entry and one interval.
- `appendGeneration` marks the store dirty, so a run is persisted by the ordinary autosave — no special save path for runs.
- **Phase 3b extraction.** `shouldRetrySubmit` became exported and the whole `onSuccess` body moved into `absorbGeneration`, because the branch runner needs the SAME four post-submit writes (history · seed the poll cache · prepend the Library feed · refresh the balance). A second copy of those is exactly how canvas runs would quietly stop appearing in the Library. Note what was NOT shared: a combined "submit with retries" helper. `useMutation` owns its own retry loop, so one shared submit function would retry twice under `useRunNode` — the POLICY is shared, the loop is not.

## Commits
- 5443372 2026-07-30 feat(canvas-web): node run submit + shared-cache polling
- 505a544 2026-07-30 fix(canvas): buildRunInput cites the newest SUCCEEDED parent (C2)
- (fix-wave) fix(canvas): F4 — a wired upload parent disables Generate instead of silently running a plain t2i/t2v
- 87c6d3c 2026-07-30 feat(canvas-web): character node — a Soul character as a wired reference
- cfd1df7 2026-07-30 feat(canvas-web): run branch — toposorted queue behind one confirmed spend

## Update 2026-08-02 — `composeNodePrompt` (the shared-prompt wire)

- New exports: `findPromptParent` (the third parent lookup, beside media and character)
  and **`composeNodePrompt(node, nodes, edges)`** — the single answer to "what is this
  node's prompt", used by `buildRunInput` here, `blockerFor` in `useRunBranch`, and the
  card's hint. ADR `canvas-prompt-node` D3: a second opinion anywhere shows a disabled
  Generate over a runnable job, or charges for text the user never read.
- The join is `[template, own].filter(Boolean).join('\n')` — merge (not replace, or every
  child would be identical), template first (it is the upstream card; the text must read
  the way the board looks), newline (inventing `', '` is how a template ending in a comma
  yields `neon city,, a fox`). An empty side contributes no separator.
- `buildRunInput`'s length guard now measures the COMPOSED text, so a node fed by a
  template is runnable with an empty field of its own. The character token is prepended to
  that composed string, so `[[e1]]` still leads what the server receives.

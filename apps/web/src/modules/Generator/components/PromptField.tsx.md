# PromptField.tsx — AI component doc

> AI-facing sidecar for `PromptField.tsx`. Created 2026-07-07 (stage 3 editorial
> redesign). Keep this in sync with the code on every change.

## Purpose

The commission sheet's prompt group (v3 terminal): quiet mono caption + steel
filled textarea (8px radius). Extracted from `GeneratorPanel` during the stage-3
restyle to keep the panel under the 200-line component cap.

## What it does (for an AI reader)

- Responsibilities: render the labelled prompt textarea in the v3 surface-step
  field treatment; forward keystrokes to the store action.
- Public API / exports / props / endpoints: `PromptField({ value, onChange })`,
  `PromptFieldProps`.
- Inputs → Outputs: `value` (draft prompt) → controlled textarea; `onChange(prompt)`
  on every keystroke.
- Side effects (I/O, network, state): none — `useId` only wires label→textarea.

## Dependencies

- Imports / depends on: `react` (useId), `react-i18next`.
- i18n keys: `generator.prompt.label`, `generator.prompt.placeholder`.
- Used by: `GeneratorPanel.tsx` (the "prompt" sheet field).

## Diagram

```mermaid
flowchart LR
  GS[generatorStore prompt] --> PF[PromptField]
  PF -->|onChange| SET[setPrompt]
  PF --> L[mono caption label] --> TA[steel textarea]
```

## Key decisions / gotchas

- shared/ui `Input` only ships an `<input>`; this is its textarea twin with the SAME
  v3 recipe (`bg-steel rounded-lg border-white/10`, focus → `border-portal`).
  If a second module ever needs a textarea, promote a shared `Textarea` instead of
  copying this again (design.md §10 governance).
- v3 dropped the v2 underline/uppercase treatment (fields must be surface steps on
  a dark theme) — the label TEXT is unchanged, so `getByLabelText(/prompt/i)` still
  matches the i18n string.

## Commits

- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
- (pending) restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs

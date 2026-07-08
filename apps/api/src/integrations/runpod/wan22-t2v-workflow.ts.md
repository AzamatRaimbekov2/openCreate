# wan22-t2v-workflow.ts — AI component doc

> AI-facing sidecar for `wan22-t2v-workflow.ts`. Created 2026-07-08. Keep this in sync with the code on every change.

## Purpose
The Wan 2.2 text→video ComfyUI workflow (API format), embedded as a TS object so it ships with the esbuild bundle (no runtime fs read). The API-side copy of the pod owner's canonical `spikes/wan-runpod/worker/workflows/wan22_t2v.json`.

## What it does (for an AI reader)
- Responsibilities: hold the graph the comfy-client templates and submit; provide the frame-count helper.
- Public API / exports: `WAN22_T2V_WORKFLOW: ComfyWorkflow`, `type ComfyNode`, `type ComfyWorkflow`, `WAN_FPS = 16`, `framesForDuration(sec) = sec*16 + 1`.
- Inputs → Outputs: static data; `framesForDuration` maps clip seconds → ComfyUI latent `length`.
- Side effects: none.

## Dependencies
- Imports / depends on: nothing.
- Used by: `comfy-client.ts` (default workflow + `framesForDuration`).

## Diagram
```mermaid
flowchart LR
  wf[WAN22_T2V_WORKFLOW] --> comfy[comfy-client.submit]
```

## Key decisions / gotchas
- The comfy-client injects by node `_meta.title` — the load-bearing titles are `PROMPT_POSITIVE`, `PROMPT_NEGATIVE`, `LATENT_DIMS`, `SAMPLER_HIGH`, `SAMPLER_LOW`, `OUTPUT_VIDEO`. Node ids can change upstream; keep the TITLES stable.
- Wan 2.2 = 16fps; `length = duration_s*16 + 1` (leading keyframe). Two-expert (high/low noise) refiner — both samplers share one seed.
- This is a COPY; sync it when the pod owner changes the canonical spike workflow.

## Commits
- _no commit yet_

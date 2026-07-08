---
type: spike
status: proposed
updated: 2026-07-08
sources:
  - RunPod-serverless Wan 2.2 worker + cost model + spike design — 2026-07-08
tags:
  - project-docs
  - wiki/spike
  - video-generation
  - cost
  - feasibility
---

# Spike: Wan 2.2 on RunPod serverless — feasibility (< $5, measurable)

Companion to the ADR [[wan-selfhost-video-provider]]. **No production code and no catalog exposure result from this spike** — it produces four measured numbers and one quality judgement that decide whether the ADR proceeds.

## Goal

Resolve the **single unknown** the arithmetic cannot: real **cold-start seconds `C`** and real **warm gen seconds `G`** on the chosen GPU running **our exact stack** — FP8/GGUF Wan 2.2 A14B + SageAttention INT8 + TeaCache, loading weights from a **100GB network volume** — plus the real **$/clip from actual RunPod billing** and a **quality sample vs Seedance**. Everything else in the cost model is arithmetic on already-verified rates; only `C`, `G`, real per-second flex rate, and quality need measuring.

**Mechanism (no guesswork):** RunPod's job response already returns `delayTime` (queue + cold, ms) = **`C`** and `executionTime` (handler runtime, ms) = **`G`**, directly.

## What we are measuring

| Symbol | Meaning | How it is read |
|---|---|---|
| `C` | Cold-start seconds (container + CUDA + weight load into VRAM from network volume) | `delayTime` on the first (cold) job |
| `G` | Warm generation seconds | `executionTime` on the second (warm) job |
| `$/clip` | Real per-clip cost | `executionTime × serverless flex per-second rate`, cross-checked against RunPod usage billing |
| Quality | Wan 2.2 A14B FP8 vs Seedance 1.5 Pro | Same prompt + seed, 720p 5s, human/LLM side-by-side (motion coherence, prompt adherence, artifacts, faces/hands) |
| VRAM fit | Does FP8 A14B pair + T5 + 720p frames + optimizations fit 24GB? | OOM or not on the 4090 |

## Steps

1. **Provision a 100GB network volume** in a region that has **both** RTX 4090 and H100 capacity.
2. **One-time weight download (~$0.30):** launch a cheap on-demand 4090 pod, run `bootstrap_volume.sh` to download Wan 2.2 A14B **FP8** (t2v + i2v experts) + T5-XXL fp8 + VAE + CLIP-vision onto the volume (~30–60 min). This is the mechanism that avoids re-downloading ~30GB on every cold start.
3. **Deploy** the `runpod-workers/worker-comfyui` serverless endpoint pointed at the volume with our Wan 2.2 workflow JSON; **min-workers = 0** (true cold start), **FlashBoot ON**.
4. **Clip #1 — COLD:** fire one job → record `delayTime` (= `C`) and `executionTime` (= `G`).
5. **Clip #2 — WARM:** fire immediately after → `executionTime` = pure `G` (no cold penalty).
6. **Clip #3 — H100 PCIe:** fire one clip on an H100 PCIe endpoint → compare `G` and `$/clip` (fallback tier).
7. **Real $:** pull actual spend from RunPod usage; compute `$/clip = executionTime × serverless rate` and confirm the real **flex per-second premium** over the community-pod hourly rate.
8. **Quality:** same prompt + seed, 720p 5s, **side-by-side Wan vs the Seedance reference clip** — judge motion coherence, prompt adherence, artifacts, faces/hands.

**Budget:** ~$0.30 bootstrap pod + ~4–6 clips ($0.01–0.15 each) + ~$0.20 prorated volume = **well under $5.**

## Go / No-Go gates

**GO — proceed to implement the ADR — if ALL hold:**
- Warm `G ≤ 180s` on 4090 (fits the 5-min budget with cold + upload headroom), AND
- Blended `$/clip ≤ $0.05` on 4090 serverless (real billing), AND
- Cold start `C ≤ 90s`, AND
- Quality **≥ Seedance** on the reference prompt.

**ESCALATE-TO-H100 (conditional)** if: 24GB **OOMs** at 720p + optimizations, OR FP8-on-4090 quality is unacceptable → re-test on **H100 PCIe**; proceed **only if `$/clip` stays < $0.13** (any margin over the baseline).

**NO-GO — stay on Seedance, revisit as Wan tooling/quant matures — if ANY:**
- Warm `G > 240s` on **both** tiers (blows the latency budget), OR
- `$/clip ≥ $0.13` on the cheapest working tier (no cost edge over Seedance), OR
- Quality **clearly below** Seedance.

## What the user must provide

Accounts and keys are the user's to create; the spend stays under $5.

1. **RunPod account + API key + ~$10 credit** (we spend < $5).
2. **An S3/R2 bucket + credentials** for the presigned-PUT delivery — or use RunPod's S3-compatible network storage **for the spike only**.
3. **One Seedance reference clip** (same prompt) for the quality comparison.
4. **Preferred region** (GPU availability varies by region; the volume pins the endpoint to it).

## Worker + delivery design under test (context, not built here)

- **Pipeline:** ComfyUI headless/API mode (not diffusers) — the Wan 2.2 optimization stack (SageAttention INT8, TeaCache, FP8/GGUF loaders, block-swap, VAE tiling, I2V first-frame conditioning) ships as maintained ComfyUI custom nodes (kijai WanVideoWrapper + native Wan nodes) months ahead of diffusers parity, and `worker-comfyui` already implements the `/run`+`/status` + S3-upload + network-volume contract. We author a thin workflow JSON + handler wrapper.
- **Image:** RunPod CUDA 12.4+/PyTorch 2.4+ base, Python 3.11, ComfyUI + custom nodes **pinned to commits**, SageAttention + flash-attn prebuilt as wheels into the image. **Weights are NOT baked** — they live on the network volume, mounted read-only.
- **Quant:** FP8 (e4m3) primary (near-FP16 quality, ~2x VRAM saving, hardware-accelerated FP8 matmul on Ada); GGUF Q8_0 as the VRAM-safety fallback; avoid Q4/Q5 as default (temporal-coherence loss).
- **GPU:** target RTX 4090 — the only tier whose $/clip decisively beats $0.13; 24GB fits the FP8 pair + offloaded T5 with block-swap; slower gen is acceptable for a 5-min async budget. H100 is a quality/VRAM fallback only.
- **Delivery:** worker uploads the finished MP4 **directly to our object store** via a presigned PUT we mint at submit; `/status` returns only the object key. **Not base64** (RunPod's ~20MB serverless response cap + bloat), **not a RunPod URL** (extra download + SSRF-allowlist widening). Presigned PUT keeps the asset in our store from birth with zero extra egress, and the poll `success` path can skip `saveFromUrl`.
- **Lifecycle fit:** RunPod `/run` job id = our `provider_job_id`; submit = `POST /run` (route already answers 202); poll = `GET /status`, mapping `IN_QUEUE`/`IN_PROGRESS` → processing, `COMPLETED` → success, `FAILED`/`TIMED_OUT` → error, into the neutral `VideoPollResult`. The charge → submit → poll → settle/refund lifecycle, stale sweep, NSFW gate, and idempotent refund are **unchanged** — a `RunpodWan` provider is injected via the registry keyed off the catalog.

## Risks this spike is designed to surface

- `C` large + sparse traffic (every clip pays cold) or `G` over gate → economics/latency case weakens. **Primary target.**
- 24GB too tight for FP8 pair + T5 + 720p + optimizations → OOM → GGUF Q8 (quality loss) or H100 (kills cost edge).
- Real serverless **flex** per-second rate is a premium (~1.3–1.8x historically) over the community hourly rates — measured in step 7.
- Wan 2.2 A14B FP8 quality may fall below Seedance 1.5 Pro on our prompts — a hard NO-GO, judged on a real side-by-side, not specs.
- Regional GPU availability: pinning to the volume's region can starve capacity at peaks (queue `delayTime` grows).

## Decision hook

On **GO**, this spike's measured `$/clip` sets the credit price of the `wan-2-2` catalog entry (so the credit→USD margin is intentional), and the ADR [[wan-selfhost-video-provider]] moves from Proposed to Accepted. On **NO-GO**, the ADR is parked and we stay Runware-only. LTX-2.3 (cheaper/faster/lower-quality) can be benchmarked on the same worker seam as a follow-up alternative target.

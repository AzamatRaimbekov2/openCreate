# Wan 2.2 on RunPod Serverless — Feasibility Spike

A **self-contained** feasibility spike. It is **not** production integration — nothing here touches `apps/` or `packages/`, and no catalog entry ships. Its only job is to produce four measured numbers + one quality sample that decide the go/no-go in the ADR
[`docs/wiki/decisions/wan-selfhost-video-provider.md`](../../docs/wiki/decisions/wan-selfhost-video-provider.md)
(plan: [`docs/wiki/spikes/wan-runpod-feasibility-spike.md`](../../docs/wiki/spikes/wan-runpod-feasibility-spike.md)).

You deploy and run these artifacts on your own RunPod account; this repo cannot run them (no GPU/account here).

## What gets measured

| Symbol | Meaning | Source |
|---|---|---|
| `C` | cold-start seconds (container + CUDA + weight load from network volume) | RunPod `delayTime` on the first (cold) job |
| `G` | warm generation seconds | RunPod `executionTime` on the warm job |
| `$/clip` | real per-clip cost | `(C+G) × your per-second rate`, cross-checked vs RunPod usage billing |
| quality | Wan 2.2 A14B FP8 vs Seedance 1.5 Pro | manual side-by-side of `measure/out/*.mp4` |

`measure/run.py` reads `delayTime`/`executionTime` straight off the job, so the handler never times cold start itself.

## What YOU must provide (the only inputs)

1. **RunPod account + API key + ~$10 credit** (the spike spends **< $5**).
2. **An S3 or Cloudflare R2 bucket + access key/secret** for the presigned-PUT delivery.
3. **One Seedance reference clip** (same prompt/seed) for the manual quality comparison.
4. **A preferred region** that has **both** RTX 4090 and H100 capacity (the network volume pins the endpoint to one region).
5. *(optional)* a seed image if you want the i2v clip measured too.

## Repo layout

```
spikes/wan-runpod/
  worker/                    # what you deploy to RunPod
    Dockerfile               # CUDA+PyTorch+ComfyUI+Wan nodes; weights NOT baked
    handler.py               # RunPod handler: run Wan → NSFW-classify → presigned PUT → return {assetUrl,nsfw,genSeconds}
    workflows/               # wan22_t2v.json, wan22_i2v.json (injected by node TITLE)
    bootstrap_volume.sh      # ONE-TIME ~28GB weight download onto the network volume
    models.txt               # FP8 model manifest (Comfy-Org repack)
    extra_model_paths.yaml   # maps ComfyUI → /runpod-volume weights
    requirements.txt
  measure/                   # what you run locally
    run.py                   # mints presigned URLs, submits jobs, records C/G/$/clip, prints verdict
    requirements.txt         # only requests + boto3
  .env.example
  README.md  (this file)
```

## Runbook

### (a) Create the network volume + endpoints on RunPod
1. **Network volume:** RunPod → Storage → **100 GB**, in a region with **both** 4090 and H100 stock. (~$5–7/mo; prorate ≈ $0.20 for the spike.)
2. **Build + push the worker image:** from `worker/`,
   ```bash
   # pin the refs to verified commits first (see Dockerfile ARGs), then:
   docker build -t <your-registry>/wan-runpod-spike:0.1 .
   docker push <your-registry>/wan-runpod-spike:0.1
   ```
3. **4090 endpoint:** RunPod → Serverless → New Endpoint from that image. GPU tier **RTX 4090**, **min workers = 0** (true cold start), **FlashBoot ON**, attach the network volume (mounts at `/runpod-volume`). Note the **endpoint id** and the **$/s flex rate** shown.
4. *(optional)* **H100 endpoint:** repeat with **H100 PCIe** for the fallback test; note its id + rate.

### (b) Load the Wan 2.2 weights onto the volume ONCE (~$0.30)
Launch a cheap on-demand pod with the SAME volume attached, then:
```bash
# on the pod, with the repo's worker/ dir available:
VOLUME_ROOT=/workspace ./bootstrap_volume.sh    # pods mount the volume at /workspace
```
This downloads ~28 GB of FP8 weights (t2v+i2v experts, UMT5-XXL, VAE, CLIP-vision) into `/workspace/ComfyUI/models/...`. Terminate the pod when done. Cold starts now load weights from the volume instead of re-downloading.

### (c) Bucket + presign setup
- Create the bucket. **CORS is NOT required** — the worker PUTs server-to-server with a presigned URL (CORS only applies to browser uploads).
- Ensure the access key can `PutObject`/`GetObject` on the bucket.
- The client mints a **short-TTL presigned PUT** per job; the worker never receives bucket credentials.
- For a shareable public link, optionally set `S3_PUBLIC_BASE_URL` (custom domain / R2 public bucket).

### (d) Configure env
```bash
cd spikes/wan-runpod
cp .env.example .env      # fill RunPod key + endpoint id(s), bucket creds, and the REAL $/s rate
python -m venv .venv && source .venv/bin/activate
pip install -r measure/requirements.txt
```

### (e) Run the measurement
```bash
set -a; source .env; set +a
python measure/run.py
```
It fires **cold-t2v → warm-t2v** back-to-back (so job #1 pays cold start and job #2 is pure warm), plus **i2v** if you set a seed image, plus **H100** if you set that endpoint. Each mp4 lands in `measure/out/`.

### (f) Read the verdict
The script prints a results table and one of:
- **GO (pending manual quality ≥ Seedance)** — every measurable 4090 gate passed. Confirm quality on `out/*.mp4`, then the ADR moves Proposed→Accepted and this `$/clip` seeds the `wan-2-2` catalog credit price.
- **ESCALATE→H100** — the 4090 OOM'd or failed at 720p+optimizations; proceeds only if H100 `$/clip < $0.13`.
- **NO-GO** — warm `G` > 240s on the only working tier, or `$/clip ≥ $0.13`. Stay on Seedance/Runware; park the ADR.
- **INCONCLUSIVE** — a measurable gate failed but it is not an automatic NO-GO; review the per-gate lines.

**Gates checked automatically (4090):** warm `G ≤ 180s` · cold `C ≤ 90s` · blended `$/clip ≤ $0.05`. **Quality ≥ Seedance is MANUAL** — the script flags it; a final GO requires you to confirm it.

### (g) Teardown (stop billing)
1. **Serverless endpoints:** set min & max workers to 0 or delete them (serverless idles free, but delete to be safe).
2. **Terminate** any on-demand bootstrap pod (should already be done after step b).
3. **Network volume:** the only lingering cost (~$5–7/mo). Delete it once you have your numbers, or keep it if you expect to proceed.

## Cost ceiling
Bootstrap pod ~$0.30 + 3–4 clips ($0.01–0.15 each) + prorated volume ~$0.20 = **well under $5.** The volume is the only recurring charge; delete it at teardown.

## Decisions baked into this spike (with rationale)
- **ComfyUI, not diffusers** — the Wan 2.2 optimization stack (FP8/GGUF, SageAttention INT8, TeaCache, block-swap) ships as maintained ComfyUI nodes months ahead of diffusers parity (spike plan §"Worker + delivery design").
- **Custom `handler.py`, not stock `worker-comfyui`** — stock does neither NSFW screening (ADR §6 hard prerequisite) nor presigned-PUT delivery.
- **GPU: RTX 4090 primary** — the only tier whose `$/clip` decisively beats Seedance's $0.13; H100 PCIe is a quality/VRAM fallback only.
- **Quant: FP8 (e4m3)** primary (near-FP16 quality, hardware-accelerated on Ada); GGUF Q8_0 is the VRAM-safety fallback if 24 GB OOMs.
- **Delivery: presigned PUT to our bucket** — not base64 (RunPod's ~20 MB response cap) and not a RunPod URL (extra download + SSRF-allowlist widening).
- **Injection by node title** — `handler.py` sets prompt/dims/seed/image by `_meta.title`, so you can swap in ComfyUI's shipped Wan 2.2 template and only need to title five nodes (`PROMPT_POSITIVE`, `PROMPT_NEGATIVE`, `LATENT_DIMS`, `INPUT_IMAGE`, `OUTPUT_VIDEO`).

## Risks / unknowns before you spend money
- **The workflow JSON node class_types drift.** `wan22_t2v.json`/`wan22_i2v.json` are best-effort against native Wan 2.2 nodes (July 2026). If ComfyUI rejects a node, open the shipped Wan 2.2 template in the ComfyUI UI, re-export as **API format**, and re-apply the five titles — the handler is title-driven, so no code change is needed. **Validate the workflow in the ComfyUI UI on your bootstrap pod before deploying serverless.**
- **HF paths can move.** If `bootstrap_volume.sh` 404s, update the paths in `models.txt` (filenames are the stable part).
- **VRAM.** FP8 A14B pair + UMT5 + 720p frames may be tight on 24 GB → OOM → verdict ESCALATE→H100 (or switch to GGUF Q8 loaders). This is exactly a gate the spike surfaces.
- **Flex rate premium.** Set the REAL per-second rate in `.env`; the default is the community rate and reads optimistically.
- **Optimizations are non-fatal in the image.** If SageAttention/flash-attn wheels fail to build, the worker still runs (slower) — warm `G` may then miss the gate for a fixable reason, not a fundamental one.
- **NSFW default-deny.** If frames can't be read or the classifier errors, the handler returns `nsfw=true` (blocks rather than leaks); a surprising `nsfw=true` on clean content may just mean frame extraction failed — check worker logs.

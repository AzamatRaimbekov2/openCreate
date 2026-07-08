#!/usr/bin/env python3
"""Wan 2.2 RunPod feasibility measurement harness (standalone — only `requests`+`boto3`).

WHAT IT DOES
  For each test clip it mints a short-TTL presigned PUT (+ a presigned GET for our
  own download), submits a job to a RunPod serverless endpoint, polls /status, and
  records the two numbers the ADR cost model cannot derive:
      delayTime      → C  (cold-start seconds: container + CUDA + weight load)
      executionTime  → G  (warm generation seconds)
  It computes $/clip from the real per-second rate, downloads each mp4 for the
  quality comparison, then evaluates the ADR go/no-go gates and prints a verdict.

CONTRACT (MUST match worker/handler.py — single source of truth lives in its docstring)
  submit input : {prompt,width,height,duration,fps,seed?,steps?,inputImage?,putUrl,objectKey}
  read  output : {assetUrl(==objectKey),nsfw,genSeconds,width,height,numFrames,seed}

SECURITY
  Secrets (RunPod key, bucket creds) come ONLY from env — never hardcoded/committed.
  The worker receives a presigned PUT, never bucket creds. Presigned URLs are never
  printed in full (query string carries the signature).

USAGE
  cp ../.env.example ../.env   # fill it in
  set -a; source ../.env; set +a
  python run.py
"""

from __future__ import annotations

import base64
import mimetypes
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import boto3
import requests
from botocore.config import Config

# ── ADR go/no-go thresholds (docs/wiki/spikes/wan-runpod-feasibility-spike.md) ──
GATE_WARM_G_MAX_S = 180.0      # GO needs warm G ≤ 180s on 4090
GATE_COLD_C_MAX_S = 90.0       # GO needs cold C ≤ 90s
GATE_COST_MAX_USD = 0.05       # GO needs blended $/clip ≤ $0.05
NOGO_WARM_G_S = 240.0          # NO-GO if warm G > 240s on the cheapest working tier
NOGO_COST_USD = 0.13           # NO-GO if $/clip ≥ $0.13 (no edge over Seedance)
H100_COST_CEILING_USD = 0.13   # ESCALATE→H100 proceeds only if H100 $/clip < $0.13

POLL_INTERVAL_S = 4            # mirror the SPA's 4s cadence
POLL_TIMEOUT_S = 1800          # 30 min hard ceiling per job
PRESIGN_PUT_TTL_S = 1800
PRESIGN_GET_TTL_S = 3600
OUT_DIR = Path(__file__).parent / "out"


def _env(name: str, required: bool = True, default: str | None = None) -> str | None:
    val = os.environ.get(name, default)
    if required and not val:
        sys.exit(f"ERROR: required env var {name} is not set (see .env.example)")
    return val


def _redact(url: str) -> str:
    return url.split("?", 1)[0] + "?<redacted-signature>" if "?" in url else url


# ── Bucket / presign (boto3 works for both AWS S3 and Cloudflare R2) ────────────
def make_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=_env("S3_ENDPOINT_URL", required=False),  # set for R2; unset = AWS
        region_name=_env("S3_REGION", required=False, default="auto"),
        aws_access_key_id=_env("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=_env("S3_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4"),
    )


def presign_pair(s3, bucket: str, key: str) -> tuple[str, str]:
    put_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": "video/mp4"},
        ExpiresIn=PRESIGN_PUT_TTL_S,
        HttpMethod="PUT",
    )
    get_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=PRESIGN_GET_TTL_S,
    )
    return put_url, get_url


# ── RunPod submit + poll ────────────────────────────────────────────────────
def submit(endpoint: str, api_key: str, job_input: dict) -> str:
    r = requests.post(
        f"https://api.runpod.ai/v2/{endpoint}/run",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"input": job_input},
        timeout=30,
    )
    r.raise_for_status()
    jid = r.json().get("id")
    if not jid:
        sys.exit(f"ERROR: RunPod did not return a job id: {r.text[:300]}")
    return jid


def poll(endpoint: str, api_key: str, job_id: str) -> dict:
    """Poll /status until terminal. Retries transient network/5xx; returns the final body."""
    url = f"https://api.runpod.ai/v2/{endpoint}/status/{job_id}"
    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.time() + POLL_TIMEOUT_S
    while time.time() < deadline:
        try:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code >= 500:
                time.sleep(POLL_INTERVAL_S)
                continue
            r.raise_for_status()
            body = r.json()
            status = body.get("status")
            if status in ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"):
                return body
            print(f"    …{status} (delayTime={body.get('delayTime')}ms)")
        except requests.RequestException as e:
            print(f"    transient poll error, retrying: {e}")
        time.sleep(POLL_INTERVAL_S)
    return {"status": "CLIENT_TIMEOUT"}


# ── One measured clip ────────────────────────────────────────────────────────
@dataclass
class Result:
    label: str
    tier: str
    status: str
    cold_c_s: float = 0.0        # delayTime → C
    warm_g_s: float = 0.0        # executionTime → G
    gen_seconds: float = 0.0     # handler's own timing (cross-check)
    warm_cost_usd: float = 0.0   # executionTime × rate
    full_cost_usd: float = 0.0   # (delayTime+executionTime) × rate  (worst-case, sparse)
    nsfw: bool | None = None
    oom: bool = False
    mp4_path: str = ""
    error: str = ""


def run_clip(label: str, tier: str, endpoint: str, api_key: str, rate: float,
             s3, bucket: str, public_base: str | None, job_input_base: dict) -> Result:
    key = f"renders/spike-{uuid.uuid4().hex}.mp4"
    put_url, get_url = presign_pair(s3, bucket, key)
    job_input = {**job_input_base, "putUrl": put_url, "objectKey": key}

    print(f"\n[{label}] tier={tier} → submitting (key={key})")
    jid = submit(endpoint, api_key, job_input)
    print(f"[{label}] job id {jid}; polling…")
    body = poll(endpoint, api_key, jid)

    status = body.get("status", "UNKNOWN")
    res = Result(label=label, tier=tier, status=status)
    res.cold_c_s = round(body.get("delayTime", 0) / 1000, 2)
    res.warm_g_s = round(body.get("executionTime", 0) / 1000, 2)
    res.warm_cost_usd = round(res.warm_g_s * rate, 4)
    res.full_cost_usd = round((res.cold_c_s + res.warm_g_s) * rate, 4)

    if status != "COMPLETED":
        err = str(body.get("error", body))
        res.error = err[:400]
        res.oom = "out of memory" in err.lower() or "cuda oom" in err.lower() or "outofmemory" in err.lower()
        print(f"[{label}] NOT completed: {status} — {res.error}")
        return res

    out = body.get("output") or {}
    # Contract self-check: handler must echo objectKey as assetUrl.
    if out.get("assetUrl") != key:
        res.error = f"CONTRACT MISMATCH: assetUrl={out.get('assetUrl')!r} != objectKey={key!r}"
        print(f"[{label}] {res.error}")
    res.nsfw = out.get("nsfw")
    res.gen_seconds = float(out.get("genSeconds") or 0.0)

    OUT_DIR.mkdir(exist_ok=True)
    res.mp4_path = str(OUT_DIR / f"{label}.mp4")
    try:
        dl = requests.get(get_url, timeout=300)
        dl.raise_for_status()
        Path(res.mp4_path).write_bytes(dl.content)
        print(f"[{label}] done C={res.cold_c_s}s G={res.warm_g_s}s nsfw={res.nsfw} "
              f"${res.full_cost_usd} → {res.mp4_path} ({len(dl.content)} bytes)")
        if public_base:
            print(f"[{label}] public URL: {public_base.rstrip('/')}/{key}")
    except requests.RequestException as e:
        res.error = f"download failed via {_redact(get_url)}: {e}"
        print(f"[{label}] {res.error}")
    return res


# ── Verdict ──────────────────────────────────────────────────────────────────
def verdict(results: list[Result]) -> None:
    print("\n" + "=" * 78)
    print("RESULTS")
    print("=" * 78)
    hdr = f"{'clip':<18}{'tier':<12}{'status':<11}{'C(cold)s':>9}{'G(warm)s':>9}{'gen s':>8}{'$/clip':>9}{'nsfw':>6}"
    print(hdr)
    print("-" * 78)
    for r in results:
        print(f"{r.label:<18}{r.tier:<12}{r.status:<11}{r.cold_c_s:>9}{r.warm_g_s:>9}"
              f"{r.gen_seconds:>8}{r.full_cost_usd:>9}{str(r.nsfw):>6}")
    print("-" * 78)

    r4090 = [r for r in results if r.tier == "4090"]
    ok4090 = [r for r in r4090 if r.status == "COMPLETED"]
    cold = next((r for r in r4090 if r.label.startswith("cold")), None)
    warm = next((r for r in r4090 if r.label.startswith("warm")), None)
    h100 = [r for r in results if r.tier == "H100" and r.status == "COMPLETED"]
    oom = any(r.oom for r in r4090)

    g_warm = warm.warm_g_s if warm and warm.status == "COMPLETED" else None
    c_cold = cold.cold_c_s if cold and cold.status == "COMPLETED" else None
    blended = round(sum(r.full_cost_usd for r in ok4090) / len(ok4090), 4) if ok4090 else None

    def gate(name: str, ok: bool | None, detail: str) -> bool:
        mark = "PASS" if ok else ("FAIL" if ok is False else "N/A ")
        print(f"  [{mark}] {name}: {detail}")
        return ok is True

    print("\nADR GATES (4090):")
    g1 = gate("warm G ≤ 180s", None if g_warm is None else g_warm <= GATE_WARM_G_MAX_S,
              f"measured {g_warm}s" if g_warm is not None else "no warm clip completed")
    g2 = gate("cold C ≤ 90s", None if c_cold is None else c_cold <= GATE_COLD_C_MAX_S,
              f"measured {c_cold}s" if c_cold is not None else "no cold clip completed")
    g3 = gate("blended $/clip ≤ $0.05", None if blended is None else blended <= GATE_COST_MAX_USD,
              f"measured ${blended}" if blended is not None else "no completed 4090 clips")
    print("  [MANUAL] quality ≥ Seedance: compare out/*.mp4 to your Seedance reference "
          "(motion coherence, prompt adherence, artifacts, faces/hands)")

    cheapest_working_cost = None
    if blended is not None:
        cheapest_working_cost = blended
    elif h100:
        cheapest_working_cost = round(sum(r.full_cost_usd for r in h100) / len(h100), 4)

    print("\nVERDICT:")
    nogo_reasons = []
    if g_warm is not None and g_warm > NOGO_WARM_G_S and not h100:
        nogo_reasons.append(f"warm G {g_warm}s > {NOGO_WARM_G_S}s on the only tier tested")
    if cheapest_working_cost is not None and cheapest_working_cost >= NOGO_COST_USD:
        nogo_reasons.append(f"$/clip ${cheapest_working_cost} ≥ ${NOGO_COST_USD} (no edge over Seedance)")

    if nogo_reasons:
        print("  NO-GO — " + "; ".join(nogo_reasons))
        print("  → stay on Seedance/Runware; park the ADR and revisit as Wan tooling matures.")
    elif oom or (g_warm is None and not h100):
        print("  ESCALATE→H100 — 4090 OOM'd or failed at 720p+opts.")
        if h100:
            hcost = round(sum(r.full_cost_usd for r in h100) / len(h100), 4)
            ok = hcost < H100_COST_CEILING_USD
            print(f"  H100 measured ${hcost} — {'PROCEED (< $0.13)' if ok else 'NO-GO (≥ $0.13, no edge)'}")
        else:
            print("  → re-run with RUNPOD_ENDPOINT_ID_H100 set to test the H100 PCIe fallback.")
    elif g1 and g2 and g3:
        print("  GO (pending manual quality ≥ Seedance) — all measurable 4090 gates PASS.")
        print("  → confirm quality on out/*.mp4, then move the ADR Proposed→Accepted; "
              "this blended $/clip seeds the wan-2-2 catalog credit price.")
    else:
        print("  INCONCLUSIVE — a measurable gate FAILED but it is not an automatic NO-GO.")
        print("  → review the per-gate lines above; likely ESCALATE→H100 or a config/tuning issue.")
    print("=" * 78)


# ── Main ─────────────────────────────────────────────────────────────────────
def build_i2v_input() -> str | None:
    """Return a data-uri (preferred) or https URL for the i2v seed image, or None to skip i2v."""
    path = os.environ.get("I2V_IMAGE_PATH")
    url = os.environ.get("I2V_IMAGE_URL")
    if path:
        p = Path(path)
        if not p.is_file():
            print(f"WARNING: I2V_IMAGE_PATH {path} not found; skipping i2v clip")
            return None
        mime = mimetypes.guess_type(path)[0] or "image/png"
        return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"
    return url  # may be None → i2v skipped


def main() -> None:
    api_key = _env("RUNPOD_API_KEY")
    ep_4090 = _env("RUNPOD_ENDPOINT_ID")
    ep_h100 = _env("RUNPOD_ENDPOINT_ID_H100", required=False)
    bucket = _env("S3_BUCKET")
    public_base = _env("S3_PUBLIC_BASE_URL", required=False)
    rate_4090 = float(_env("RUNPOD_GPU_RATE_PER_SEC_4090", required=False, default="0.0000944"))
    rate_h100 = float(_env("RUNPOD_GPU_RATE_PER_SEC_H100", required=False, default="0.000553"))

    if rate_4090 == 0.0000944:
        print("NOTE: using the ADR's 4090 COMMUNITY rate ($0.0000944/s). Serverless FLEX is a "
              "premium (~1.3–1.8x). Set RUNPOD_GPU_RATE_PER_SEC_4090 to your endpoint's real "
              "per-second rate so the $/clip gate is honest.\n")

    prompt = os.environ.get(
        "SPIKE_PROMPT",
        "A cinematic slow dolly-in on a lone astronaut standing on a red desert dune at "
        "golden hour, dust drifting, volumetric light, photorealistic, 35mm.",
    )
    width = int(os.environ.get("SPIKE_WIDTH", "1280"))
    height = int(os.environ.get("SPIKE_HEIGHT", "720"))
    duration = float(os.environ.get("SPIKE_DURATION", "5"))
    seed = int(os.environ.get("SPIKE_SEED", "12345"))  # fixed for the Seedance side-by-side

    t2v_base = {"prompt": prompt, "width": width, "height": height, "duration": duration, "seed": seed}
    s3 = make_s3_client()
    results: list[Result] = []

    # Clip #1 COLD then Clip #2 WARM — same prompt/seed, back-to-back on the 4090 endpoint.
    results.append(run_clip("cold-t2v", "4090", ep_4090, api_key, rate_4090, s3, bucket, public_base, t2v_base))
    results.append(run_clip("warm-t2v", "4090", ep_4090, api_key, rate_4090, s3, bucket, public_base, t2v_base))

    i2v_img = build_i2v_input()
    if i2v_img:
        results.append(run_clip("warm-i2v", "4090", ep_4090, api_key, rate_4090, s3, bucket, public_base,
                                {**t2v_base, "inputImage": i2v_img}))

    if ep_h100:
        results.append(run_clip("h100-t2v", "H100", ep_h100, api_key, rate_h100, s3, bucket, public_base, t2v_base))

    verdict(results)


if __name__ == "__main__":
    main()

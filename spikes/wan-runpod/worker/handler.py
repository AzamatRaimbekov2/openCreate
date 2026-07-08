"""RunPod serverless handler — Wan 2.2 A14B via ComfyUI (feasibility spike).

WHY ComfyUI (not diffusers): as of July 2026 the Wan 2.2 optimization stack
(FP8/GGUF loaders, SageAttention INT8, TeaCache, block-swap, VAE tiling, I2V
first-frame conditioning) ships as maintained ComfyUI custom nodes months ahead
of diffusers parity. This handler runs a *local* headless ComfyUI process and
drives it over its HTTP API (/prompt + /history). We author our own handler
(rather than the stock runpod-workers/worker-comfyui) because the ADR requires
two things stock does not do: (1) an NSFW classifier on output frames, and
(2) delivery via a per-job *presigned PUT* so the worker never holds bucket
creds. See docs/wiki/decisions/wan-selfhost-video-provider.md.

────────────────────────────────────────────────────────────────────────────
CONTRACT  (single source of truth — measure/run.py MUST send/read exactly this)
────────────────────────────────────────────────────────────────────────────
job["input"]:
  prompt          str    REQUIRED   text prompt
  negativePrompt  str    optional   default DEFAULT_NEGATIVE
  width           int    optional   default 1280
  height          int    optional   default 720
  duration        number optional   seconds, default 5   (frames = round(duration*fps), snapped to 4n+1)
  fps             int    optional   default 16
  seed            int    optional   default random
  steps           int    optional   default 20  (split: first half high-noise expert, second half low-noise)
  inputImage      str    optional   data-uri OR https URL → switches to i2v
  putUrl          str    REQUIRED   short-TTL presigned PUT for the output mp4 (worker holds no bucket creds)
  objectKey       str    REQUIRED   bucket object key; echoed back as assetUrl

handler output (becomes RunPod `output`):
  assetUrl    str    == objectKey (the bucket key the mp4 was PUT to)
  nsfw        bool   NSFW-classifier verdict over sampled output frames
  genSeconds  float  pure ComfyUI generation time (cross-check vs RunPod executionTime)
  width       int
  height      int
  numFrames   int

On any failure the handler raises; RunPod marks the job FAILED and surfaces the
message under status.error. Cold-start (C) and warm exec (G) are NOT timed here:
RunPod returns delayTime(=C) and executionTime(=G) on the job itself.
"""

from __future__ import annotations

import base64
import binascii
import copy
import json
import os
import random
import subprocess
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any

import requests
import runpod

# ── Config (env-overridable; all have safe defaults) ────────────────────────
COMFY_HOST = os.environ.get("COMFY_HOST", "127.0.0.1")
COMFY_PORT = int(os.environ.get("COMFY_PORT", "8188"))
COMFY_URL = f"http://{COMFY_HOST}:{COMFY_PORT}"
COMFY_DIR = os.environ.get("COMFY_DIR", "/comfyui")
COMFY_INPUT_DIR = os.environ.get("COMFY_INPUT_DIR", f"{COMFY_DIR}/input")
COMFY_OUTPUT_DIR = os.environ.get("COMFY_OUTPUT_DIR", f"{COMFY_DIR}/output")
WORKFLOW_DIR = os.environ.get("WORKFLOW_DIR", str(Path(__file__).parent / "workflows"))

COMFY_BOOT_TIMEOUT_S = int(os.environ.get("COMFY_BOOT_TIMEOUT_S", "300"))
JOB_TIMEOUT_S = int(os.environ.get("JOB_TIMEOUT_S", "1200"))  # 20 min hard ceiling
NSFW_THRESHOLD = float(os.environ.get("NSFW_THRESHOLD", "0.5"))
NSFW_FRAME_SAMPLES = int(os.environ.get("NSFW_FRAME_SAMPLES", "4"))
NSFW_MODEL = os.environ.get("NSFW_MODEL", "Falconsai/nsfw_image_detection")

DEFAULT_NEGATIVE = os.environ.get(
    "DEFAULT_NEGATIVE",
    "blurry, low quality, jpeg artifacts, watermark, text, deformed, "
    "distorted, extra limbs, bad hands, static, flicker",
)

# ── Lazy singletons: started once per container, reused across warm jobs ─────
_comfy_proc: subprocess.Popen | None = None
_nsfw_pipe = None


def _redact(url: str) -> str:
    """Strip query string so presigned-URL signatures never reach logs."""
    return url.split("?", 1)[0] + "?<redacted>" if "?" in url else url


# ── ComfyUI lifecycle ───────────────────────────────────────────────────────
def _start_comfy() -> None:
    """Launch headless ComfyUI once and block until its HTTP API answers."""
    global _comfy_proc
    if _comfy_proc and _comfy_proc.poll() is None:
        return

    cmd = [
        "python", "-u", "main.py",
        "--listen", COMFY_HOST,
        "--port", str(COMFY_PORT),
        "--disable-auto-launch",
        # extra_model_paths.yaml points ComfyUI at the mounted network volume
        "--extra-model-paths-config", os.environ.get(
            "EXTRA_MODEL_PATHS", str(Path(__file__).parent / "extra_model_paths.yaml")
        ),
    ]
    # SageAttention INT8: a launch flag, not a workflow dependency. Non-fatal if
    # the wheel is missing — ComfyUI just runs a bit slower (see Dockerfile).
    if os.environ.get("USE_SAGE_ATTENTION", "1") == "1":
        cmd.append("--use-sage-attention")

    print(f"[handler] starting ComfyUI: {' '.join(cmd)}")
    _comfy_proc = subprocess.Popen(cmd, cwd=COMFY_DIR)

    deadline = time.time() + COMFY_BOOT_TIMEOUT_S
    while time.time() < deadline:
        if _comfy_proc.poll() is not None:
            raise RuntimeError(f"ComfyUI exited early (code {_comfy_proc.returncode})")
        try:
            r = requests.get(f"{COMFY_URL}/system_stats", timeout=5)
            if r.status_code == 200:
                print("[handler] ComfyUI is up")
                return
        except requests.RequestException:
            pass
        time.sleep(2)
    raise RuntimeError("ComfyUI did not become ready within boot timeout")


# ── Workflow templating ─────────────────────────────────────────────────────
# The handler injects values by NODE TITLE (_meta.title), not by node id, so the
# operator can swap in ComfyUI's shipped Wan 2.2 template and only needs to title
# the relevant nodes. Required titles:
#   PROMPT_POSITIVE  → CLIPTextEncode.text
#   PROMPT_NEGATIVE  → CLIPTextEncode.text   (optional)
#   LATENT_DIMS      → node with width/height/length inputs (Empty*LatentVideo or the i2v latent)
#   INPUT_IMAGE      → LoadImage.image        (i2v only)
#   OUTPUT_VIDEO     → SaveVideo/VHS node whose history entry yields the mp4 path
# `seed` is set on ANY node exposing a `seed` or `noise_seed` input (covers both
# KSamplerAdvanced experts), so no title is needed for it.

def _find_by_title(wf: dict, title: str) -> list[str]:
    return [nid for nid, n in wf.items() if n.get("_meta", {}).get("title") == title]


def _snap_frames(duration: float, fps: int) -> int:
    """Wan wants (4n+1) frames. Snap round(duration*fps) up to the nearest 4n+1."""
    n = max(1, round(duration * fps))
    return ((n - 1) // 4) * 4 + 1 if (n - 1) % 4 == 0 else ((n - 1) // 4 + 1) * 4 + 1


def _build_workflow(inp: dict, is_i2v: bool, num_frames: int, seed: int) -> dict:
    name = "wan22_i2v.json" if is_i2v else "wan22_t2v.json"
    template = json.loads((Path(WORKFLOW_DIR) / name).read_text())
    wf = copy.deepcopy(template)

    for nid in _find_by_title(wf, "PROMPT_POSITIVE"):
        wf[nid]["inputs"]["text"] = inp["prompt"]
    for nid in _find_by_title(wf, "PROMPT_NEGATIVE"):
        wf[nid]["inputs"]["text"] = inp.get("negativePrompt", DEFAULT_NEGATIVE)

    for nid in _find_by_title(wf, "LATENT_DIMS"):
        node_in = wf[nid]["inputs"]
        node_in["width"] = int(inp.get("width", 1280))
        node_in["height"] = int(inp.get("height", 720))
        # Wan latent nodes name the temporal axis "length"; fall back to num_frames.
        for key in ("length", "num_frames", "video_frames"):
            if key in node_in:
                node_in[key] = num_frames

    # Seed on every sampler expert (title-independent).
    for node in wf.values():
        for key in ("seed", "noise_seed"):
            if key in node.get("inputs", {}):
                node["inputs"][key] = seed

    # fps on the video-assembly node(s) so playback duration matches num_frames.
    fps = int(inp.get("fps", 16))
    for node in wf.values():
        if "fps" in node.get("inputs", {}):
            node["inputs"]["fps"] = fps

    # Steps split across the two experts if the operator titled the samplers.
    if "steps" in inp:
        for node in wf.values():
            if "steps" in node.get("inputs", {}):
                node["inputs"]["steps"] = int(inp["steps"])

    if is_i2v:
        image_name = _stage_input_image(inp["inputImage"])
        set_any = False
        for nid in _find_by_title(wf, "INPUT_IMAGE"):
            wf[nid]["inputs"]["image"] = image_name
            set_any = True
        if not set_any:
            raise RuntimeError("i2v workflow is missing a node titled INPUT_IMAGE")

    return wf


def _stage_input_image(src: str) -> str:
    """Materialize a data-uri or https image into ComfyUI's input dir for LoadImage."""
    os.makedirs(COMFY_INPUT_DIR, exist_ok=True)
    fname = f"in_{uuid.uuid4().hex}.png"
    dest = Path(COMFY_INPUT_DIR) / fname
    if src.startswith("data:"):
        try:
            b64 = src.split(",", 1)[1]
            dest.write_bytes(base64.b64decode(b64))
        except (IndexError, binascii.Error) as e:
            raise RuntimeError(f"invalid inputImage data-uri: {e}") from e
    elif src.startswith(("http://", "https://")):
        with urllib.request.urlopen(src, timeout=30) as resp:  # noqa: S310 (spike i2v seed image)
            dest.write_bytes(resp.read())
    else:
        raise RuntimeError("inputImage must be a data-uri or http(s) URL")
    return fname


# ── ComfyUI execution ───────────────────────────────────────────────────────
def _run_comfy(workflow: dict) -> str:
    """Queue a prompt, wait for completion, return the absolute output mp4 path."""
    client_id = uuid.uuid4().hex
    resp = requests.post(
        f"{COMFY_URL}/prompt",
        json={"prompt": workflow, "client_id": client_id},
        timeout=30,
    )
    if resp.status_code != 200:
        # ComfyUI returns node_errors here — surface them; they are our own graph,
        # not user secrets, so this is safe to include in the job error.
        raise RuntimeError(f"ComfyUI /prompt rejected the workflow: {resp.text[:800]}")
    prompt_id = resp.json()["prompt_id"]

    deadline = time.time() + JOB_TIMEOUT_S
    while time.time() < deadline:
        h = requests.get(f"{COMFY_URL}/history/{prompt_id}", timeout=15)
        hist = h.json().get(prompt_id) if h.status_code == 200 else None
        if hist:
            status = hist.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI execution error: {json.dumps(status)[:800]}")
            path = _extract_output_path(hist)
            if path:
                return path
        time.sleep(1.5)
    raise RuntimeError("ComfyUI generation exceeded JOB_TIMEOUT_S")


def _extract_output_path(hist: dict) -> str | None:
    """Find the produced mp4 among ComfyUI history outputs (gifs/videos/images keys)."""
    for node_out in hist.get("outputs", {}).values():
        for key in ("videos", "gifs", "images", "files"):
            for item in node_out.get(key, []):
                fn = item.get("filename", "")
                if fn.lower().endswith((".mp4", ".webm", ".mov")):
                    sub = item.get("subfolder", "")
                    base = COMFY_OUTPUT_DIR if item.get("type", "output") == "output" else COMFY_INPUT_DIR
                    return str(Path(base) / sub / fn)
    return None


# ── NSFW classification (HARD requirement per ADR §6 moderation parity) ──────
def _get_nsfw_pipe():
    global _nsfw_pipe
    if _nsfw_pipe is None:
        from transformers import pipeline  # lazy: keeps import cost off cold path until needed
        _nsfw_pipe = pipeline("image-classification", model=NSFW_MODEL, device=0)
    return _nsfw_pipe


def _classify_nsfw(mp4_path: str) -> bool:
    """Sample frames evenly and return True if any frame scores nsfw ≥ threshold.

    Default-deny: if frames cannot be read or the classifier errors, we return
    True (treat as unsafe) so the §9.4 gate blocks rather than leaks."""
    try:
        import imageio.v3 as iio
        from PIL import Image

        frames = iio.imread(mp4_path, index=None, plugin="pyav")  # (T,H,W,C)
        total = len(frames)
        if total == 0:
            return True
        idxs = [int(i * (total - 1) / max(1, NSFW_FRAME_SAMPLES - 1)) for i in range(NSFW_FRAME_SAMPLES)]
        pipe = _get_nsfw_pipe()
        for i in sorted(set(idxs)):
            preds = pipe(Image.fromarray(frames[i]))
            for p in preds:
                if p["label"].lower() == "nsfw" and p["score"] >= NSFW_THRESHOLD:
                    return True
        return False
    except Exception as e:  # noqa: BLE001 — default-deny on any classifier failure
        print(f"[handler] NSFW classifier failed, defaulting nsfw=True: {e}")
        return True


# ── Delivery: presigned PUT (worker never holds long-lived bucket creds) ─────
def _upload(mp4_path: str, put_url: str) -> None:
    data = Path(mp4_path).read_bytes()
    print(f"[handler] PUT {len(data)} bytes → {_redact(put_url)}")
    r = requests.put(
        put_url,
        data=data,
        headers={"Content-Type": "video/mp4"},
        timeout=300,
    )
    if r.status_code not in (200, 201, 204):
        # Never echo put_url (it carries the signature) into the error.
        raise RuntimeError(f"presigned PUT failed: HTTP {r.status_code}")


# ── Entry point ─────────────────────────────────────────────────────────────
def handler(job: dict[str, Any]) -> dict[str, Any]:
    inp = job.get("input") or {}

    prompt = inp.get("prompt")
    put_url = inp.get("putUrl")
    object_key = inp.get("objectKey")
    missing = [k for k, v in (("prompt", prompt), ("putUrl", put_url), ("objectKey", object_key)) if not v]
    if missing:
        raise ValueError(f"missing required input field(s): {', '.join(missing)}")

    fps = int(inp.get("fps", 16))
    num_frames = _snap_frames(float(inp.get("duration", 5)), fps)
    seed = int(inp.get("seed", random.randint(0, 2**31 - 1)))
    is_i2v = bool(inp.get("inputImage"))

    _start_comfy()

    workflow = _build_workflow(inp, is_i2v, num_frames, seed)

    t0 = time.time()
    mp4_path = _run_comfy(workflow)
    gen_seconds = round(time.time() - t0, 2)

    nsfw = _classify_nsfw(mp4_path)
    _upload(mp4_path, put_url)

    return {
        "assetUrl": object_key,     # == objectKey; the mp4 now lives at this bucket key
        "nsfw": nsfw,
        "genSeconds": gen_seconds,
        "width": int(inp.get("width", 1280)),
        "height": int(inp.get("height", 720)),
        "numFrames": num_frames,
        "seed": seed,
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})

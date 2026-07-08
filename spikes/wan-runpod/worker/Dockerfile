# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Wan 2.2 A14B RunPod-serverless worker image (feasibility spike).
#
# Design (per docs/wiki/spikes/wan-runpod-feasibility-spike.md):
#  - Weights are NOT baked. They live on a network volume (see bootstrap_volume.sh
#    + extra_model_paths.yaml) so cold start loads ~28GB from the volume, not the net.
#  - ComfyUI + Wan nodes are PINNED TO COMMITS (set the ARGs below to verified SHAs
#    before building — the defaults track a branch and print a warning at build).
#  - SageAttention INT8 + flash-attn are installed as optimizations. Both are made
#    NON-FATAL: if a wheel/build fails the image still runs (just slower), so a
#    transient build hiccup never bricks the spike.
#  - The NSFW classifier model is baked so it is not fetched on cold start.
# ─────────────────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/root/.cache/huggingface \
    COMFY_DIR=/comfyui

# Pin these to VERIFIED commits before a real build (see spike plan "pinned to commits").
ARG COMFYUI_REF=master
ARG COMFYUI_TEACACHE_REF=main

RUN apt-get update && apt-get install -y --no-install-recommends \
        git wget curl ca-certificates ffmpeg \
        python3.11 python3.11-venv python3.11-dev python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip

# Torch first (CUDA 12.4 wheels), so subsequent builds resolve against it.
RUN pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cu124

# ── ComfyUI (pinned) ──────────────────────────────────────────────────────────
RUN git clone https://github.com/comfyanonymous/ComfyUI.git ${COMFY_DIR} \
    && cd ${COMFY_DIR} && git checkout ${COMFYUI_REF} \
    && ([ "${COMFYUI_REF}" = "master" ] && echo "WARNING: ComfyUI pinned to a moving branch; set COMFYUI_REF to a commit for reproducibility" || true) \
    && pip install -r requirements.txt

# TeaCache custom node (speed optimization; workflow works without it too).
RUN git clone https://github.com/welltop-cn/ComfyUI-TeaCache.git \
        ${COMFY_DIR}/custom_nodes/ComfyUI-TeaCache \
    && cd ${COMFY_DIR}/custom_nodes/ComfyUI-TeaCache && git checkout ${COMFYUI_TEACACHE_REF} \
    && ([ -f requirements.txt ] && pip install -r requirements.txt || true)

# ── Optimizations (NON-FATAL) ────────────────────────────────────────────────
# SageAttention INT8: enabled at runtime via ComfyUI's --use-sage-attention flag
# (handler.py). If the wheel build fails, we continue without it.
RUN pip install sageattention>=2.1.0 || echo "WARNING: sageattention install failed; continuing without SageAttention"
# flash-attn: prebuilt wheels exist for common torch/cuda combos; build is slow.
RUN pip install flash-attn --no-build-isolation || echo "WARNING: flash-attn install failed; continuing without it"

# ── Handler deps ─────────────────────────────────────────────────────────────
COPY requirements.txt /worker/requirements.txt
RUN pip install -r /worker/requirements.txt

# Bake the NSFW classifier so cold start does not fetch it.
RUN python -c "from transformers import pipeline; pipeline('image-classification', model='Falconsai/nsfw_image_detection')"

# ── Worker code + workflows + volume mapping ─────────────────────────────────
COPY handler.py /worker/handler.py
COPY workflows /worker/workflows
COPY extra_model_paths.yaml /worker/extra_model_paths.yaml

ENV WORKFLOW_DIR=/worker/workflows \
    EXTRA_MODEL_PATHS=/worker/extra_model_paths.yaml \
    USE_SAGE_ATTENTION=1

WORKDIR /worker
# RunPod serverless invokes handler.py, which boots ComfyUI in-process on first job.
CMD ["python", "-u", "handler.py"]

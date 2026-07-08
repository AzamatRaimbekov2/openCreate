#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time weight download onto the RunPod NETWORK VOLUME (~$0.30 on a cheap pod).
#
# Run this ONCE from a cheap on-demand pod (any 4090/CPU pod) that has the network
# volume attached, BEFORE deploying the serverless endpoint. It downloads ~28GB of
# Wan 2.2 A14B FP8 weights so the serverless workers load them from the volume and
# never re-download ~28GB on cold start.
#
# Usage:
#   VOLUME_ROOT=/runpod-volume ./bootstrap_volume.sh
#   # (pods usually mount the volume at /workspace; serverless mounts /runpod-volume)
#   # Set HF_TOKEN if any repo needs auth (the repack repo is public; usually not needed).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VOLUME_ROOT="${VOLUME_ROOT:-/runpod-volume}"
MODELS_ROOT="${VOLUME_ROOT}/ComfyUI/models"
MANIFEST="$(dirname "$0")/models.txt"

echo "==> Bootstrapping Wan 2.2 weights into ${MODELS_ROOT}"
mkdir -p "${MODELS_ROOT}"/{diffusion_models,text_encoders,vae,clip_vision}

# huggingface_hub gives resumable, hash-verified downloads. Fall back to nothing —
# if it's missing, install it: pip install "huggingface_hub[cli]".
if ! command -v hf >/dev/null 2>&1 && ! command -v huggingface-cli >/dev/null 2>&1; then
  echo "installing huggingface_hub CLI..."
  pip install -q "huggingface_hub[cli]"
fi
HF_BIN="$(command -v hf || command -v huggingface-cli)"

download() {
  local subdir="$1" filename="$2" repo="$3" path="$4"
  local dest="${MODELS_ROOT}/${subdir}/${filename}"
  if [[ -f "${dest}" ]]; then
    echo "  [skip] ${subdir}/${filename} already present"
    return
  fi
  echo "  [get ] ${repo}:${path}"
  # hf download writes into a cache then we symlink/copy the concrete file into place.
  "${HF_BIN}" download "${repo}" "${path}" \
    --local-dir "${MODELS_ROOT}/.hf-stage/${repo}" \
    ${HF_TOKEN:+--token "${HF_TOKEN}"} >/dev/null
  cp "${MODELS_ROOT}/.hf-stage/${repo}/${path}" "${dest}"
}

# Parse models.txt (skip comments/blank lines): "subdir | filename | repo | path"
while IFS='|' read -r subdir filename repo path; do
  [[ -z "${subdir// }" || "${subdir#\#}" != "${subdir}" ]] && continue
  download "$(echo "$subdir" | xargs)" "$(echo "$filename" | xargs)" \
           "$(echo "$repo" | xargs)" "$(echo "$path" | xargs)"
done < "${MANIFEST}"

rm -rf "${MODELS_ROOT}/.hf-stage"
echo "==> Done. Volume tree:"
find "${MODELS_ROOT}" -maxdepth 2 -type f -printf '  %p  (%s bytes)\n' 2>/dev/null || ls -R "${MODELS_ROOT}"
echo "==> Point the serverless endpoint at this volume; extra_model_paths.yaml maps ${MODELS_ROOT}."

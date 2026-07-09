#!/usr/bin/env bash
# Bootstrap a RunPod pod (runpod/pytorch base, network volume at /workspace) into
# a running ComfyUI with Wan 2.2 t2v FP8 weights — fully unattended, ROBUST.
# Fetched by dockerArgs via an env var (no long base64 in the command). Weights
# persist on the volume; ComfyUI launches ONLY after all 4 files verify present
# (earlier a single failed download launched ComfyUI half-baked).
echo "BOOT: start $(date -u)"
cd /workspace || exit 1
if [ ! -f ComfyUI/main.py ]; then
  rm -rf ComfyUI
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI || { echo "BOOT: clone failed"; sleep 3600; exit 1; }
fi
cd ComfyUI
echo "BOOT: pip deps"
pip install -q -r requirements.txt || echo "BOOT: requirements warnings"
pip install -q "huggingface_hub[hf_transfer]" || pip install -q huggingface_hub || true
export HF_HUB_ENABLE_HF_TRANSFER=1
mkdir -p models/diffusion_models models/text_encoders models/vae
echo "BOOT: weights (retry per file, verify all before launch)"
python - <<'PY'
import os, shutil, time
from huggingface_hub import hf_hub_download
R = "Comfy-Org/Wan_2.2_ComfyUI_Repackaged"
F = {
    "split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors": "models/diffusion_models",
    "split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors":  "models/diffusion_models",
    "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors":              "models/text_encoders",
    "split_files/vae/wan_2.1_vae.safetensors":                                       "models/vae",
}
def get(p, d):
    dest = os.path.join(d, os.path.basename(p))
    if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
        print("have", dest, flush=True); return True
    for attempt in range(1, 6):
        try:
            print(f"get {os.path.basename(p)} (try {attempt})", flush=True)
            shutil.copy(hf_hub_download(R, p), dest)
            print("ok", dest, flush=True); return True
        except Exception as e:
            print("retry after error:", str(e)[:120], flush=True); time.sleep(5 * attempt)
    return False
ok = all(get(p, d) for p, d in F.items())
print("ALL_WEIGHTS_READY" if ok else "WEIGHTS_INCOMPLETE", flush=True)
import sys; sys.exit(0 if ok else 1)
PY
if [ $? -ne 0 ]; then echo "BOOT: weights incomplete — NOT launching ComfyUI (inspect + restart)"; sleep 3600; exit 1; fi
echo "BOOT: launching ComfyUI"
python main.py --listen 0.0.0.0 --port 8188 || { echo "BOOT: ComfyUI exited"; sleep 3600; }

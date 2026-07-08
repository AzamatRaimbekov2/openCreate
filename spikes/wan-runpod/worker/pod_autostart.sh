#!/usr/bin/env bash
# Auto-start for the bootstrap pod: install ComfyUI (native Wan 2.2 support),
# download the Wan 2.2 t2v FP8 weights to the network volume (idempotent — they
# persist across redeploys), then launch ComfyUI in the FOREGROUND so the
# container stays alive and the measurement harness can drive it over HTTP:8188.
# No SSH / no human step: this runs as the container command.
set -e
cd /workspace
[ -d ComfyUI ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
pip install -q -r requirements.txt
pip install -q huggingface_hub
mkdir -p models/diffusion_models models/text_encoders models/vae
python - <<'PY'
from huggingface_hub import hf_hub_download
import os, shutil
R = "Comfy-Org/Wan_2.2_ComfyUI_Repackaged"
F = {
    "split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors": "models/diffusion_models",
    "split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors":  "models/diffusion_models",
    "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors":              "models/text_encoders",
    "split_files/vae/wan_2.1_vae.safetensors":                                       "models/vae",
}
for p, d in F.items():
    dest = os.path.join(d, os.path.basename(p))
    if os.path.exists(dest):
        print("skip", dest, flush=True)
        continue
    print("get", p, flush=True)
    shutil.copy(hf_hub_download(R, p), dest)
    print("ok", dest, flush=True)
print("WEIGHTS_READY", flush=True)
PY
echo "LAUNCHING_COMFYUI"
exec python main.py --listen 0.0.0.0 --port 8188

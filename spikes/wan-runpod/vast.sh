#!/usr/bin/env bash
# One-command lifecycle for the self-hosted Wan 2.2 video GPU on Vast.ai.
# A rented GPU can't be "saved" — it's destroyed when you stop paying — so what
# is saved is THIS launcher: `up` provisions a fresh H100, downloads the Wan 2.2
# weights to local NVMe, starts ComfyUI, and prints the COMFY_BASE_URL to wire
# into the app; `down` destroys it so it stops billing.
#
#   ./vast.sh up          # rent + provision, prints COMFY_BASE_URL (~2-3 min)
#   ./vast.sh status      # list instances + balance
#   ./vast.sh down <id>   # destroy instance <id> (STOP billing)
#
# Verified 2026-07-12: pytorch image + fresh ComfyUI clone gives Wan 2.2 nodes,
# and the published 8188 port is reachable directly (no SSH tunnel needed) on the
# offers this picks. Weights ~34GB load to local NVMe in ~40-60s. H100 ~15 min/
# clip @ ~$0.55; A100 ~22 min @ ~$0.40. Keep the instance up only while using it.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="https://console.vast.ai/api/v0"

# Key precedence: ~/.vast_api_key (chmod 600, outside repo) → spikes .env VAST_API_KEY.
load_key() {
  if [[ -f "$HOME/.vast_api_key" ]]; then
    VAST_API_KEY="$(cat "$HOME/.vast_api_key")"
  elif [[ -f "$REPO_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    set -a; . "$REPO_DIR/.env"; set +a
  fi
  : "${VAST_API_KEY:?VAST_API_KEY not found (put it in ~/.vast_api_key or spikes/wan-runpod/.env)}"
}

auth() { curl -s -H "Authorization: Bearer $VAST_API_KEY" "$@"; }

# The onstart script that runs ON the instance. Local NVMe only (never a network
# volume — that was the original 1h/clip artifact). --fast fp8_matrix_mult is what
# actually engages Hopper FP8; without it ComfyUI upcasts to bf16 and an H100 is
# no faster than an A100.
boot_script() {
  cat <<'BOOT'
#!/bin/bash
set -eux
exec > /workspace/onstart.log 2>&1
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq || true
apt-get install -y -qq git ffmpeg || true
cd /workspace
[ -d ComfyUI ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
pip install -q -r requirements.txt
pip install -q "huggingface_hub[hf_transfer]"
export HF_HUB_ENABLE_HF_TRANSFER=1
mkdir -p models/diffusion_models models/text_encoders models/vae /workspace/dl
python - <<'PY'
from huggingface_hub import hf_hub_download
import os, time
REPO="Comfy-Org/Wan_2.2_ComfyUI_Repackaged"
FILES={
 "split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors":"models/diffusion_models",
 "split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors":"models/diffusion_models",
 "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors":"models/text_encoders",
 "split_files/vae/wan_2.1_vae.safetensors":"models/vae",
}
t0=time.time()
for p,d in FILES.items():
    dest=os.path.join(d,os.path.basename(p))
    if os.path.exists(dest): print("skip",dest,flush=True); continue
    print("get",p,flush=True); os.replace(hf_hub_download(REPO,p,local_dir="/workspace/dl"),dest)
print(f"WEIGHTS_SECONDS={time.time()-t0:.1f}",flush=True)
PY
rm -rf /workspace/dl
touch /workspace/WEIGHTS_READY
echo LAUNCHING_COMFYUI
exec python main.py --listen 0.0.0.0 --port 8188 --fast fp8_matrix_mult
BOOT
}

cmd_up() {
  load_key
  echo "searching for an H100/A100 offer (fast disk + net, on-demand)..."
  local offer
  offer="$(auth "$API/bundles/?q=$(python3 -c '
import json,urllib.parse
q={"verified":{"eq":True},"rentable":{"eq":True},"rented":{"eq":False},"num_gpus":{"eq":1},
   "gpu_totalram":{"gte":79000},"disk_space":{"gte":150},"type":"on-demand",
   "order":[["dph_total","asc"]],"limit":100}
print(urllib.parse.quote(json.dumps(q)))')" | python3 -c '
import sys,json
offers=json.load(sys.stdin)["offers"]
pref=[o for o in offers if ("H100" in (o.get("gpu_name") or "") or "A100" in (o.get("gpu_name") or ""))
      and (o.get("disk_bw") or 0)>4000 and (o.get("inet_down") or 0)>3000]
pref.sort(key=lambda o:o["dph_total"])
o=pref[0]
print(o["id"], o["gpu_name"], "%.3f" % o["dph_total"])')"
  local oid gpu dph; read -r oid gpu dph <<<"$offer"
  echo "picked offer $oid ($gpu, \$$dph/hr)"

  local b64; b64="$(boot_script | base64)"
  local resp; resp="$(auth -X PUT "$API/asks/$oid/" -H "Content-Type: application/json" -d "$(python3 -c "
import json,sys
print(json.dumps({'client_id':'me','image':'pytorch/pytorch:2.9.1-cuda12.8-cudnn9-devel','disk':150,
 'label':'wan22','onstart':'echo '+sys.argv[1]+' | base64 -d > /workspace/boot.sh && bash /workspace/boot.sh',
 'runtype':'ssh','env':{'-p 8188:8188':'1'},'use_jupyter_lab':False}))" "$b64")")"
  local iid; iid="$(echo "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("new_contract",""))')"
  [[ -n "$iid" ]] || { echo "create failed: $resp"; exit 1; }
  echo "instance $iid created; waiting for ComfyUI..."

  local ep=""
  for _ in $(seq 1 40); do
    local o; o="$(auth "$API/instances/$iid/" | python3 -c '
import sys,json
i=json.load(sys.stdin).get("instances")
if i and i.get("actual_status")=="running":
    p=i["ports"]["8188/tcp"][0]["HostPort"]; print(f"http://{i[\"public_ipaddr\"]}:{p}")')"
    if [[ -n "$o" ]]; then ep="$o"; break; fi
    sleep 10
  done
  [[ -n "$ep" ]] || { echo "instance never reached running; check: ./vast.sh status"; exit 1; }

  echo "instance up at $ep — waiting for weights + ComfyUI (~2 min)..."
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null -m 5 "$ep/system_stats"; then break; fi
    sleep 10
  done
  echo
  echo "==================================================================="
  echo " READY.  instance=$iid   COMFY_BASE_URL=$ep"
  echo " Wire the app:  cd apps/api && COMFY_BASE_URL=$ep pnpm dev"
  echo " Stop billing:  ./vast.sh down $iid"
  echo "==================================================================="
}

cmd_status() {
  load_key
  echo "balance:"; auth "$API/users/current/" | python3 -c 'import sys,json;c=json.load(sys.stdin)["credit"];print("  $%.2f  (H100 ~$2.1/hr, A100 ~$1.1/hr)" % c)'
}

cmd_down() {
  load_key
  local iid="${1:?usage: ./vast.sh down <instance-id>}"
  auth -X DELETE "$API/instances/$iid/" -w '\n'
  echo "destroyed $iid"
}

case "${1:-}" in
  up) cmd_up ;;
  status) cmd_status ;;
  down) shift; cmd_down "${1:-}" ;;
  *) echo "usage: ./vast.sh {up|status|down <id>}"; exit 1 ;;
esac

#!/usr/bin/env bash
# Downloads only the files the app actually needs from HuggingFace
# into ./model-files/ for subsequent upload to R2.
#
# Usage:  bash scripts/download-model.sh

set -euo pipefail

HF_BASE="https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main"
DEST="$(dirname "$0")/../model-files"

mkdir -p "$DEST/onnx"

# Files referenced in src/worker.js (CONNECTIVITY_TARGETS) + common companions
FILES=(
  # Config JSONs
  "config.json"
  "generation_config.json"
  "processor_config.json"
  "preprocessor_config.json"
  "tokenizer_config.json"
  "tokenizer.json"
  "special_tokens_map.json"
  "chat_template.json"
  "added_tokens.json"

  # ONNX model files + their external data blobs
  "onnx/audio_encoder_fp16.onnx"
  "onnx/audio_encoder_fp16.onnx_data"
  "onnx/vision_encoder_fp16.onnx"
  "onnx/vision_encoder_fp16.onnx_data"
  "onnx/embed_tokens_q4f16.onnx"
  "onnx/embed_tokens_q4f16.onnx_data"
  "onnx/decoder_model_merged_q4f16.onnx"
  "onnx/decoder_model_merged_q4f16.onnx_data"
)

echo "Downloading model files to: $DEST"
echo

for f in "${FILES[@]}"; do
  out="$DEST/$f"
  url="$HF_BASE/$f"

  if [[ -f "$out" ]]; then
    echo "[skip]  $f (already exists)"
    continue
  fi

  echo "[get]   $f"
  # -f: fail on HTTP errors, -L: follow redirects, --create-dirs: mkdir if needed
  # Some optional files (added_tokens.json, chat_template.json) may not exist;
  # use || true so the script continues.
  if ! curl -fL --create-dirs -o "$out" "$url"; then
    echo "[warn]  $f not found on HF (may be optional), skipping"
    rm -f "$out"
  fi
done

echo
echo "Done. Files downloaded to: $DEST"
du -sh "$DEST"

#!/usr/bin/env bash
# Uploads ./model-files/** to the R2 bucket 'local-models' using Wrangler.
#
# Files >= 300 MiB are skipped (wrangler's hard limit) — run
# scripts/upload-big-files.mjs for those with R2 S3 creds.
#
# Prerequisites: npm install -g wrangler; wrangler login
# Usage: bash scripts/upload-to-r2.sh

set -euo pipefail

BUCKET="local-models"
SRC="$(dirname "$0")/../model-files"
MAX_BYTES=$((300 * 1024 * 1024))  # 300 MiB (wrangler limit)

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: $SRC not found. Run scripts/download-model.sh first." >&2
  exit 1
fi

content_type_for() {
  case "$1" in
    *.json)      echo "application/json" ;;
    *)           echo "application/octet-stream" ;;
  esac
}

cd "$SRC"

SKIPPED=()

find . -type f | while read -r rel; do
  key="${rel#./}"
  size_bytes=$(stat -c %s "$rel" 2>/dev/null || stat -f %z "$rel")
  ct="$(content_type_for "$key")"

  if (( size_bytes >= MAX_BYTES )); then
    size_mb=$(( size_bytes / 1024 / 1024 ))
    echo "[skip-big]  $key (${size_mb} MiB >= 300 MiB — use upload-big-files.mjs)"
    continue
  fi

  size_hr=$(du -h "$rel" | cut -f1)
  echo "[upload]    $key ($size_hr) -> r2://$BUCKET/$key"
  wrangler r2 object put "$BUCKET/$key" \
    --file="$rel" \
    --content-type="$ct" \
    --remote 2>&1 | tail -3
done

echo
echo "Small-file upload complete. Verify with:"
echo "  wrangler r2 bucket info $BUCKET"

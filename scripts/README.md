# Self-hosting the Gemma 4 demo

This fork runs entirely on Cloudflare:

| Piece | Where |
|---|---|
| App (Vite SPA) | Cloudflare Worker at `https://vision.stratoslab.xyz` |
| Model weights (~2.5-3 GB) | R2 bucket `local-models` at `https://local-mode.stratoslab.xyz` |
| Cloudflare account | `91dc1b5ea710fdd043ebbe0b47b418c0` (stratoslab) |

## Prerequisites

```bash
npm install -g wrangler
wrangler login
wrangler whoami   # confirm account id is 91dc1b5ea710fdd043ebbe0b47b418c0
```

## Part 1 — Host the model on R2 (one-time)

### 1. Create the bucket

```bash
wrangler r2 bucket create local-models
```

### 2. Download the model files from HuggingFace

```bash
bash scripts/download-model.sh
```

Downloads ~2.5-3 GB to `./model-files/`.

### 3. Upload to R2

```bash
bash scripts/upload-to-r2.sh
```

Uploads every file from `./model-files/` to `r2://local-models/`, preserving
the directory structure (so `onnx/decoder_model_merged_q4f16.onnx` stays under
`onnx/`).

### 4. Apply CORS policy

The browser must be allowed to do cross-origin `GET` with `Range` headers:

```bash
wrangler r2 bucket cors put local-models --file scripts/r2-cors.json
```

The policy allows `https://vision.stratoslab.xyz` and localhost dev origins.

### 5. Bind the custom domain `local-mode.stratoslab.xyz`

Cloudflare dashboard → **R2** → bucket `local-models` → **Settings** →
**Public access** → **Connect Domain** → enter `local-mode.stratoslab.xyz`.
The DNS record is created automatically.

### 6. Verify R2

```bash
curl -I https://local-mode.stratoslab.xyz/config.json
# Expect: HTTP/2 200, content-type: application/json

curl -I -H "Range: bytes=0-0" https://local-mode.stratoslab.xyz/onnx/decoder_model_merged_q4f16.onnx
# Expect: HTTP/2 206, content-range: bytes 0-0/<size>
```

## Part 2 — Deploy the app as a Cloudflare Worker

The app is a Vite SPA served via Worker static assets (no server-side code).

### 1. Install deps + build

```bash
npm install
npm run build
```

Produces `./dist/`.

### 2. Deploy

```bash
wrangler deploy
```

Uses `wrangler.jsonc` to upload `./dist/` and bind the custom domain
`vision.stratoslab.xyz`. The route is configured as `custom_domain: true`,
so wrangler creates the proxied DNS record on first deploy (requires
`stratoslab.xyz` to be on Cloudflare DNS under account
`91dc1b5ea710fdd043ebbe0b47b418c0`).

### 3. Verify the app

```bash
curl -I https://vision.stratoslab.xyz/
# Expect: HTTP/2 200, content-type: text/html
```

Open it in a WebGPU-capable browser (Chrome/Edge 113+) and the connectivity
check in `worker.js` will probe every model file at `local-mode.stratoslab.xyz`.

## Subsequent deploys

After code changes:

```bash
npm run build && wrangler deploy
```

After adding more model files to R2:

```bash
bash scripts/upload-to-r2.sh   # skips files that haven't changed locally
```

## Reverting to HuggingFace

Edit `src/worker.js`:

```js
const MODEL_BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
// ...and remove the env.* overrides
```

# Stratos Gemma 4 Demo

Stratos is a browser-only Vite/React demo for local Canton workflow assistance. It runs Gemma 4 with WebGPU in the browser and now includes a dedicated Chrome benchmark surface for comparing baseline `dynamic` KV caching against the experimental `turboquant` cache path from the local `transformers.js` fork.

## What is here

- Main app: the existing Stratos Vision multimodal demo
- Benchmark mode: a separate browser benchmark UI at `?benchmark=1`
- Local fork wiring: Vite resolves `@huggingface/transformers` to the locally built browser bundle in `transformers.js/packages/transformers/dist/transformers.web.js`

## Install

```bash
npm install
```

The local `transformers.js` fork is expected to exist at:

```text
./transformers.js
```

If you need to rebuild the forked browser bundle after changing the fork:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --dir transformers.js/packages/transformers build
```

The build may fail at the final `typegen` step if `pnpm` is not directly on `PATH`, but the browser bundle is still emitted to `dist/transformers.web.js` before that failure.

## Run

Start the app:

```bash
npm run dev
```

Then open one of these:

- Main demo: `http://127.0.0.1:5173/`
- Benchmark page: `http://127.0.0.1:5173/?benchmark=1`

## Deployment

There are two supported paths for running this app outside of `npm run dev`.
Pick the one that matches how you need the data and compute to flow.

### 1. Secured domain services (Cloudflare Worker + R2)

A public HTTPS deployment with zero foreign runtime dependencies at inference
time. Everything the app loads comes from accounts you control:

- **App shell** — built by Vite, deployed as static assets to a Cloudflare
  Worker (`wrangler.jsonc`, `vision.stratoslab.xyz`).
- **Model weights** — mirrored from HuggingFace into a Cloudflare R2 bucket
  (`local-models`, custom domain `local-mode.stratoslab.xyz`). Upload scripts
  live under `scripts/`.
- **Service worker** — precaches the app shell + fonts + WASM runtime, so
  subsequent visits work offline after first load.
- **Model fetches at runtime** — `src/worker.js` sets
  `env.remoteHost = "https://local-mode.stratoslab.xyz"`, so
  `transformers.js` constructs URLs for R2 natively; no runtime detour
  through `huggingface.co`.
- **Lockdown posture** — no analytics, no telemetry, no external APIs; the
  only outbound request is the initial model fetch from your R2 mirror.

Deploy flow (one-time setup, then `wrangler deploy` per release):

```bash
# R2 bucket + model files (one-time)
wrangler r2 bucket create local-models
bash scripts/download-model.sh
bash scripts/upload-to-r2.sh
wrangler r2 bucket cors put local-models --file scripts/r2-cors.json
# (bind local-mode.stratoslab.xyz to the bucket via Cloudflare dashboard)

# App deploy
npm install
npm run build
wrangler deploy
```

Public URL after deploy: `https://vision.stratoslab.xyz/`

### 2. Local origin (air-gapped Node.js + mkcert)

Everything served from a single Node.js process on your own machine — the
app shell **and** the ~4.6 GB of model weights. Suitable for intranet demos,
offline laptops, or environments that cannot reach Cloudflare or HuggingFace.

- **App shell + models** — both served by `scripts/serve-local.mjs`, a
  dependency-free Node HTTP(S) server. The app shell comes from `dist/`
  and weights come from `model-files/` mounted at `/models/`.
- **Model fetches at runtime** — `src/worker.js` detects localhost or a
  LAN IP in `self.location.origin` and routes `env.remoteHost` to
  `${origin}/models` automatically. No code change needed to switch
  between the two deployment modes.
- **HTTPS on the LAN** — browsers block WebGPU and service workers on
  non-localhost HTTP origins, so intranet access needs a cert. Use
  `mkcert` (trusted) or `openssl` (self-signed, click-through).

Air-gapped run:

```bash
npm install
npm run build

# One-time cert generation (for intranet access at 192.168.0.145):
#   Option A — mkcert (installs local root CA, trusted automatically):
#     choco install mkcert  # or scoop install mkcert
#     mkcert -install
#     mkcert 192.168.0.145 localhost 127.0.0.1
#
#   Option B — openssl self-signed (browsers warn once, click through):
#     MSYS2_ARG_CONV_EXCL="*" openssl req -x509 -newkey rsa:2048 -nodes \
#       -keyout 192.168.0.145-key.pem -out 192.168.0.145.pem -days 365 \
#       -subj "/CN=192.168.0.145" \
#       -addext "subjectAltName=IP:192.168.0.145,IP:127.0.0.1,DNS:localhost"

# Serve app + models on the LAN over HTTPS:
node scripts/serve-local.mjs \
  --host 0.0.0.0 \
  --port 8787 \
  --models ./model-files \
  --cert 192.168.0.145.pem \
  --key 192.168.0.145-key.pem
```

Then open from any LAN device:

- `https://localhost:8787/`
- `https://192.168.0.145:8787/`

For localhost-only testing (no TLS needed, WebGPU works over HTTP on
localhost per W3C secure-context rules):

```bash
npm run serve               # app shell only; weights from R2
npm run serve -- --models ./model-files   # fully air-gapped
```

## Benchmark flow

The benchmark page loads a small causal LM in a browser worker and compares:

- `cache_implementation: "dynamic"`
- `cache_implementation: "turboquant"`

It reports:

- per-run latency
- average latency
- `cache_stats`
- compression ratio
- generated output for both runs

Current benchmark controls:

- `modelId`
- `maxNewTokens`
- `runs`
- `b_key`
- `b_value`
- `residual_length`

## Current TurboQuant defaults

The current conservative benchmark defaults are:

```json
{
  "b_key": 4,
  "b_value": 8,
  "residual_length": 64
}
```

These defaults keep a dense recent-token window and only compress older cache positions. They are tuned for coherence first, not for maximum compression.

## Current status

What works:

- Chrome benchmark page runs end-to-end in the browser
- local forked `transformers.js` bundle is used by the app
- `dynamic` vs `turboquant` results are visible side by side

What is still experimental:

- `turboquant` is currently slower than baseline in tested runs
- compression gains are modest with the safer defaults
- output quality is close but not exact-match stable
- Node-side `webgpu` benchmarking is still unreliable, so browser benchmarking is the preferred path

## Relevant files

- App entry: `src/main.jsx`
- Main demo UI: `src/App.jsx`
- Benchmark UI: `src/BenchmarkApp.jsx`
- Benchmark worker: `src/benchmarkWorker.js`
- App styles: `src/index.css`
- Vite alias config: `vite.config.js`

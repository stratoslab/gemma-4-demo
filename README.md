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

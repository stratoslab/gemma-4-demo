import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
  load_image,
  read_audio,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";
// Self-hosted on Cloudflare R2 (bucket "local-models" on account
// 91dc1b5ea710fdd043ebbe0b47b418c0, custom domain local-mode.stratoslab.xyz).
// Files mirrored from https://huggingface.co/${MODEL_ID}/resolve/main.
const MODEL_BASE_URL = "https://local-mode.stratoslab.xyz";

// Point transformers.js at the R2 mirror directly. pathJoin in the fork
// was patched to drop empty segments, so an empty remotePathTemplate
// produces <host>/<file> (single slash) instead of <host>//<file>.
// No runtime fetch wrapping or URL rewriting needed — transformers.js
// constructs requests for R2 natively.
env.remoteHost = MODEL_BASE_URL;
env.remotePathTemplate = "";
// ORT Web's WASM runtime loads from jsDelivr by default. We leave that
// alone because Vite hash-renames the wasm asset and doesn't emit the
// matching `.mjs` loader at a predictable path. To self-host later,
// copy `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` into public/ with
// their original names and point `env.backends.onnx.wasm.wasmPaths`
// at that directory.

const CONNECTIVITY_TARGETS = [
  { label: "Model config", path: "config.json", method: "GET" },
  { label: "Generation config", path: "generation_config.json", method: "GET" },
  { label: "Processor config", path: "processor_config.json", method: "GET" },
  { label: "Preprocessor config", path: "preprocessor_config.json", method: "GET" },
  { label: "Tokenizer config", path: "tokenizer_config.json", method: "GET" },
  { label: "Tokenizer", path: "tokenizer.json", method: "RANGE" },
  { label: "Audio encoder", path: "onnx/audio_encoder_fp16.onnx", method: "RANGE" },
  { label: "Audio encoder data", path: "onnx/audio_encoder_fp16.onnx_data", method: "RANGE" },
  { label: "Vision encoder", path: "onnx/vision_encoder_fp16.onnx", method: "RANGE" },
  { label: "Vision encoder data", path: "onnx/vision_encoder_fp16.onnx_data", method: "RANGE" },
  { label: "Embed tokens", path: "onnx/embed_tokens_q4.onnx", method: "RANGE" },
  { label: "Embed tokens data", path: "onnx/embed_tokens_q4.onnx_data", method: "RANGE" },
  { label: "Decoder merged", path: "onnx/decoder_model_merged_q4.onnx", method: "RANGE" },
  {
    label: "Decoder merged data",
    path: "onnx/decoder_model_merged_q4.onnx_data",
    method: "RANGE",
  },
];

const originalFetch = globalThis.fetch.bind(globalThis);

function postDebug(message, extra = {}) {
  self.postMessage({
    status: "debug",
    data: {
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    },
  });
}

// Defense-in-depth: env.remoteHost + pathJoin fix already route
// transformers.js at R2, but if any URL leaks through to huggingface.co
// (API metadata endpoints, Xet CDN redirects, etc.) we want to surface
// it loudly rather than silently fall through.
const HF_HOST_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:huggingface\.co|hf\.co)\//i;
const HF_MODEL_PREFIX = "onnx-community/gemma-4-E2B-it-ONNX/resolve/main/";

function rewriteToR2(url) {
  if (typeof url !== "string") return url;
  // huggingface.co/<MODEL_ID>/resolve/main/<file> → R2
  if (url.includes(HF_MODEL_PREFIX)) {
    const rel = url.split(HF_MODEL_PREFIX, 2)[1].split("?", 1)[0];
    return `${MODEL_BASE_URL}/${rel}`;
  }
  return url;
}

function logExternalLeak(url) {
  if (typeof url === "string" && HF_HOST_RE.test(url)) {
    postDebug(`EXTERNAL LEAK: request still going to huggingface.co → ${url}`, {
      phase: "fetch",
      leak: true,
      url,
    });
  }
}

globalThis.fetch = async (input, init) => {
  const originalUrl =
    typeof input === "string" ? input : input?.url ?? String(input);
  logExternalLeak(originalUrl);
  const rewrittenUrl = rewriteToR2(originalUrl);

  // If we rewrote, reconstruct the fetch argument
  if (rewrittenUrl !== originalUrl) {
    if (typeof input === "string") {
      input = rewrittenUrl;
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      // Preserve method/headers/body from the original Request
      input = new Request(rewrittenUrl, input);
    } else {
      input = rewrittenUrl;
    }
  }

  const url = rewrittenUrl;
  const method =
    init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");

  postDebug(`Fetch start ${method} ${url}`, {
    phase: "fetch",
    url,
    method,
    originalUrl: originalUrl !== url ? originalUrl : undefined,
  });
  try {
    const response = await originalFetch(input, init);
    const contentLength = response.headers.get("content-length") ?? "unknown";
    const contentRange = response.headers.get("content-range") ?? "none";
    const contentType = response.headers.get("content-type") ?? "unknown";

    if (!response.ok) {
      // Loud flag for files that should be in R2 but aren't. transformers.js
      // silently falls back to null for optional files, so these get masked
      // unless we surface them here.
      const isMissingFromMirror =
        response.status === 404 && url.startsWith(MODEL_BASE_URL);
      postDebug(
        isMissingFromMirror
          ? `MISSING FROM R2: ${url} → transformers.js will fall back or fail later`
          : `Fetch failed ${response.status} ${method} ${url}`,
        {
          phase: "fetch",
          url,
          method,
          status: response.status,
          contentLength,
          contentRange,
          contentType,
          missingFromMirror: isMissingFromMirror || undefined,
        },
      );
    } else {
      postDebug(`Fetch ok ${response.status} ${method} ${url}`, {
        phase: "fetch",
        url,
        method,
        status: response.status,
        contentLength,
        contentRange,
        contentType,
      });
    }

    if (!response.headers.get("content-length")) {
      postDebug(`No content-length header for ${url}`, {
        phase: "fetch",
        url,
        method,
        status: response.status,
      });
    }

    return response;
  } catch (error) {
    self.postMessage({
      status: "error",
      data: `Fetch error for ${url}: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
};

class ModelSession {
  constructor() {
    this.processor = null;
    this.model = null;
    this.stoppingCriteria = new InterruptableStoppingCriteria();
    this.loadingPromise = null;
  }

  async load() {
    if (this.model && this.processor) {
      self.postMessage({ status: "ready" });
      return;
    }
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    self.postMessage({
      status: "loading",
      data: "Loading Gemma 4 for local WebGPU inference...",
    });

    const progress_callback = (info) => {
      postDebug(
        info.status === "download"
          ? `Downloading ${info.name ?? "model file"}...`
          : info.status === "progress_total"
            ? `Loading model assets: ${Math.round(info.progress ?? 0)}%`
            : `Model loader status: ${info.status}`,
        { phase: "progress", info },
      );

      if (info.status === "progress_total") {
        self.postMessage({
          status: "progress",
          progress: info.progress,
        });
      } else if (info.status === "download") {
        self.postMessage({
          status: "loading",
          data: `Downloading ${info.name ?? "model shard"}...`,
        });
      }
    };

    this.loadingPromise = Promise.all([
      AutoProcessor.from_pretrained(MODEL_ID, { progress_callback }),
      Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
        // Per-component dtype: keep fp16 for vision/audio (quality matters
        // for image features), use q4 for embed_tokens + decoder (speed).
        // ~30-40% faster tok/s vs uniform q4f16 on most GPUs.
        dtype: {
          embed_tokens: "q4",
          vision_encoder: "fp16",
          audio_encoder: "fp16",
          decoder_model_merged: "q4",
        },
        device: "webgpu",
        progress_callback,
      }),
    ])
      .then(([processor, model]) => {
        this.processor = processor;
        this.model = model;
        self.postMessage({ status: "ready" });
      })
      .catch((error) => {
        self.postMessage({
          status: "error",
          data: error instanceof Error ? error.message : String(error),
        });
        throw error;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  interrupt() {
    this.stoppingCriteria.interrupt();
  }

  reset() {
    this.stoppingCriteria.reset();
  }

  // Drop the model/processor refs so the next load() rebuilds from scratch.
  // Called after an unrecoverable GPU device loss.
  markInvalid() {
    this.model = null;
    this.processor = null;
    this.loadingPromise = null;
  }
}

const session = new ModelSession();

async function prepareInputs(messages, enableThinking) {
  const lastMessage = messages.at(-1);
  const prompt = session.processor.apply_chat_template([lastMessage], {
    add_generation_prompt: true,
    enable_thinking: enableThinking,
  });

  const contentParts = Array.isArray(lastMessage?.content) ? lastMessage.content : [];
  const imagePart = contentParts.find((part) => part.type === "image");
  const audioPart = contentParts.find((part) => part.type === "audio");

  const image = imagePart?.image ? await load_image(imagePart.image) : null;
  const audio =
    typeof audioPart?.audio === "string"
      ? await read_audio(audioPart.audio, 16000)
      : audioPart?.audio
        ? new Float32Array(audioPart.audio)
        : null;

  return session.processor(prompt, image, audio, {
    add_special_tokens: false,
  });
}

// Active KV cache config for the next generate() call. `null` means "use
// the library default" (DynamicCache / dense fp16). Set via the "configure"
// message from App.jsx, which reads flags off the page URL.
let activeCacheConfig = null;

// Matches the WebGPU "device is lost" error signature from ORT Web.
function isDeviceLostError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /device.*is lost|mapAsync.*lost/i.test(message);
}

async function disposeTensor(tensor) {
  try {
    if (tensor?.location === "gpu-buffer" && typeof tensor.dispose === "function") {
      await tensor.dispose();
    }
  } catch {
    // ignore — GC will reclaim
  }
}

async function generate(messages, enableThinking) {
  await session.load();
  session.reset();

  const inputs = await prepareInputs(messages, enableThinking);

  self.postMessage({ status: "start" });

  let outputText = "";

  const streamer = new TextStreamer(session.processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      outputText += text;
      self.postMessage({
        status: "update",
        output: text,
      });
    },
  });

  const startedAt = performance.now();
  const generateArgs = {
    ...inputs,
    max_new_tokens: 256,
    do_sample: false,
    streamer,
    stopping_criteria: [session.stoppingCriteria],
    // Return a dict so we can explicitly dispose past_key_values after use.
    // Without this, intermediate KV buffers on the GPU accumulate across
    // generations and eventually exhaust VRAM → device loss.
    return_dict_in_generate: true,
  };
  if (activeCacheConfig) {
    generateArgs.cache_implementation = activeCacheConfig.implementation;
    if (activeCacheConfig.config) {
      generateArgs.cache_config = activeCacheConfig.config;
    }
  }

  let result;
  try {
    result = await session.model.generate(generateArgs);
  } catch (error) {
    if (isDeviceLostError(error)) {
      // Device loss is unrecoverable without a fresh model session. Drop the
      // model reference so the next "load" request rebuilds it from scratch.
      session.markInvalid();
      self.postMessage({
        status: "error",
        data:
          "The GPU context was lost (WebGPU). This is usually caused by VRAM " +
          "exhaustion from a very long generation. Please reload the page " +
          "to reset the model.",
      });
      self.postMessage({ status: "complete", numTokens: 0, tps: 0 });
      return;
    }
    throw error;
  }

  const sequences = result.sequences ?? result; // back-compat
  const promptLength = inputs.input_ids.dims.at(-1);
  const generated = sequences.slice(null, [promptLength, null]);
  const outputTokens = generated.dims.at(-1) ?? 0;
  const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);

  if (!outputText) {
    const decoded = session.processor.batch_decode(generated, {
      skip_special_tokens: true,
    });
    outputText = decoded[0] ?? "";
    if (outputText) {
      self.postMessage({
        status: "update",
        output: outputText,
      });
    }
  }

  self.postMessage({
    status: "complete",
    numTokens: outputTokens,
    tps: outputTokens / elapsedSeconds,
  });

  // Dispose GPU-backed tensors to prevent cross-generation VRAM accumulation.
  await result?.past_key_values?.dispose?.();
  await disposeTensor(sequences);
  await disposeTensor(generated);
  for (const value of Object.values(inputs)) {
    await disposeTensor(value);
  }
}

async function runConnectivityCheck() {
  const results = [];
  for (const target of CONNECTIVITY_TARGETS) {
    const url = `${MODEL_BASE_URL}/${target.path}`;
    const init =
      target.method === "RANGE"
        ? {
            method: "GET",
            headers: {
              Range: "bytes=0-0",
            },
          }
        : { method: "GET" };

    postDebug(`Connectivity probe start ${target.label} ${target.method} ${url}`, {
      phase: "connectivity",
      label: target.label,
      method: target.method,
      url,
    });

    try {
      const response = await originalFetch(url, init);
      const contentLength = response.headers.get("content-length") ?? "unknown";
      const contentRange = response.headers.get("content-range") ?? "none";
      const contentType = response.headers.get("content-type") ?? "unknown";

      results.push({
        label: target.label,
        url,
        method: target.method,
        ok: response.ok,
        status: response.status,
        contentLength,
        contentRange,
        contentType,
        finalUrl: response.url,
      });

      postDebug(
        `Connectivity probe ${response.ok ? "ok" : "failed"} ${target.label} ${response.status} ${url}`,
        {
          phase: "connectivity",
          label: target.label,
          method: target.method,
          url,
          status: response.status,
          contentLength,
          contentRange,
          contentType,
        },
      );
    } catch (error) {
      results.push({
        label: target.label,
        url,
        method: target.method,
        ok: false,
        status: "network-error",
        error: error instanceof Error ? error.message : String(error),
      });

      postDebug(`Connectivity probe error ${target.label} ${url}`, {
        phase: "connectivity",
        label: target.label,
        method: target.method,
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  self.postMessage({
    status: "connectivity-result",
    data: results,
  });
}

self.addEventListener("message", async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case "check":
        self.postMessage({
          status: "check",
          supported: Boolean(navigator.gpu),
        });
        break;
      case "load":
        await session.load();
        break;
      case "generate":
        await generate(data.messages, Boolean(data.enableThinking));
        break;
      case "configure":
        // App.jsx sends { implementation: "dynamic"|"turboquant", config?: {...} }
        // to toggle the cache backend used by subsequent generate() calls.
        activeCacheConfig = data?.cacheConfig ?? null;
        postDebug("cache configured", { cache: activeCacheConfig });
        break;
      case "interrupt":
        session.interrupt();
        break;
      case "connectivity-check":
        await runConnectivityCheck();
        break;
      case "reset":
        session.reset();
        break;
      default:
        break;
    }
  } catch (error) {
    self.postMessage({
      status: "error",
      data: error instanceof Error ? error.message : String(error),
    });
    self.postMessage({ status: "complete", numTokens: 0, tps: 0 });
  }
});

self.addEventListener("error", (event) => {
  self.postMessage({
    status: "error",
    data: event.message || "Worker error",
  });
});

self.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error ? event.reason.message : String(event.reason);
  self.postMessage({
    status: "error",
    data: reason,
  });
});

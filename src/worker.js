import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  InterruptableStoppingCriteria,
  TextStreamer,
  load_image,
  read_audio,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";
const MODEL_BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
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
  { label: "Embed tokens", path: "onnx/embed_tokens_q4f16.onnx", method: "RANGE" },
  { label: "Embed tokens data", path: "onnx/embed_tokens_q4f16.onnx_data", method: "RANGE" },
  { label: "Decoder merged", path: "onnx/decoder_model_merged_q4f16.onnx", method: "RANGE" },
  {
    label: "Decoder merged data",
    path: "onnx/decoder_model_merged_q4f16.onnx_data",
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

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  const method =
    init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");

  postDebug(`Fetch start ${method} ${url}`, { phase: "fetch", url, method });
  try {
    const response = await originalFetch(input, init);
    const contentLength = response.headers.get("content-length") ?? "unknown";
    const contentRange = response.headers.get("content-range") ?? "none";
    const contentType = response.headers.get("content-type") ?? "unknown";

    if (!response.ok) {
      postDebug(`Fetch failed ${response.status} ${method} ${url}`, {
        phase: "fetch",
        url,
        method,
        status: response.status,
        contentLength,
        contentRange,
        contentType,
      });
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
        dtype: "q4f16",
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
}

const session = new ModelSession();

function formatMessages(messages) {
  const lastUserIndex = [...messages]
    .reverse()
    .findIndex((message) => message.role === "user");
  const absoluteLastUserIndex =
    lastUserIndex === -1 ? -1 : messages.length - 1 - lastUserIndex;

  return messages.map((message, index) => {
    if (message.role === "assistant") {
      return { role: "assistant", content: message.content };
    }

    const isLatestUser = index === absoluteLastUserIndex;
    const parts = [];

    if (isLatestUser && message.image) {
      parts.push({ type: "image" });
    }
    if (isLatestUser && message.audio) {
      parts.push({ type: "audio" });
    }

    if (message.content?.trim()) {
      parts.push({ type: "text", text: message.content.trim() });
    } else if (parts.length === 0) {
      parts.push({ type: "text", text: "Describe what you see." });
    }

    if (!isLatestUser && message.image) {
      parts.push({ type: "text", text: "[Image shared earlier in the conversation]" });
    }
    if (!isLatestUser && message.audio) {
      parts.push({ type: "text", text: "[Audio shared earlier in the conversation]" });
    }

    return { role: "user", content: parts };
  });
}

async function prepareInputs(messages, enableThinking) {
  const promptMessages = formatMessages(messages);
  const prompt = session.processor.apply_chat_template(promptMessages, {
    add_generation_prompt: true,
    enable_thinking: enableThinking,
  });

  const latestUser = [...messages].reverse().find((message) => message.role === "user");

  const image = latestUser?.image ? await load_image(latestUser.image) : null;
  const audio =
    typeof latestUser?.audio === "string"
      ? await read_audio(latestUser.audio, 16000)
      : latestUser?.audio
        ? new Float32Array(latestUser.audio)
        : null;

  return session.processor(prompt, image, audio, {
    add_special_tokens: false,
  });
}

async function generate(messages, enableThinking) {
  await session.load();
  session.reset();

  const inputs = await prepareInputs(messages, enableThinking);

  self.postMessage({ status: "start" });

  let outputText = "";

  const streamer = new TextStreamer(session.processor.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: (text) => {
      outputText += text;
      self.postMessage({
        status: "update",
        output: text,
      });
    },
  });

  const startedAt = performance.now();
  const outputs = await session.model.generate({
    ...inputs,
    max_new_tokens: 1024,
    do_sample: false,
    streamer,
    stopping_criteria: [session.stoppingCriteria],
  });

  const promptLength = inputs.input_ids.dims.at(-1);
  const generated = outputs.slice(null, [promptLength, null]);
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

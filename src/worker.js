import {
  AutoModelForImageTextToText,
  AutoProcessor,
  InterruptableStoppingCriteria,
  TextStreamer,
  load_image,
} from "@huggingface/transformers";

const MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";

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

    this.loadingPromise = Promise.all([
      AutoProcessor.from_pretrained(MODEL_ID),
      AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
        dtype: {
          audio_encoder: "fp16",
          vision_encoder: "fp16",
          embed_tokens: "q4f16",
          decoder_model_merged: "q4f16",
        },
        device: "webgpu",
        progress_callback: (info) => {
          self.postMessage({
            status: "debug",
            data: {
              phase: "progress",
              message:
                info.status === "download"
                  ? `Downloading ${info.name ?? "model file"}...`
                  : info.status === "progress_total"
                    ? `Loading model assets: ${Math.round(info.progress ?? 0)}%`
                    : `Model loader status: ${info.status}`,
            },
          });
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
        },
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
  const audio = latestUser?.audio
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

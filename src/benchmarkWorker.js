import { AutoModelForCausalLM, AutoTokenizer } from "@huggingface/transformers";

const DEFAULT_MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

let tokenizer = null;
let model = null;
let currentModelId = null;
let loadingPromise = null;

function post(message) {
  self.postMessage(message);
}

async function ensureLoaded(modelId) {
  if (tokenizer && model && currentModelId === modelId) {
    post({ status: "ready", modelId });
    return;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = Promise.all([
    AutoTokenizer.from_pretrained(modelId, {
      progress_callback: (info) => post({ status: "progress", phase: "tokenizer", info }),
    }),
    AutoModelForCausalLM.from_pretrained(modelId, {
      dtype: "q4",
      device: "webgpu",
      progress_callback: (info) => post({ status: "progress", phase: "model", info }),
    }),
  ])
    .then(([nextTokenizer, nextModel]) => {
      tokenizer = nextTokenizer;
      model = nextModel;
      currentModelId = modelId;
      post({ status: "ready", modelId });
    })
    .catch((error) => {
      post({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

async function disposeGenerationResult(result) {
  await result?.past_key_values?.dispose?.();
  result?.sequences?.dispose?.();
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

async function runCase(prompt, options) {
  const {
    runs,
    maxNewTokens,
    cacheImplementation,
    cacheConfig,
  } = options;

  let lastResult = null;
  const timings = [];

  for (let i = 0; i < runs; i += 1) {
    const captureResult = i === runs - 1;
    const startedAt = performance.now();
    const result = await model.generate({
      ...prompt,
      max_new_tokens: maxNewTokens,
      do_sample: false,
      return_dict_in_generate: captureResult,
      cache_implementation: cacheImplementation,
      cache_config: cacheImplementation === "turboquant" ? cacheConfig : undefined,
    });
    timings.push(performance.now() - startedAt);
    if (captureResult) {
      lastResult = result;
    }
  }

  const output = tokenizer.batch_decode(lastResult.sequences, {
    skip_special_tokens: true,
  })[0];

  const payload = {
    timings,
    averageMs: average(timings),
    cacheStats: lastResult.cache_stats,
    output,
  };

  await disposeGenerationResult(lastResult);
  return payload;
}

async function runBenchmark({
  modelId = DEFAULT_MODEL_ID,
  prompt,
  maxNewTokens = 32,
  runs = 1,
  cacheConfig = {
    b_key: 4,
    b_value: 8,
    residual_length: 64,
  },
}) {
  await ensureLoaded(modelId);

  const messages = [
    { role: "system", content: "You are a concise assistant." },
    { role: "user", content: prompt },
  ];

  const encodedPrompt = tokenizer.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_dict: true,
  });

  post({ status: "phase", message: "Warming up dynamic cache..." });
  const warmup = await model.generate({
    ...encodedPrompt,
    max_new_tokens: 8,
    do_sample: false,
    return_dict_in_generate: true,
    cache_implementation: "dynamic",
  });
  await disposeGenerationResult(warmup);

  post({ status: "phase", message: "Running dynamic benchmark..." });
  const dynamic = await runCase(encodedPrompt, {
    runs,
    maxNewTokens,
    cacheImplementation: "dynamic",
  });

  post({ status: "phase", message: "Running turboquant benchmark..." });
  const turboquant = await runCase(encodedPrompt, {
    runs,
    maxNewTokens,
    cacheImplementation: "turboquant",
    cacheConfig,
  });

  post({
    status: "complete",
    result: {
      modelId,
      prompt,
      maxNewTokens,
      runs,
      cacheConfig,
      dynamic,
      turboquant,
    },
  });
}

self.addEventListener("message", async (event) => {
  const { type, data } = event.data ?? {};

  try {
    switch (type) {
      case "load":
        post({ status: "phase", message: "Loading benchmark model..." });
        await ensureLoaded(data?.modelId ?? DEFAULT_MODEL_ID);
        break;
      case "benchmark":
        await runBenchmark(data ?? {});
        break;
      default:
        break;
    }
  } catch (error) {
    post({
      status: "error",
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error),
    });
  }
});

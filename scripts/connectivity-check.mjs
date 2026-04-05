#!/usr/bin/env node
// Mirrors src/worker.js runConnectivityCheck() exactly — hits every
// CONNECTIVITY_TARGET at MODEL_BASE_URL with the same method the worker uses.

const MODEL_BASE_URL = "https://local-mode.stratoslab.xyz";
const ORIGIN = "https://vision.stratoslab.xyz";

const CONNECTIVITY_TARGETS = [
  { label: "Model config",         path: "config.json",                               method: "GET" },
  { label: "Generation config",    path: "generation_config.json",                    method: "GET" },
  { label: "Processor config",     path: "processor_config.json",                     method: "GET" },
  { label: "Preprocessor config",  path: "preprocessor_config.json",                  method: "GET" },
  { label: "Tokenizer config",     path: "tokenizer_config.json",                     method: "GET" },
  { label: "Tokenizer",            path: "tokenizer.json",                            method: "RANGE" },
  { label: "Audio encoder",        path: "onnx/audio_encoder_fp16.onnx",              method: "RANGE" },
  { label: "Audio encoder data",   path: "onnx/audio_encoder_fp16.onnx_data",         method: "RANGE" },
  { label: "Vision encoder",       path: "onnx/vision_encoder_fp16.onnx",             method: "RANGE" },
  { label: "Vision encoder data",  path: "onnx/vision_encoder_fp16.onnx_data",        method: "RANGE" },
  { label: "Embed tokens",         path: "onnx/embed_tokens_q4f16.onnx",              method: "RANGE" },
  { label: "Embed tokens data",    path: "onnx/embed_tokens_q4f16.onnx_data",         method: "RANGE" },
  { label: "Decoder merged",       path: "onnx/decoder_model_merged_q4f16.onnx",      method: "RANGE" },
  { label: "Decoder merged data",  path: "onnx/decoder_model_merged_q4f16.onnx_data", method: "RANGE" },
];

let failures = 0;

console.log(`Connectivity check: ${MODEL_BASE_URL}`);
console.log(`(Origin: ${ORIGIN})\n`);
console.log(
  "STATUS METHOD LABEL".padEnd(48) +
    "SIZE".padEnd(15) +
    "CORS".padEnd(8) +
    "CT",
);
console.log("─".repeat(100));

for (const target of CONNECTIVITY_TARGETS) {
  const url = `${MODEL_BASE_URL}/${target.path}`;
  const init =
    target.method === "RANGE"
      ? { method: "GET", headers: { Range: "bytes=0-0", Origin: ORIGIN } }
      : { method: "GET", headers: { Origin: ORIGIN } };

  try {
    const res = await fetch(url, init);
    const contentLength = res.headers.get("content-length") ?? "—";
    const contentRange = res.headers.get("content-range") ?? "—";
    const contentType = res.headers.get("content-type") ?? "—";
    const cors = res.headers.get("access-control-allow-origin") ?? "—";

    const expected = target.method === "RANGE" ? 206 : 200;
    const ok = res.status === expected;
    const marker = ok ? "✓" : "✗";
    if (!ok) failures++;

    const sizeInfo =
      target.method === "RANGE"
        ? contentRange.replace("bytes ", "")
        : contentLength;

    console.log(
      `${marker} ${String(res.status).padEnd(3)} ${target.method.padEnd(6)} ${target.label}`.padEnd(48) +
        String(sizeInfo).padEnd(15) +
        (cors === ORIGIN ? "✓" : "✗").padEnd(8) +
        contentType,
    );
  } catch (err) {
    failures++;
    console.log(
      `✗ ERR ${target.method.padEnd(6)} ${target.label}`.padEnd(48) +
        String(err.message),
    );
  }
}

console.log();
if (failures === 0) {
  console.log(`All ${CONNECTIVITY_TARGETS.length} targets healthy ✓`);
} else {
  console.log(`${failures} / ${CONNECTIVITY_TARGETS.length} targets FAILED ✗`);
  process.exit(1);
}

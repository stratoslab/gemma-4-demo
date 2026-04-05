#!/usr/bin/env node
// One-off: upload only the q4 ONNX data files via r2-upload-proxy Worker.

import { statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_URL = "https://r2-upload-proxy.primelayer.workers.dev";
const AUTH_TOKEN = "0200826966665e6740c8af87e78249c9fb059b06f4d3f584";
const PART_SIZE = 60 * 1024 * 1024;
const MAX_PARALLEL = 3;

const FILES = [
  {
    local: resolve(__dirname, "..", "model-files", "onnx", "decoder_model_merged_q4.onnx_data"),
    key: "onnx/decoder_model_merged_q4.onnx_data",
  },
  {
    local: resolve(__dirname, "..", "model-files", "onnx", "embed_tokens_q4.onnx_data"),
    key: "onnx/embed_tokens_q4.onnx_data",
  },
];

function human(b) { const m = b/1024/1024; return m >= 1024 ? `${(m/1024).toFixed(2)} GiB` : `${m.toFixed(1)} MiB`; }

async function postJson(path, body) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: { "x-auth-token": AUTH_TOKEN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function uploadPart(key, uploadId, partNumber, buffer) {
  const qs = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
  const res = await fetch(`${WORKER_URL}/part?${qs}`, {
    method: "PUT",
    headers: { "x-auth-token": AUTH_TOKEN, "content-type": "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`part ${partNumber}: ${res.status} ${await res.text()}`);
  return res.json();
}

function readPart(fd, offset, length) {
  const buf = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = readSync(fd, buf, read, length - read, offset + read);
    if (n === 0) break;
    read += n;
  }
  return buf;
}

for (const { local, key } of FILES) {
  const size = statSync(local).size;
  const numParts = Math.ceil(size / PART_SIZE);
  console.log(`\n→ ${key} (${human(size)}, ${numParts} parts)`);
  const { uploadId } = await postJson("/init", { key });
  const fd = openSync(local, "r");
  const parts = new Array(numParts);
  let completed = 0;
  let nextPart = 1;

  try {
    async function worker() {
      while (true) {
        const pn = nextPart++;
        if (pn > numParts) return;
        const offset = (pn - 1) * PART_SIZE;
        const length = Math.min(PART_SIZE, size - offset);
        const buf = readPart(fd, offset, length);
        const { etag } = await uploadPart(key, uploadId, pn, buf);
        parts[pn - 1] = { partNumber: pn, etag };
        completed++;
        process.stdout.write(`\r  ${completed}/${numParts} (${Math.floor(completed/numParts*100)}%)   `);
      }
    }
    await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));
    process.stdout.write("\n");
    await postJson("/complete", { key, uploadId, parts });
    console.log("  done.");
  } catch (err) {
    console.error(`  fail: ${err.message}`);
    try { await postJson("/abort", { key, uploadId }); } catch {}
    process.exit(1);
  } finally {
    closeSync(fd);
  }
}

console.log("\nAll q4 files uploaded.");

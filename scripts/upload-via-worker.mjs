#!/usr/bin/env node
// Uploads files >= 300 MiB from ./model-files/ to R2 bucket `local-models`
// via the r2-upload-proxy Worker (deployed from scripts/upload-worker/).
//
// Uses R2's native multipart upload API through the Worker's R2 binding,
// so no R2 S3 credentials are needed — just the Worker's AUTH_TOKEN.
//
// Usage:  node scripts/upload-via-worker.mjs

import { readdirSync, statSync, createReadStream, openSync, readSync, closeSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, "..", "model-files");
const WORKER_URL = "https://r2-upload-proxy.primelayer.workers.dev";
const AUTH_TOKEN = "0200826966665e6740c8af87e78249c9fb059b06f4d3f584";
const MIN_BYTES = 300 * 1024 * 1024;     // threshold for "big" files
const PART_SIZE = 60 * 1024 * 1024;      // 60 MiB (under Worker 100 MiB limit)
const MAX_PARALLEL = 3;                   // parallel part uploads per file

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function human(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GiB` : `${mb.toFixed(1)} MiB`;
}

async function postJson(path, body) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: { "x-auth-token": AUTH_TOKEN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function uploadPart(key, uploadId, partNumber, buffer) {
  const qs = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
  const res = await fetch(`${WORKER_URL}/part?${qs}`, {
    method: "PUT",
    headers: { "x-auth-token": AUTH_TOKEN, "content-type": "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`PUT /part ${partNumber} failed: ${res.status} ${await res.text()}`);
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
  return read === length ? buf : buf.subarray(0, read);
}

async function uploadFile(filePath) {
  const key = relative(SRC_DIR, filePath).replace(/\\/g, "/");
  const size = statSync(filePath).size;
  const numParts = Math.ceil(size / PART_SIZE);
  console.log(`\n→ ${key} (${human(size)}, ${numParts} parts)`);

  const { uploadId } = await postJson("/init", { key });
  console.log(`  uploadId=${uploadId.slice(0, 16)}...`);

  const fd = openSync(filePath, "r");
  const parts = new Array(numParts);
  let completed = 0;

  try {
    // Upload parts with bounded parallelism
    let nextPart = 1;
    async function worker() {
      while (true) {
        const partNumber = nextPart++;
        if (partNumber > numParts) return;
        const offset = (partNumber - 1) * PART_SIZE;
        const length = Math.min(PART_SIZE, size - offset);
        const buf = readPart(fd, offset, length);
        const { etag } = await uploadPart(key, uploadId, partNumber, buf);
        parts[partNumber - 1] = { partNumber, etag };
        completed++;
        process.stdout.write(
          `\r  parts: ${completed}/${numParts} (${((completed / numParts) * 100).toFixed(0)}%)   `,
        );
      }
    }

    await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));
    process.stdout.write("\n");

    await postJson("/complete", { key, uploadId, parts });
    console.log(`  done.`);
  } catch (err) {
    console.error(`\n  upload failed: ${err.message}`);
    try {
      await postJson("/abort", { key, uploadId });
      console.error(`  aborted multipart upload.`);
    } catch {}
    throw err;
  } finally {
    closeSync(fd);
  }
}

const all = walkFiles(SRC_DIR);
const big = all.filter((p) => statSync(p).size >= MIN_BYTES);

if (big.length === 0) {
  console.log("No files >= 300 MiB found in model-files/.");
  process.exit(0);
}

console.log(`Uploading ${big.length} files via ${WORKER_URL}`);
const totalBytes = big.reduce((s, p) => s + statSync(p).size, 0);
console.log(`Total: ${human(totalBytes)}`);

for (const p of big) {
  await uploadFile(p);
}

console.log("\nAll big files uploaded.");

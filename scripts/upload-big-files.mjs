#!/usr/bin/env node
// Multipart upload of files >= 300 MiB to R2 bucket `local-models`
// using the S3-compatible API. Files < 300 MiB are uploaded via
// scripts/upload-to-r2.sh (wrangler).
//
// Create R2 S3 credentials:
//   Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API Token
//   → Admin Read & Write → Apply to specific bucket: local-models
//
// Then either:
//   1. Copy scripts/.env.example to scripts/.env and fill in, OR
//   2. Export env vars: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//
// Usage:  node scripts/upload-big-files.mjs

import { readFileSync, statSync, createReadStream, readdirSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, "..", "model-files");
const BUCKET = "local-models";
const ACCOUNT_ID = "91dc1b5ea710fdd043ebbe0b47b418c0";
const MIN_BYTES = 300 * 1024 * 1024;  // only upload files >= 300 MiB here

// Load .env if present
try {
  const envPath = resolve(__dirname, ".env");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* .env is optional */
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (!accessKeyId || !secretAccessKey) {
  console.error("ERROR: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set.");
  console.error("See scripts/.env.example");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function contentTypeFor(key) {
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function human(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GiB` : `${mb.toFixed(1)} MiB`;
}

const all = walkFiles(SRC_DIR);
const big = all.filter((p) => statSync(p).size >= MIN_BYTES);

if (big.length === 0) {
  console.log("No files >= 300 MiB found in model-files/. Nothing to do.");
  process.exit(0);
}

console.log(`Uploading ${big.length} files to r2://${BUCKET}/ via multipart:\n`);

for (const filePath of big) {
  const key = relative(SRC_DIR, filePath).replace(/\\/g, "/");
  const size = statSync(filePath).size;
  console.log(`  → ${key} (${human(size)})`);

  const upload = new Upload({
    client,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentTypeFor(key),
    },
    queueSize: 4,          // parallel part uploads
    partSize: 64 * 1024 * 1024,  // 64 MiB parts
    leavePartsOnError: false,
  });

  let lastPct = -1;
  upload.on("httpUploadProgress", (p) => {
    if (p.total) {
      const pct = Math.floor((p.loaded / p.total) * 100);
      if (pct !== lastPct) {
        process.stdout.write(`\r    ${pct}% (${human(p.loaded)} / ${human(p.total)})   `);
        lastPct = pct;
      }
    }
  });

  try {
    await upload.done();
    console.log(`\r    done.                                             `);
  } catch (err) {
    console.error(`\n    ERROR: ${err.message}`);
    process.exit(1);
  }
}

console.log("\nAll big files uploaded.");

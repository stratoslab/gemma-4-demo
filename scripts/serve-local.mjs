#!/usr/bin/env node
// Serve the built Vite SPA on localhost via Node's http module. Alternative
// to the Cloudflare Workers deploy for local/air-gapped use.
//
// Usage:
//   npm run build
//   node scripts/serve-local.mjs [--port 8787] [--dir dist]
//
// WebGPU + Service Worker both work on http://localhost (W3C secure context),
// so no TLS setup is required. For LAN access from another device, use mkcert
// or a reverse proxy — browsers reject WebGPU over plain HTTP on non-localhost.

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "8787" },
    dir: { type: "string", short: "d", default: "dist" },
    host: { type: "string", default: "127.0.0.1" },
  },
});

const ROOT = resolve(process.cwd(), values.dir);
const PORT = Number(values.port);
const HOST = values.host;

try {
  statSync(ROOT).isDirectory();
} catch {
  console.error(`Build dir not found: ${ROOT}`);
  console.error(`Run "npm run build" first, or pass --dir <path>.`);
  process.exit(1);
}

// Map file extensions to the MIME types browsers actually demand. Critical
// ones: .wasm needs application/wasm (streaming instantiation), .mjs needs
// text/javascript (strict MIME check on module scripts).
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".jinja": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// WebGPU requires cross-origin isolation for some features (SharedArrayBuffer,
// worker threads). These headers enable it without needing HTTPS on localhost.
const COOP_COEP_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    ...COOP_COEP_HEADERS,
    "Cache-Control": "no-cache",
    ...extraHeaders,
  });
  res.end(body);
}

function resolveSafePath(urlPath) {
  // Strip query string + hash, decode, normalize. Reject any path that
  // escapes the build dir.
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const requested = normalize(join(ROOT, clean));
  if (!requested.startsWith(ROOT)) return null;
  return requested;
}

function tryServeFile(res, filePath) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return false;
  }
  if (stat.isDirectory()) {
    return tryServeFile(res, join(filePath, "index.html"));
  }
  const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, {
    ...COOP_COEP_HEADERS,
    "Content-Type": type,
    "Content-Length": stat.size,
    // App shell assets are precached by the service worker; short TTL is fine.
    "Cache-Control": filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(filePath).pipe(res);
  return true;
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed");
  }
  const requested = resolveSafePath(req.url ?? "/");
  if (!requested) {
    return send(res, 400, "Bad Request");
  }
  if (tryServeFile(res, requested)) return;
  // SPA fallback — for paths that aren't files, serve index.html so React
  // Router / manual URL entry both work (mirrors wrangler's
  // "not_found_handling": "single-page-application").
  if (tryServeFile(res, join(ROOT, "index.html"))) return;
  send(res, 404, "Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${values.dir}/ at http://${HOST}:${PORT}/`);
  console.log("  (Ctrl-C to stop)");
  console.log("");
  console.log("Notes:");
  console.log("  - WebGPU works over http://localhost (secure context exception).");
  console.log("  - For LAN access, generate local TLS with mkcert or use a tunnel.");
  console.log("  - App fetches model weights from local-mode.stratoslab.xyz by default;");
  console.log("    edit src/worker.js env.remoteHost to point elsewhere if needed.");
});

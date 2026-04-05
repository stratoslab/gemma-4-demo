#!/usr/bin/env node
// Playwright benchmark against the deployed app.
// Opens vision.stratoslab.xyz, loads the model, runs one scan,
// captures tok/s + timings.

import { chromium } from "playwright";

const APP_URL = "https://vision.stratoslab.xyz";
const SNAPSHOT_URL = "http://host.docker.internal:1984/api/frame.jpeg?src=cam1";
// Fallback — try localhost from browser perspective
const SNAPSHOT_URL_LOCAL = "http://localhost:1984/api/frame.jpeg?src=cam1";

const start = Date.now();
const t = () => `[${((Date.now() - start) / 1000).toFixed(1)}s]`;

console.log(`${t()} Launching Chromium with WebGPU...`);

const browser = await chromium.launch({
  headless: false,  // full chromium — headless shell lacks WebGPU
  args: [
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--ignore-gpu-blocklist",
    "--enable-gpu",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});

const page = await context.newPage();

// Collect console logs from the page
const consoleLines = [];
page.on("console", (msg) => {
  const text = msg.text();
  consoleLines.push(text);
  if (/error|warn|webgpu|adapter/i.test(text)) {
    console.log(`${t()} [console] ${text}`);
  }
});
page.on("pageerror", (err) => console.log(`${t()} [pageerror] ${err.message}`));

console.log(`${t()} Checking WebGPU adapter...`);
await page.goto("about:blank");
const adapterInfo = await page.evaluate(async () => {
  if (!navigator.gpu) return { supported: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false, reason: "no adapter" };
    const info = adapter.info ?? await adapter.requestAdapterInfo?.();
    return { supported: true, info };
  } catch (e) {
    return { supported: false, reason: e.message };
  }
});
console.log(`${t()} WebGPU:`, JSON.stringify(adapterInfo));

if (!adapterInfo.supported) {
  console.log(`${t()} WebGPU not available in this Chromium build — aborting.`);
  await browser.close();
  process.exit(1);
}

console.log(`${t()} Opening ${APP_URL}...`);
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

console.log(`${t()} Waiting for landing page...`);
await page.waitForSelector("button:has-text('Load Gemma 4'), button:has-text('WebGPU Unavailable')", { timeout: 30000 });

const btnText = await page.textContent("button.primary-button");
console.log(`${t()} Landing button: "${btnText}"`);

if (!btnText?.includes("Load Gemma 4")) {
  console.log(`${t()} WebGPU not supported per app check — aborting`);
  await browser.close();
  process.exit(1);
}

const loadStart = Date.now();
console.log(`${t()} Clicking Load Gemma 4...`);
await page.click("button:has-text('Load Gemma 4')");

// Wait for app-shell (= model loaded)
console.log(`${t()} Waiting for model ready (up to 15 min)...`);
await page.waitForSelector(".app-shell", { timeout: 15 * 60 * 1000 });
const loadMs = Date.now() - loadStart;
console.log(`${t()} Model loaded in ${(loadMs / 1000).toFixed(1)}s`);

// Switch to snapshot mode
console.log(`${t()} Configuring snapshot mode...`);
const snapshotInput = page.locator('input[placeholder*="frame.jpeg"]');
await snapshotInput.fill(SNAPSHOT_URL_LOCAL);
await page.click("button:has-text('Use Snapshots')");
await page.waitForSelector(".snapshot-stage", { timeout: 5000 });

// Click Scan
console.log(`${t()} Triggering Scan...`);
const scanStart = Date.now();
await page.click("button:has-text('Scan')");

// Wait for footer to show tok/s
await page.waitForFunction(
  () => {
    const footer = document.querySelector(".footer-row");
    return footer && /\d+\.\d+ tokens\/s/.test(footer.textContent || "");
  },
  { timeout: 120000 },
);
const scanMs = Date.now() - scanStart;

const footerText = await page.textContent(".footer-row");
const lastMessage = await page.locator(".bubble.assistant").last().textContent();

console.log(`\n=== BENCHMARK RESULTS ===`);
console.log(`WebGPU adapter: ${JSON.stringify(adapterInfo.info)}`);
console.log(`Model load time: ${(loadMs / 1000).toFixed(1)}s`);
console.log(`Scan wall-clock:  ${(scanMs / 1000).toFixed(1)}s`);
console.log(`Footer: ${footerText.trim()}`);
console.log(`Response preview: "${(lastMessage || "").slice(0, 200)}..."`);

await browser.close();

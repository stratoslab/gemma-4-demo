import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `@huggingface/transformers` resolves to the stratoslab fork at
// `./transformers.js/packages/transformers` via a `file:` dependency
// in package.json, so no Vite alias is needed.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["stratos-favicon.png", "stratos-logo-white.png", "background.jpg"],
      workbox: {
        // Precache app shell: JS, CSS, HTML, WASM (23 MB), fonts, images
        globPatterns: ["**/*.{js,css,html,wasm,png,jpg,woff2}"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // 30 MiB for ONNX Runtime WASM
        // Don't cache model weights (transformers.js uses IndexedDB for that)
        // Don't cache localhost snapshot fetches
        navigateFallbackDenylist: [/^\/api\//, /^https?:\/\/localhost/],
      },
      manifest: {
        name: "Stratos Vision",
        short_name: "Stratos Vision",
        description: "Private Gemma 4 multimodal AI on WebGPU — runs offline after first load.",
        theme_color: "#0a0e14",
        background_color: "#0a0e14",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/stratos-favicon.png",
            sizes: "100x100",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});

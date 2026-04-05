import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@huggingface/transformers": path.resolve(
        __dirname,
        "transformers.js/packages/transformers/dist/transformers.web.js",
      ),
    },
  },
});

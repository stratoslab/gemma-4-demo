import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import BenchmarkApp from "./BenchmarkApp";
// Self-host the fonts used in index.css — Vite inlines the @font-face
// declarations + bundles the WOFF2 files so they work offline. Without
// these imports the CSS references "Outfit Variable" / "JetBrains Mono
// Variable" but the browser can't resolve them, falling back to system UI.
import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

const isBenchmarkMode = new URLSearchParams(window.location.search).get("benchmark") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isBenchmarkMode ? <BenchmarkApp /> : <App />}
  </React.StrictMode>,
);

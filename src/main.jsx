import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import BenchmarkApp from "./BenchmarkApp";
import "./index.css";

const isBenchmarkMode = new URLSearchParams(window.location.search).get("benchmark") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isBenchmarkMode ? <BenchmarkApp /> : <App />}
  </React.StrictMode>,
);

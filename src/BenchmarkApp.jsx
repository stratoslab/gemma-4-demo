import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_PROMPT =
  "Summarize how a Canton workflow assistant should review a proposed token transfer and list the main risk checks.";

function ratioFromStats(stats) {
  if (!stats?.packed_bytes || !stats?.dense_bytes) {
    return null;
  }
  return stats.dense_bytes / stats.packed_bytes;
}

function tail(text) {
  return text.split("\n").slice(-1)[0] ?? text;
}

function useBenchmarkWorker() {
  const workerRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./benchmarkWorker.js", import.meta.url), {
      type: "module",
    });
    return () => workerRef.current?.terminate();
  }, []);

  return workerRef;
}

function ResultCard({ label, result }) {
  const ratio = ratioFromStats(result?.cacheStats);

  return (
    <section className="benchmark-card result-card">
      <div className="result-header">
        <h3>{label}</h3>
        <div className="result-metric">{result.averageMs.toFixed(1)} ms</div>
      </div>
      <div className="result-meta">
        <span>runs: {result.timings.map((value) => value.toFixed(1)).join(", ")} ms</span>
        {ratio ? <span>compression: {ratio.toFixed(3)}x</span> : null}
      </div>
      <pre className="stats-box">{JSON.stringify(result.cacheStats, null, 2)}</pre>
      <div className="result-output">
        <strong>Output</strong>
        <pre>{result.output}</pre>
      </div>
    </section>
  );
}

export default function BenchmarkApp() {
  const workerRef = useBenchmarkWorker();

  const [modelId, setModelId] = useState("onnx-community/Qwen2.5-0.5B-Instruct");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [maxNewTokens, setMaxNewTokens] = useState(32);
  const [runs, setRuns] = useState(1);
  const [bKey, setBKey] = useState(4);
  const [bValue, setBValue] = useState(8);
  const [residualLength, setResidualLength] = useState(64);
  const [status, setStatus] = useState("Idle");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return undefined;
    }

    const onMessage = (event) => {
      const { status: nextStatus, message, info, result: nextResult, error: nextError, modelId: readyModelId } =
        event.data ?? {};

      switch (nextStatus) {
        case "progress":
          setLoading(true);
          setStatus(
            info?.status === "progress_total"
              ? `Loading ${Math.round(info.progress ?? 0)}%`
              : `${message ?? info?.status ?? "Loading model..."}`,
          );
          setEvents((current) => [
            {
              id: crypto.randomUUID(),
              text: `${info?.status ?? "progress"} ${info?.file ?? info?.name ?? ""}`.trim(),
            },
            ...current,
          ].slice(0, 8));
          break;
        case "phase":
          setLoading(true);
          setStatus(message);
          break;
        case "ready":
          setLoading(false);
          setStatus(`Ready: ${readyModelId}`);
          break;
        case "complete":
          setLoading(false);
          setStatus("Benchmark complete");
          setResult(nextResult);
          setError("");
          break;
        case "error":
          setLoading(false);
          setError(nextError);
          setStatus("Benchmark failed");
          break;
        default:
          break;
      }
    };

    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [workerRef]);

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      speedRatio: result.dynamic.averageMs / result.turboquant.averageMs,
      exactMatch: result.dynamic.output === result.turboquant.output,
      dynamicTail: tail(result.dynamic.output),
      turboTail: tail(result.turboquant.output),
    };
  }, [result]);

  const requestLoad = () => {
    setError("");
    setLoading(true);
    setStatus("Loading benchmark model...");
    workerRef.current?.postMessage({
      type: "load",
      data: { modelId },
    });
  };

  const runBenchmark = () => {
    setError("");
    setLoading(true);
    setStatus("Starting benchmark...");
    setResult(null);
    workerRef.current?.postMessage({
      type: "benchmark",
      data: {
        modelId,
        prompt,
        maxNewTokens: Number(maxNewTokens),
        runs: Number(runs),
        cacheConfig: {
          b_key: Number(bKey),
          b_value: Number(bValue),
          residual_length: Number(residualLength),
        },
      },
    });
  };

  return (
    <div className="benchmark-shell">
      <div className="benchmark-hero">
        <p className="eyebrow">Chrome Benchmark</p>
        <h1>TurboQuant WebGPU Harness</h1>
        <p className="subhead">
          Loads the local forked Transformers.js build in a browser worker and compares
          `dynamic` versus `turboquant` generation on the same prompt.
        </p>
      </div>

      <div className="benchmark-grid">
        <section className="benchmark-card controls-card">
          <label>
            <span>Model</span>
            <input value={modelId} onChange={(event) => setModelId(event.target.value)} />
          </label>
          <label>
            <span>Prompt</span>
            <textarea
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <div className="control-row">
            <label>
              <span>Max New Tokens</span>
              <input
                type="number"
                min="1"
                value={maxNewTokens}
                onChange={(event) => setMaxNewTokens(event.target.value)}
              />
            </label>
            <label>
              <span>Runs</span>
              <input
                type="number"
                min="1"
                value={runs}
                onChange={(event) => setRuns(event.target.value)}
              />
            </label>
          </div>
          <div className="control-row">
            <label>
              <span>B Key</span>
              <input type="number" min="1" max="8" value={bKey} onChange={(event) => setBKey(event.target.value)} />
            </label>
            <label>
              <span>B Value</span>
              <input
                type="number"
                min="1"
                max="8"
                value={bValue}
                onChange={(event) => setBValue(event.target.value)}
              />
            </label>
            <label>
              <span>Residual Length</span>
              <input
                type="number"
                min="0"
                value={residualLength}
                onChange={(event) => setResidualLength(event.target.value)}
              />
            </label>
          </div>

          <div className="benchmark-actions">
            <button className="glass-button" onClick={requestLoad} disabled={loading}>
              Load Model
            </button>
            <button className="primary-button" onClick={runBenchmark} disabled={loading}>
              {loading ? "Running..." : "Run Benchmark"}
            </button>
          </div>
          <p className="benchmark-status">{status}</p>
          {error ? <pre className="error-box">{error}</pre> : null}
        </section>

        <section className="benchmark-card telemetry-card">
          <h2>Recent Worker Events</h2>
          <div className="event-list">
            {events.length === 0 ? <div className="event-item muted">No events yet.</div> : null}
            {events.map((item) => (
              <div key={item.id} className="event-item">
                {item.text}
              </div>
            ))}
          </div>
          <p className="meta-line">
            Open this page in Chrome or Chromium with WebGPU enabled. URL:
            <code> ?benchmark=1</code>
          </p>
        </section>
      </div>

      {result ? (
        <>
          <section className="benchmark-summary">
            <div className="summary-pill">
              speed ratio: {summary.speedRatio.toFixed(3)}x
            </div>
            <div className="summary-pill">
              outputs match: {summary.exactMatch ? "yes" : "no"}
            </div>
            <div className="summary-pill">
              dynamic tail: {summary.dynamicTail}
            </div>
            <div className="summary-pill">
              turbo tail: {summary.turboTail}
            </div>
          </section>

          <div className="benchmark-results">
            <ResultCard label="Dynamic" result={result.dynamic} />
            <ResultCard label="TurboQuant" result={result.turboquant} />
          </div>
        </>
      ) : null}
    </div>
  );
}

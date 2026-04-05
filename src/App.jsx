import { useEffect, useMemo, useRef, useState } from "react";

const EXAMPLES = [
  "Summarize what Stratos is building on Canton.",
  "What risk checks would matter for an enterprise DeFi workflow?",
  "Describe what you see and suggest a next operational step.",
];

function PreflightTools({
  loadingMessage,
  errorMessage,
  diagnostics,
  connectivityResults,
  onConnectivityCheck,
  compact = false,
}) {
  return (
    <div className={`preflight-tools ${compact ? "compact" : ""}`}>
      <div className="preflight-actions">
        <button className="icon-button preflight-button" onClick={onConnectivityCheck}>
          Test connectivity
        </button>
      </div>
      <DiagnosticsPanel
        loadingMessage={loadingMessage}
        errorMessage={errorMessage}
        diagnostics={diagnostics}
      />
      <ConnectivityResults results={connectivityResults} />
    </div>
  );
}

function Landing({
  onStart,
  onConnectivityCheck,
  supported,
  loadingMessage,
  errorMessage,
  diagnostics,
  connectivityResults,
}) {
  return (
    <div className="screen landing">
      <div className="landing-bg" />
      <div className="landing-overlay" />
      <div className="landing-panel">
        <img src="/stratos-logo-white.png" alt="Stratos" className="brand-mark hero-mark" />
        <p className="eyebrow">Enterprise DeFi on Canton Network</p>
        <h1>Stratos Vision</h1>
        <p className="subhead">
          A private Gemma 4 multimodal assistant for local Canton workflows, running
          entirely in your browser on WebGPU.
        </p>
        <button className="primary-button" onClick={onStart} disabled={!supported}>
          {supported ? "Load Gemma 4" : "WebGPU Unavailable"}
        </button>
        <p className="meta-line">
          Uses Transformers.js and ONNX Runtime Web. No prompts or media leave this device.
        </p>
        <PreflightTools
          loadingMessage={loadingMessage}
          errorMessage={errorMessage}
          diagnostics={diagnostics}
          connectivityResults={connectivityResults}
          onConnectivityCheck={onConnectivityCheck}
        />
      </div>
    </div>
  );
}

function LoadingScreen({
  progress,
  loadingMessage,
  errorMessage,
  diagnostics,
  connectivityResults,
  onConnectivityCheck,
}) {
  const rounded = Math.round(progress);
  return (
    <div className="screen loading-screen">
      <img src="/stratos-logo-white.png" alt="Stratos" className="brand-mark loading-mark" />
      <h2>Preparing Stratos Vision</h2>
      <div className="progress-shell">
        <div className="progress-bar" style={{ width: `${Math.max(rounded, 3)}%` }} />
      </div>
      <p className="progress-value">{rounded}%</p>
      <p className="meta-line">Gemma 4 loads locally and is cached after first run.</p>
      <PreflightTools
        compact
        loadingMessage={loadingMessage}
        errorMessage={errorMessage}
        diagnostics={diagnostics}
        connectivityResults={connectivityResults}
        onConnectivityCheck={onConnectivityCheck}
      />
    </div>
  );
}

function DiagnosticsPanel({ loadingMessage, errorMessage, diagnostics }) {
  const extensionHint =
    /ERR_BLOCKED_BY_CLIENT|blocked by client|SES|lockdown-install/i.test(
      `${errorMessage} ${loadingMessage} ${diagnostics.join(" ")}`,
    )
      ? "A browser extension may be blocking requests. Test in an incognito window or with extensions disabled."
      : null;

  if (!loadingMessage && !errorMessage && diagnostics.length === 0) {
    return null;
  }

  return (
    <div className={`diagnostics ${errorMessage ? "error" : ""}`}>
      <div className="diagnostics-title">
        {errorMessage ? "Runtime issue detected" : "Model loading diagnostics"}
      </div>
      {loadingMessage ? <div className="diagnostics-line">{loadingMessage}</div> : null}
      {errorMessage ? <div className="diagnostics-line strong">{errorMessage}</div> : null}
      {diagnostics.slice(-4).map((line) => (
        <div key={line} className="diagnostics-line">
          {line}
        </div>
      ))}
      {extensionHint ? <div className="diagnostics-hint">{extensionHint}</div> : null}
    </div>
  );
}

function ConnectivityResults({ results }) {
  if (!results.length) {
    return null;
  }

  return (
    <div className="diagnostics">
      <div className="diagnostics-title">Connectivity check</div>
      {results.map((result) => (
        <div key={result.url} className="diagnostics-line">
          {result.ok ? "OK" : "FAIL"} {result.status} {result.url}
          {result.error ? ` — ${result.error}` : ""}
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ message }) {
  return (
    <div className={`bubble-row ${message.role === "user" ? "user" : "assistant"}`}>
      <div className={`bubble ${message.role}`}>
        {message.image && (
          <img src={message.image} alt="Captured frame" className="bubble-image" />
        )}
        {message.audio && <div className="audio-chip">Audio attached</div>}
        {message.thinking && <pre className="thinking-box">{message.thinking}</pre>}
        <div className="bubble-text">{message.content || (message.isStreaming ? "…" : "")}</div>
      </div>
    </div>
  );
}

function useWorker() {
  const workerRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current.postMessage({ type: "check" });
    return () => workerRef.current?.terminate();
  }, []);

  return workerRef;
}

function App() {
  const workerRef = useWorker();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatScrollRef = useRef(null);

  const [phase, setPhase] = useState("landing");
  const [supported, setSupported] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [enableThinking, setEnableThinking] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [tps, setTps] = useState(null);
  const [numTokens, setNumTokens] = useState(null);
  const [videoSource, setVideoSource] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [scanFrame, setScanFrame] = useState(null);
  const [recording, setRecording] = useState(false);
  const [diagnostics, setDiagnostics] = useState([]);
  const [connectivityResults, setConnectivityResults] = useState([]);

  const mediaStreamRef = useRef(null);
  const videoObjectUrlRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const starterExamples = useMemo(() => EXAMPLES, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return undefined;
    }

    const onMessage = (event) => {
      const { status, data } = event.data;
      switch (status) {
        case "check":
          setSupported(Boolean(event.data.supported));
          break;
        case "loading":
          setPhase("loading");
          setLoadingMessage(data);
          break;
        case "progress":
          setProgress(event.data.progress ?? 0);
          break;
        case "debug":
          setDiagnostics((current) => [
            ...current.slice(-9),
            event.data.data?.message ?? "Worker update received.",
          ]);
          break;
        case "ready":
          setPhase("app");
          setLoadingMessage("Model ready.");
          break;
        case "connectivity-result":
          setConnectivityResults(event.data.data ?? []);
          setDiagnostics((current) => [
            ...current.slice(-9),
            "Connectivity check completed.",
          ]);
          break;
        case "start":
          setIsRunning(true);
          setTps(null);
          setNumTokens(null);
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: "assistant", content: "", isStreaming: true },
          ]);
          break;
        case "update":
          setMessages((current) => {
            const next = [...current];
            const last = next.at(-1);
            if (!last || last.role !== "assistant") {
              return current;
            }
            next[next.length - 1] = {
              ...last,
              content: `${last.content}${event.data.output ?? ""}`,
            };
            return next;
          });
          break;
        case "complete":
          setIsRunning(false);
          setTps(event.data.tps ?? 0);
          setNumTokens(event.data.numTokens ?? 0);
          setMessages((current) => {
            const next = [...current];
            const last = next.at(-1);
            if (!last || last.role !== "assistant") {
              return current;
            }
            next[next.length - 1] = { ...last, isStreaming: false };
            return next;
          });
          break;
        case "error":
          setMediaError(data);
          setIsRunning(false);
          setDiagnostics((current) => [...current.slice(-9), `Error: ${data}`]);
          break;
        default:
          break;
      }
    };

    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [workerRef]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
      }
    };
  }, []);

  const requestLoad = () => {
    workerRef.current?.postMessage({ type: "load" });
  };

  const runConnectivityCheck = () => {
    setConnectivityResults([]);
    setDiagnostics((current) => [...current.slice(-9), "Running connectivity check..."]);
    workerRef.current?.postMessage({ type: "connectivity-check" });
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      return null;
    }

    const ratio = Math.min(1, 960 / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    canvas.width = Math.round((video.videoWidth || 0) * ratio);
    canvas.height = Math.round((video.videoHeight || 0) * ratio);
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  const sendMessage = async ({ text = input, image = null, audio = null, hideText = false } = {}) => {
    const content = text.trim();
    if (isRunning || (!content && !image && !audio)) {
      return;
    }

    const nextMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      image,
      audio,
      hideText,
    };

    setMessages((current) => [...current, nextMessage]);
    setInput("");
    const nextMessages = [...messagesRef.current, nextMessage];
    workerRef.current?.postMessage({
      type: "generate",
      data: {
        messages: nextMessages,
        enableThinking,
      },
    });
  };

  const startWebcam = async () => {
    try {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setVideoSource("webcam");
      setMediaError("");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Camera access denied.");
    }
  };

  const onSelectVideo = (file) => {
    if (!file || !videoRef.current) {
      return;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    videoObjectUrlRef.current = url;
    setVideoSource("file");
    setMediaError("");
    videoRef.current.srcObject = null;
    videoRef.current.src = url;
    videoRef.current.play().catch(() => {});
  };

  const triggerScan = async () => {
    if (isRunning) {
      return;
    }
    const frame = captureFrame();
    if (!frame) {
      setMediaError("No active frame available to analyze.");
      return;
    }
    setScanFrame(frame);
    await sendMessage({
      text: input.trim() || "Describe what you see",
      image: frame,
    });
    setTimeout(() => setScanFrame(null), 1800);
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new AudioContext({ sampleRate: 16000 });
        try {
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const channelData = Array.from(audioBuffer.getChannelData(0));
          await sendMessage({
            text: input.trim() || "Transcribe this audio and respond to what I said.",
            audio: channelData,
            hideText: !input.trim(),
          });
        } finally {
          await audioContext.close();
        }
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Microphone access denied.");
    }
  };

  return (
    <>
      {phase === "landing" && (
        <Landing
          onStart={requestLoad}
          onConnectivityCheck={runConnectivityCheck}
          supported={supported}
          loadingMessage={loadingMessage}
          errorMessage={mediaError}
          diagnostics={diagnostics}
          connectivityResults={connectivityResults}
        />
      )}
      {phase === "loading" && (
        <LoadingScreen
          progress={progress}
          loadingMessage={loadingMessage}
          errorMessage={mediaError}
          diagnostics={diagnostics}
          connectivityResults={connectivityResults}
          onConnectivityCheck={runConnectivityCheck}
        />
      )}
      {phase === "app" && (
        <div className="screen app-shell">
          <video
            ref={videoRef}
            className={`video-stage ${videoSource === "webcam" ? "mirror" : ""}`}
            autoPlay
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden-canvas" />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden-input"
            onChange={(event) => onSelectVideo(event.target.files?.[0])}
          />

          <div className="chrome-top">
            <div className="brand-lockup">
              <img src="/stratos-logo-white.png" alt="Stratos" className="brand-mark small" />
              <div>
                <div className="brand-title">Stratos Vision</div>
                <div className="brand-subtitle">Private multimodal AI on Gemma 4 + WebGPU</div>
              </div>
            </div>
          </div>

          {!videoSource && (
            <div className="empty-state">
              <img src="/stratos-logo-white.png" alt="Stratos" className="brand-mark medium" />
              <h2>Connect a live stream or recorded video</h2>
              <p>
                Analyze camera frames, transcribe voice input, and keep the full inference path
                local to this browser.
              </p>
              <div className="empty-actions">
                <button className="glass-button" onClick={startWebcam}>
                  Start Webcam
                </button>
                <button className="glass-button" onClick={() => fileInputRef.current?.click()}>
                  Select Video
                </button>
              </div>
              <p className="meta-line">Stratos private demo. Your data stays on this device.</p>
            </div>
          )}

          {scanFrame && (
            <div className="scan-overlay">
              <img src={scanFrame} alt="Captured frame" className="scan-preview" />
              <div className="scan-label">Analyzing current frame...</div>
            </div>
          )}

          <div className="chat-shell">
            <DiagnosticsPanel
              loadingMessage={loadingMessage}
              errorMessage={mediaError}
              diagnostics={diagnostics}
            />
            <ConnectivityResults results={connectivityResults} />
            <div className="chat-log" ref={chatScrollRef}>
              {messages.length === 0 && (
                <div className="example-list">
                  {starterExamples.map((example) => (
                    <button
                      key={example}
                      className="example-chip"
                      onClick={() => sendMessage({ text: example })}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>

            <div className="composer">
              <textarea
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask Stratos AI anything..."
              />

              <div className="composer-actions">
                <button className="icon-button" onClick={runConnectivityCheck}>
                  Test connectivity
                </button>
                <button className="icon-button" onClick={toggleRecording}>
                  {recording ? "Stop Mic" : "Mic"}
                </button>
                <button className="icon-button" onClick={triggerScan}>
                  Scan
                </button>
                <button
                  className={`icon-button ${enableThinking ? "active" : ""}`}
                  onClick={() => setEnableThinking((value) => !value)}
                >
                  Think
                </button>
                {isRunning ? (
                  <button className="primary-button danger" onClick={() => workerRef.current?.postMessage({ type: "interrupt" })}>
                    Stop
                  </button>
                ) : (
                  <button className="primary-button compact" onClick={() => sendMessage()}>
                    Send
                  </button>
                )}
              </div>
            </div>

            <div className="footer-row">
              <div>{loadingMessage || mediaError}</div>
              <div>
                {tps ? `${tps.toFixed(2)} tokens/s` : ""}
                {numTokens ? ` • ${numTokens} tokens` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;

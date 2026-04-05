import { useEffect, useMemo, useRef, useState } from "react";

const EXAMPLES = [
  "Describe what you see in the current frame.",
  "Identify the main objects, people, and actions in this scene.",
  "Summarize the visual scene clearly and concisely.",
];

function Landing({ onStart, supported }) {
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
      </div>
    </div>
  );
}

function LoadingScreen({ progress }) {
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
    </div>
  );
}

function MessageBubble({ message }) {
  const textContent = Array.isArray(message.content)
    ? message.content.find((part) => part.type === "text")?.text ?? ""
    : message.content;

  return (
    <div className={`bubble-row ${message.role === "user" ? "user" : "assistant"}`}>
      <div className={`bubble ${message.role}`}>
        {message.image && (
          <img src={message.image} alt="Captured frame" className="bubble-image" />
        )}
        {message.audio && <div className="audio-chip">Audio attached</div>}
        {message.thinking && <pre className="thinking-box">{message.thinking}</pre>}
        <div className="bubble-text">{textContent || (message.isStreaming ? "…" : "")}</div>
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
        case "ready":
          setPhase("app");
          setLoadingMessage("Model ready.");
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
    const attachedFrame = image ?? (videoSource ? captureFrame() : null);
    if (isRunning || (!content && !attachedFrame && !audio)) {
      return;
    }

    const modelContent = [];
    if (attachedFrame) {
      modelContent.push({ type: "image", image: attachedFrame });
    }
    if (audio) {
      modelContent.push({ type: "audio", audio });
    }
    modelContent.push({
      type: "text",
      text: content || "Describe what you see.",
    });

    const nextMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      image: attachedFrame,
      audio,
      hideText,
    };

    setMessages((current) => [...current, nextMessage]);
    setInput("");
    const nextMessages = [...messagesRef.current, nextMessage];
    const modelMessages = nextMessages.map((message) =>
      message.role === "assistant"
        ? {
            role: "assistant",
            content: [{ type: "text", text: message.content }],
          }
        : {
            role: "user",
            content:
              message === nextMessage
                ? modelContent
                : [
                    ...(message.image ? [{ type: "image", image: message.image }] : []),
                    ...(message.audio ? [{ type: "audio", audio: message.audio }] : []),
                    {
                      type: "text",
                      text:
                        typeof message.content === "string" && message.content.trim()
                          ? message.content
                          : "Describe what you see.",
                    },
                  ],
          },
    );
    workerRef.current?.postMessage({
      type: "generate",
      data: {
        messages: modelMessages,
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
        const audioUrl = URL.createObjectURL(blob);
        await sendMessage({
          text: input.trim() || "Transcribe this audio and respond to what I said.",
          audio: audioUrl,
          hideText: !input.trim(),
        });
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
        <Landing onStart={requestLoad} supported={supported} />
      )}
      {phase === "loading" && <LoadingScreen progress={progress} />}
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

          {videoSource && (
            <div className="chat-shell">
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
          )}
        </div>
      )}
    </>
  );
}

export default App;

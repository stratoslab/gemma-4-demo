import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EXAMPLES = [
  "Describe what you see in the current frame.",
  "Identify the main objects, people, and actions in this scene.",
  "Summarize the visual scene clearly and concisely.",
];

// Inline SVG icons (Lucide-style, 18×18, currentColor stroke).
const Icon = ({ children, size = 18 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);
const IconMic = () => (
  <Icon>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </Icon>
);
const IconMicOff = () => (
  <Icon>
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </Icon>
);
const IconScan = () => (
  <Icon>
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <line x1="7" y1="12" x2="17" y2="12" />
  </Icon>
);
const IconSwitch = () => (
  <Icon>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </Icon>
);
const IconThink = () => (
  <Icon>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2z" />
  </Icon>
);
const IconPopOut = () => (
  <Icon>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
);
const IconDock = () => (
  <Icon>
    <path d="M4 14h6v6" />
    <path d="M20 10h-6V4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </Icon>
);
const IconSend = () => (
  <Icon>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </Icon>
);
const IconStop = () => (
  <Icon>
    <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);
const IconShield = () => (
  <Icon>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Icon>
);
const IconCheck = () => (
  <Icon size={14}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

// Persistent offline-capable badge shown in the top-right corner.
// Declares what runs locally and surfaces browser online/offline state.
function OfflineBadge() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const label = online ? "Local-only" : "Offline";
  const sub = online
    ? "No network needed"
    : "App still fully usable";

  return (
    <div className="offline-badge-wrap">
      <button
        type="button"
        className={`offline-badge ${online ? "is-online" : "is-offline"}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`Lockdown status: ${label}. Click for details.`}
        title={`${label} — click for lockdown details`}
      >
        <span className={`offline-dot ${online ? "dot-green" : "dot-amber"}`} aria-hidden="true" />
        <IconShield />
        <span className="offline-label">{label}</span>
      </button>
      {expanded && (
        <div className="offline-popover" role="dialog" aria-label="Lockdown details">
          <div className="offline-popover-header">
            <strong>Runs entirely on your device</strong>
            <button
              className="offline-popover-close"
              onClick={() => setExpanded(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="offline-popover-sub">{sub}</p>
          <p className="offline-popover-section">What the app does automatically:</p>
          <ul className="offline-popover-list">
            <li><IconCheck /> App shell cached by service worker</li>
            <li><IconCheck /> Model weights cached in IndexedDB after first load</li>
            <li><IconCheck /> Generation runs in WebGPU — zero network per token</li>
            <li><IconCheck /> No analytics, no telemetry, no external APIs</li>
          </ul>
          <p className="offline-popover-section">URLs you type in still work:</p>
          <ul className="offline-popover-list">
            <li>
              <IconCheck /> Local cameras via <code>localhost</code> /{" "}
              <code>127.0.0.1</code> — browsers trust these over HTTPS
            </li>
            <li>
              <IconCheck /> HLS streams, snapshot endpoints, file uploads —
              all user-initiated
            </li>
            <li>
              <IconCheck /> LAN IPs work too, but need local TLS (mkcert)
              because of mixed-content rules
            </li>
          </ul>
          <p className="offline-popover-footnote">
            Initial load requires network to download the ~3 GB model from the
            R2 mirror (<code>local-mode.stratoslab.xyz</code>). Subsequent
            sessions work fully offline.
          </p>
        </div>
      )}
    </div>
  );
}

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

// DynamicCache is the default — it's faster end-to-end than TurboQuant in
// every scenario measured so far (paper's browser benchmarks on Gemma 4 +
// local cache-only microbench). TurboQuant is opt-in via `?cache=turboquant`
// for users who want to explore the compression/speed tradeoff.
//
// URL flags (all optional, only applied when ?cache=turboquant):
//   ?cache=turboquant              → use TurboQuantCache
//   &bkey=N                         → key bits (default 4)
//   &bvalue=N                       → value bits (default 8)
//   &residual=N                     → dense-window size (default 64)
//   &batch=N                        → eviction batch (default = residual)
//   &quant=sigma|minmax             → quantizer (default minmax)
//   &sigmak=F                       → σ-clip half-width (default 2.5)
function readCacheConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const impl = params.get("cache");
  if (impl !== "turboquant") return null; // default path = DynamicCache
  const config = {
    b_key: Number(params.get("bkey") ?? 4),
    b_value: Number(params.get("bvalue") ?? 8),
    residual_length: Number(params.get("residual") ?? 64),
    eviction_batch: params.has("batch") ? Number(params.get("batch")) : null,
    quantization: params.get("quant") ?? "minmax",
    sigma_k: Number(params.get("sigmak") ?? 2.5),
  };
  return { implementation: "turboquant", config };
}

function useWorker() {
  const workerRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current.postMessage({ type: "check" });
    const cacheConfig = readCacheConfigFromUrl();
    if (cacheConfig) {
      workerRef.current.postMessage({ type: "configure", data: { cacheConfig } });
    }
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
  // Document Picture-in-Picture window handle (null when composer is inline).
  const [pipWindow, setPipWindow] = useState(null);
  const [numTokens, setNumTokens] = useState(null);
  const [videoSource, setVideoSource] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [scanFrame, setScanFrame] = useState(null);
  const [recording, setRecording] = useState(false);
  const [streamUrl, setStreamUrl] = useState(
    "http://localhost:1984/api/stream.m3u8?src=",
  );
  const [streamConnecting, setStreamConnecting] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState(
    "http://localhost:1984/api/frame.jpeg?src=",
  );
  const [lastSnapshot, setLastSnapshot] = useState(null);

  const mediaStreamRef = useRef(null);
  const videoObjectUrlRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const messagesRef = useRef(messages);
  const hlsRef = useRef(null);

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
      hlsRef.current?.destroy();
      hlsRef.current = null;
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
      stopHlsStream();
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

  const startTabCapture = async () => {
    try {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      stopHlsStream();
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
        videoObjectUrlRef.current = null;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          frameRate: { ideal: 15 },
        },
        audio: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: "exclude",
      });
      // When the user clicks the browser's "Stop sharing" button, reset state.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        mediaStreamRef.current = null;
        setVideoSource(null);
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      });
      mediaStreamRef.current = stream;
      setVideoSource("tab");
      setMediaError("");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.src = "";
        await videoRef.current.play();
      }
    } catch (error) {
      // User canceling the picker throws NotAllowedError / AbortError — treat quietly.
      const name = error?.name;
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setMediaError(error instanceof Error ? error.message : "Tab capture failed.");
      }
    }
  };

  const stopHlsStream = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  };

  const startHlsStream = async (url) => {
    const target = (url ?? "").trim();
    if (!target || !videoRef.current) {
      return;
    }
    setStreamConnecting(true);
    setMediaError("");
    try {
      // Stop whatever else is active
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
        videoObjectUrlRef.current = null;
      }
      stopHlsStream();

      const video = videoRef.current;
      video.srcObject = null;

      // Decide playback strategy by URL pattern:
      //   .m3u8 → HLS (native Safari or hls.js elsewhere)
      //   .mp4 / .webm / .ogg / .mov → native <video src>
      //   otherwise → try HLS
      const isHlsUrl = /\.m3u8(\?|#|$)/i.test(target);
      const isNativeVideoUrl = /\.(mp4|webm|ogg|m4v|mov)(\?|#|$)/i.test(target);
      const hasNativeHls = video.canPlayType("application/vnd.apple.mpegurl");

      if (isNativeVideoUrl || (isHlsUrl && hasNativeHls)) {
        // Direct <video src> — works for fragmented MP4 from go2rtc too.
        video.src = target;
      } else {
        const { default: Hls } = await import("hls.js");
        if (!Hls.isSupported()) {
          throw new Error("HLS is not supported in this browser.");
        }
        const hls = new Hls({ lowLatencyMode: true, liveDurationInfinity: true });
        hlsRef.current = hls;
        hls.loadSource(target);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setMediaError(`HLS: ${data.details ?? data.type}`);
            stopHlsStream();
          }
        });
      }

      setVideoSource("stream");
      await video.play();
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Stream connect failed.");
    } finally {
      setStreamConnecting(false);
    }
  };

  const onSelectVideo = (file) => {
    if (!file || !videoRef.current) {
      return;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopHlsStream();
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

  const fetchSnapshot = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot fetch failed: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error(`Expected image, got ${blob.type || "unknown type"}`);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  };

  const connectSnapshot = () => {
    const url = snapshotUrl.trim();
    if (!url) {
      return;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopHlsStream();
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
      videoObjectUrlRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = "";
    }
    setVideoSource("snapshot");
    setMediaError("");
    setLastSnapshot(null);
  };

  const triggerScan = async () => {
    if (isRunning) {
      return;
    }
    let frame;
    if (videoSource === "snapshot") {
      try {
        frame = await fetchSnapshot(snapshotUrl);
        setLastSnapshot(frame);
      } catch (error) {
        setMediaError(error instanceof Error ? error.message : "Snapshot fetch failed.");
        return;
      }
    } else {
      frame = captureFrame();
      if (!frame) {
        setMediaError("No active frame available to analyze.");
        return;
      }
    }
    setScanFrame(frame);
    await sendMessage({
      text: input.trim() || "Describe what you see",
      image: frame,
    });
    setTimeout(() => setScanFrame(null), 1800);
  };

  // Open the composer in a floating always-on-top window via the
  // Document Picture-in-Picture API. Chrome/Edge 116+. The pip window
  // persists across tabs so the user can type prompts while watching
  // another app. We render the composer through a React portal into
  // the pip window, so all state + handlers keep working unchanged.
  const openComposerPipWindow = async () => {
    if (pipWindow) {
      pipWindow.focus();
      return;
    }
    if (!("documentPictureInPicture" in window)) {
      setMediaError("Floating window requires Chrome/Edge 116 or newer.");
      return;
    }
    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 380,
        height: 500,
      });
      // Clone main-document stylesheets into the pip doc so the composer
      // looks identical. Inline rules are copied verbatim; external
      // stylesheets are re-linked by href.
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
          const style = pip.document.createElement("style");
          style.textContent = css;
          pip.document.head.appendChild(style);
        } catch {
          if (sheet.href) {
            const link = pip.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            pip.document.head.appendChild(link);
          }
        }
      }
      pip.document.body.classList.add("pip-body");
      pip.document.title = "Stratos — Composer";
      pip.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(pip);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Failed to open floating window.");
    }
  };

  // Clean up: close the pip window when the component unmounts.
  useEffect(() => {
    return () => {
      pipWindow?.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear down whatever video source is active and return to the picker,
  // so the user can switch between webcam / tab / file / stream / snapshot
  // without reloading the page.
  const resetSource = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopHlsStream();
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
      videoObjectUrlRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
    }
    setLastSnapshot(null);
    setVideoSource(null);
    setMediaError("");
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
      <OfflineBadge />
      {phase === "landing" && (
        <Landing onStart={requestLoad} supported={supported} />
      )}
      {phase === "loading" && <LoadingScreen progress={progress} />}
      {phase === "app" && (
        <div className="screen app-shell">
          <video
            ref={videoRef}
            className={`video-stage ${videoSource === "webcam" ? "mirror" : ""} ${videoSource === "snapshot" ? "hidden" : ""}`}
            autoPlay
            muted
            playsInline
          />
          {videoSource === "snapshot" && (
            <div className="video-stage snapshot-stage">
              {lastSnapshot ? (
                <img src={lastSnapshot} alt="Last snapshot" className="snapshot-preview" />
              ) : (
                <div className="snapshot-placeholder">
                  <p className="snapshot-hint">Snapshot mode</p>
                  <p className="snapshot-sub">Click <strong>Scan</strong> to fetch a frame</p>
                  <code className="snapshot-url">{snapshotUrl}</code>
                </div>
              )}
            </div>
          )}
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
                <button className="glass-button" onClick={startTabCapture}>
                  Capture Tab
                </button>
                <button className="glass-button" onClick={() => fileInputRef.current?.click()}>
                  Select Video
                </button>
              </div>
              <div className="stream-connect">
                <input
                  type="url"
                  className="stream-input"
                  placeholder="http://localhost:1984/api/stream.m3u8?src=camera"
                  value={streamUrl}
                  onChange={(event) => setStreamUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      startHlsStream(streamUrl);
                    }
                  }}
                />
                <button
                  className="glass-button compact"
                  onClick={() => startHlsStream(streamUrl)}
                  disabled={streamConnecting || !streamUrl.trim()}
                >
                  {streamConnecting ? "Connecting…" : "Connect Stream"}
                </button>
              </div>
              <div className="stream-connect">
                <input
                  type="url"
                  className="stream-input"
                  placeholder="http://localhost:1984/api/frame.jpeg?src=camera"
                  value={snapshotUrl}
                  onChange={(event) => setSnapshotUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      connectSnapshot();
                    }
                  }}
                />
                <button
                  className="glass-button compact"
                  onClick={connectSnapshot}
                  disabled={!snapshotUrl.trim()}
                >
                  Use Snapshots
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

          {videoSource && (() => {
            // Full chat UI: log + composer + footer. Portaled as a unit
            // into the pip window when floating, otherwise rendered inline.
            const chatContent = (
              <>
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

                <div className={`composer${pipWindow ? " composer-pip" : ""}`}>
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
                    autoFocus={Boolean(pipWindow)}
                  />

                  <div className="composer-actions">
                    <button
                      className="icon-button"
                      onClick={toggleRecording}
                      title={recording ? "Stop microphone" : "Start microphone"}
                      aria-label={recording ? "Stop microphone" : "Start microphone"}
                    >
                      {recording ? <IconMicOff /> : <IconMic />}
                    </button>
                    <button
                      className="icon-button"
                      onClick={triggerScan}
                      title="Scan current frame"
                      aria-label="Scan current frame"
                    >
                      <IconScan />
                    </button>
                    <button
                      className="icon-button"
                      onClick={resetSource}
                      title="Switch video source (webcam/tab/stream/file/snapshot)"
                      aria-label="Switch video source"
                    >
                      <IconSwitch />
                    </button>
                    <button
                      className={`icon-button ${enableThinking ? "active" : ""}`}
                      onClick={() => setEnableThinking((value) => !value)}
                      title={enableThinking ? "Thinking enabled" : "Enable thinking"}
                      aria-label={enableThinking ? "Disable thinking" : "Enable thinking"}
                      aria-pressed={enableThinking}
                    >
                      <IconThink />
                    </button>
                    {pipWindow ? (
                      <button
                        className="icon-button"
                        onClick={() => pipWindow.close()}
                        title="Return chat to main window"
                        aria-label="Dock chat"
                      >
                        <IconDock />
                      </button>
                    ) : (
                      <button
                        className="icon-button"
                        onClick={openComposerPipWindow}
                        title="Float chat above other apps (Chrome/Edge)"
                        aria-label="Pop chat out to floating window"
                      >
                        <IconPopOut />
                      </button>
                    )}
                    {isRunning ? (
                      <button
                        className="primary-button danger"
                        onClick={() => workerRef.current?.postMessage({ type: "interrupt" })}
                        title="Stop generation"
                        aria-label="Stop generation"
                      >
                        <IconStop />
                      </button>
                    ) : (
                      <button
                        className="primary-button compact"
                        onClick={() => sendMessage()}
                        title="Send message"
                        aria-label="Send message"
                      >
                        <IconSend />
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
              </>
            );

            if (pipWindow) {
              return (
                <>
                  <div className="chat-shell chat-shell-ghost">
                    <div className="pip-ghost">
                      <p>Chat is floating in a pop-out window.</p>
                      <button className="primary-button compact" onClick={() => pipWindow.close()}>
                        Dock back here
                      </button>
                    </div>
                  </div>
                  {createPortal(
                    <div className="chat-shell chat-shell-pip">{chatContent}</div>,
                    pipWindow.document.body,
                  )}
                </>
              );
            }

            return <div className="chat-shell">{chatContent}</div>;
          })()}
        </div>
      )}
    </>
  );
}

export default App;

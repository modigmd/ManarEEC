import { useCallback, useEffect, useRef, useState } from "react";
import BoardScene from "./BoardScene";
import AssemblyEditor from "./AssemblyEditor";
import Icon from "./icons";
import { demos, parts, initialSnapshot, hex } from "./data";
import type {
  AssemblyResult,
  CameraView,
  Diagnostic,
  DisassemblyLine,
  Snapshot,
  TraceSample,
} from "./types";

const aliases = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
];
const inspectorTabs = ["registers", "memory", "console", "signals"] as const;
const questions = [
  {
    id: "cpu",
    question: "Find the processor that executes your instructions.",
    hint: "Look for the largest black package, marked PicoRV32.",
  },
  {
    id: "ram",
    question: "Where does the board keep its programs and data?",
    hint: "The memory package sits beside the processor.",
  },
  {
    id: "clock",
    question: "Find the component that keeps time for the core.",
    hint: "Look for the little metallic crystal.",
  },
  {
    id: "gpio",
    question: "Find the bits you can see: the output LEDs.",
    hint: "Eight lights make one byte visible.",
  },
  {
    id: "uart",
    question: "Find the board’s connection to the console.",
    hint: "Look near the USB connector.",
  },
  {
    id: "power",
    question: "Find the part that gives the board a fresh start.",
    hint: "Look for the power section and reset button.",
  },
];

function stored(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The session still works when storage is unavailable. */
  }
}
function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function go(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });
}

function MiniBoard({
  type,
  active = false,
}: {
  type: string;
  active?: boolean;
}) {
  return (
    <div
      className={`mini-board mini-${type} ${active ? "is-active" : ""}`}
      aria-hidden="true"
    >
      <div className="mini-chip">
        <i />
        <i />
        <i />
      </div>
      <span className="mini-port" />
      <span className="mini-header" />
      <span className="mini-header bottom" />
      <span className="mini-led" />
      <span className="mini-mark">RV32</span>
    </div>
  );
}

function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-label">
      <span>{number}</span>
      <i />
      {children}
    </div>
  );
}

function Signals({ trace }: { trace: TraceSample[] }) {
  const visible = trace.slice(-48);
  const rows: {
    name: string;
    key: "memValid" | "memReady" | "memWrite" | "retired";
    color: string;
  }[] = [
    { name: "mem_valid", key: "memValid", color: "#13796e" },
    { name: "mem_ready", key: "memReady", color: "#8f9d71" },
    { name: "mem_write", key: "memWrite", color: "#b8824c" },
    { name: "retired", key: "retired", color: "#697b9b" },
  ];
  if (!visible.length)
    return (
      <div className="empty-state">
        <Icon name="signals" size={32} />
        <h4>One clock at a time.</h4>
        <p>
          Step or run the core to capture its actual bus and instruction
          signals.
        </p>
      </div>
    );
  return (
    <div className="signal-view">
      <div className="inspector-description">
        Last {visible.length} recorded cycles. Each edge comes from the hardware
        model.
      </div>
      <div className="waveforms">
        {rows.map((row) => (
          <div className="wave-row" key={row.key}>
            <span>{row.name}</span>
            <svg
              viewBox={`0 0 ${visible.length * 10} 30`}
              preserveAspectRatio="none"
              aria-label={`${row.name} waveform`}
              role="img"
            >
              <defs>
                <pattern
                  id={`grid-${row.key}`}
                  width="10"
                  height="30"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M0 0V30" stroke="#d9d8ca" strokeWidth=".5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#grid-${row.key})`} />
              <polyline
                fill="none"
                stroke={row.color}
                strokeWidth="1.8"
                points={visible
                  .map(
                    (s, i) =>
                      `${i * 10},${s[row.key] ? 7 : 24} ${(i + 1) * 10},${s[row.key] ? 7 : 24}`,
                  )
                  .join(" ")}
              />
            </svg>
          </div>
        ))}
      </div>
      <div className="wave-axis">
        <span>cycle {visible[0].cycle}</span>
        <span>{visible.at(-1)?.cycle}</span>
      </div>
      <div className="trace-caption">CONTROL STATE HISTORY</div>
      <div className="trace-history">
        {visible
          .slice(-8)
          .reverse()
          .map((s, i) => (
            <div key={`${s.cycle}-${i}`}>
              <span>{s.cycle}</span>
              <strong>{s.state}</strong>
              <code>{hex(s.pc)}</code>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function App() {
  const [demoId, setDemoId] = useState(() =>
    stored("picorv32.demo", demos[0].id),
  );
  const demo = demos.find((d) => d.id === demoId) || demos[0];
  const [source, setSource] = useState(() =>
    stored(
      "picorv32.draft",
      (demos.find((d) => d.id === stored("picorv32.demo")) || demos[0]).source,
    ),
  );
  const [compiledSource, setCompiledSource] = useState("");
  const [image, setImage] = useState<number[] | null>(null);
  const [binaryName, setBinaryName] = useState("");
  const [disassembly, setDisassembly] = useState<DisassemblyLine[]>([]);
  const [disassemblyLimit, setDisassemblyLimit] = useState(256);
  const [lineMap, setLineMap] = useState<Record<string, number>>({});
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<
    "registers" | "memory" | "console" | "signals"
  >("registers");
  const [speed, setSpeed] = useState(1000);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [memoryAddress, setMemoryAddress] = useState("0x00000000");
  const [camera, setCamera] = useState<CameraView>("perspective");
  const [rotate, setRotate] = useState(false);
  const [labels, setLabels] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [activeSection, setActiveSection] = useState("explorer");
  const [activity, setActivity] = useState<"quiz" | "assembly" | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizHinted, setQuizHinted] = useState(false);
  const [quizWrong, setQuizWrong] = useState(false);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState("");
  const [savedScore, setSavedScore] = useState(stored("picorv32.quiz"));
  const [placed, setPlaced] = useState<string[]>([]);
  const [trayPart, setTrayPart] = useState("cpu");
  const [assemblyFeedback, setAssemblyFeedback] = useState(
    "Choose a part, then click its matching footprint.",
  );
  const [assemblyDone, setAssemblyDone] = useState(
    stored("picorv32.assembled") === "true",
  );
  const socketRef = useRef<WebSocket | null>(null);
  const initialized = useRef(false);
  const compileRequest = useRef(0);
  const sourceRef = useRef(source);
  const importedImageRef = useRef<number[] | null>(null);
  const importedSourceRef = useRef<string | null>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const registerRef = useRef<number[]>([]);
  const running = snapshot.status === "running";
  const dirty = source !== compiledSource;
  const binaryLoaded =
    importedImageRef.current !== null && source === importedSourceRef.current;
  const ready = connected && !busy && image !== null;
  const canExecute = ready && !snapshot.halted && !dirty;
  const activeLine =
    disassembly.find((row) => row.address === snapshot.pc)?.line ||
    lineMap[String(snapshot.pc)] ||
    lineMap[hex(snapshot.pc)];
  const detail = parts.find((p) => p.id === selectedPart);

  useEffect(() => {
    sourceRef.current = source;
    if (source !== importedSourceRef.current) save("picorv32.draft", source);
  }, [source]);
  useEffect(() => {
    registerRef.current = snapshot.regs;
  }, [snapshot]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPart(null);
        setMobileNav(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActiveSection(entry.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    for (const id of ["explorer", "workbench", "lessons", "practice"]) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  const send = useCallback((command: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(command));
      return true;
    }
    setError(
      "The local simulator is disconnected. Keep the app server running, then reconnect.",
    );
    return false;
  }, []);

  const assemble = useCallback(
    async (text: string) => {
      const request = ++compileRequest.current;
      setBusy(true);
      setError("");
      setDiagnostics([]);
      if (socketRef.current?.readyState === WebSocket.OPEN)
        socketRef.current.send(JSON.stringify({ type: "pause" }));
      try {
        const response = await fetch("/api/assemble", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: text }),
        });
        const result: AssemblyResult = await response.json();
        if (request !== compileRequest.current) return;
        if (!response.ok || !result.ok || !result.image) {
          setDiagnostics(result.diagnostics || []);
          setError(
            result.message ||
              result.diagnostics?.[0]?.message ||
              "Assembly failed. Check the highlighted source lines.",
          );
          return;
        }
        setImage(result.image);
        importedImageRef.current = null;
        importedSourceRef.current = null;
        setBinaryName("");
        setDisassembly(result.disassembly || []);
        setDisassemblyLimit(256);
        setLineMap(result.lineMap || {});
        setCompiledSource(text);
        setBreakpoints([]);
        send({ type: "load", image: result.image });
      } catch (failure) {
        if (request === compileRequest.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not reach the assembler.",
          );
      } finally {
        if (request === compileRequest.current) setBusy(false);
      }
    },
    [send],
  );

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/simulation`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        if (!disposed) {
          setError("");
          initialized.current = false;
        }
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "snapshot") {
            setSnapshot(message.snapshot);
            setConnected(true);
          } else if (message.type === "error")
            setError(message.message || "The simulator reported an error.");
        } catch {
          setError(
            "The simulator returned an unreadable response. Restart the local server.",
          );
        }
      };
      socket.onerror = () => {
        if (!disposed) setConnected(false);
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          retry = setTimeout(connect, 2000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (connected && !initialized.current) {
      initialized.current = true;
      if (
        importedImageRef.current &&
        sourceRef.current === importedSourceRef.current
      ) {
        send({ type: "load", image: importedImageRef.current });
      } else {
        void assemble(sourceRef.current);
      }
    }
  }, [connected, assemble, send]);

  useEffect(() => {
    const current = disassembly.findIndex((row) => row.address === snapshot.pc);
    if (current >= disassemblyLimit)
      setDisassemblyLimit(Math.ceil((current + 1) / 256) * 256);
  }, [snapshot.pc, disassembly, disassemblyLimit]);

  function toggleBreakpoint(address: number) {
    const next = breakpoints.includes(address)
      ? breakpoints.filter((item) => item !== address)
      : [...breakpoints, address];
    setBreakpoints(next);
    if (running) send({ type: "run", speed, breakpoints: next });
  }

  function navigateInspector(
    event: React.KeyboardEvent<HTMLButtonElement>,
    name: (typeof inspectorTabs)[number],
  ) {
    const index = inspectorTabs.indexOf(name);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % inspectorTabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + inspectorTabs.length - 1) % inspectorTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = inspectorTabs.length - 1;
    else return;
    event.preventDefault();
    setTab(inspectorTabs[next]);
    document.getElementById(`tab-${inspectorTabs[next]}`)?.focus();
  }

  function readMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^(?:0x)?[0-9a-f]{1,8}$/i.test(memoryAddress)) {
      setError(
        "Enter a hexadecimal address between 0x00000000 and 0x0000fffc.",
      );
      return;
    }
    const address = Number.parseInt(memoryAddress.replace(/^0x/i, ""), 16);
    if (address > 65532) {
      setError("Memory address must be between 0x00000000 and 0x0000fffc.");
      return;
    }
    setError("");
    send({ type: "readMemory", address: address & ~3 });
  }

  function selectDemo(id: string, open = false) {
    const next = demos.find((d) => d.id === id);
    if (!next) return;
    importedImageRef.current = null;
    importedSourceRef.current = null;
    setBinaryName("");
    setDemoId(id);
    save("picorv32.demo", id);
    setSource(next.source);
    setError("");
    if (id === "console") setTab("console");
    else if (id === "memory") setTab("memory");
    else setTab("registers");
    if (connected) void assemble(next.source);
    if (open) go("workbench");
  }

  async function importBinary(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.size || file.size > 65536) {
      setError("Choose a non-empty raw binary of 64 KiB or less.");
      return;
    }
    const request = ++compileRequest.current;
    setBusy(true);
    setError("");
    send({ type: "pause" });
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const response = await fetch("/api/disassemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: bytes }),
      });
      const result: AssemblyResult = await response.json();
      if (request !== compileRequest.current) return;
      if (!response.ok || !result.ok) {
        setError(
          result.message ||
            "Could not read this binary. Choose a raw RV32IM binary of 64 KiB or less.",
        );
        return;
      }
      const importedSource = `# Imported program: ${file.name}\n# ${bytes.length} bytes, loaded at address 0x00000000.\n# Edit assembly here and click Assemble & Load to replace it.\n`;
      importedImageRef.current = bytes;
      importedSourceRef.current = importedSource;
      setBinaryName(file.name);
      setSource(importedSource);
      setCompiledSource(importedSource);
      setImage(bytes);
      setDiagnostics([]);
      setLineMap({});
      setBreakpoints([]);
      setDisassembly(result.disassembly || []);
      setDisassemblyLimit(256);
      send({ type: "load", image: bytes });
    } catch (failure) {
      if (request === compileRequest.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The binary could not be read. Please try again.",
        );
    } finally {
      if (request === compileRequest.current) setBusy(false);
    }
  }

  function inspectPart(id: string | null) {
    if (activity === "quiz" && !quizFinished && id) {
      if (quizAnswered) return;
      if (id === questions[quizIndex].id) {
        if (!quizHinted && !quizWrong) setQuizScore((score) => score + 1);
        setQuizAnswered(true);
        setQuizFeedback(
          `That’s it. ${parts.find((p) => p.id === id)?.description}`,
        );
        setSelectedPart(id);
      } else {
        setQuizWrong(true);
        setQuizFeedback(
          "Take another look. You can rotate the board or ask for a hint.",
        );
      }
      return;
    }
    if (activity === "assembly") return;
    setSelectedPart(id);
    if (id) setRotate(false);
  }

  function startQuiz() {
    setActivity("quiz");
    setQuizIndex(0);
    setQuizScore(0);
    setQuizHinted(false);
    setQuizWrong(false);
    setQuizAnswered(false);
    setQuizFinished(false);
    setQuizFeedback("");
    setSelectedPart(null);
    setCamera("perspective");
    setRotate(false);
    setExploded(false);
    setCutaway(false);
    setLabels(false);
    go("explorer");
  }

  function nextQuestion() {
    if (quizIndex === questions.length - 1) {
      setQuizFinished(true);
      setSavedScore(String(quizScore));
      save("picorv32.quiz", String(quizScore));
      return;
    }
    setQuizIndex((i) => i + 1);
    setQuizHinted(false);
    setQuizWrong(false);
    setQuizAnswered(false);
    setQuizFeedback("");
    setSelectedPart(null);
  }

  function startAssembly() {
    setActivity("assembly");
    setPlaced([]);
    setTrayPart("cpu");
    setAssemblyFeedback("Choose a part, then click its matching footprint.");
    setSelectedPart(null);
    setCamera("top");
    setRotate(false);
    setExploded(false);
    setCutaway(false);
    setLabels(true);
    go("explorer");
  }

  function placePart(id: string) {
    if (activity !== "assembly" || placed.includes(id)) return;
    if (id !== trayPart) {
      setAssemblyFeedback(
        "That footprint belongs to a different part. Try the highlighted component’s position.",
      );
      return;
    }
    const next = [...placed, id];
    setPlaced(next);
    const following = parts.find((p) => !next.includes(p.id));
    if (following) {
      setTrayPart(following.id);
      setAssemblyFeedback(
        `${parts.find((p) => p.id === id)?.name} fitted. Choose your next part.`,
      );
    } else {
      setAssemblyDone(true);
      save("picorv32.assembled", "true");
      setAssemblyFeedback(
        "All six modules are fitted. Your demo board is ready to explore.",
      );
    }
  }

  function endActivity() {
    setActivity(null);
    setSelectedPart(null);
    setLabels(false);
    go("practice");
  }
  const sceneProps = {
    camera,
    rotate,
    labels,
    exploded,
    cutaway,
    selectedPart,
    onSelectPart: inspectPart,
    leds: snapshot.leds,
    running,
    cpuState: snapshot.state,
  };

  return (
    <>
      <a className="skip-link" href="#workbench">
        Skip to the workbench
      </a>
      <header className="site-header">
        <a
          className="brand"
          aria-label="PicoRV32 Lab"
          href="#explorer"
          onClick={() => setMobileNav(false)}
        >
          <span className="brand-icon">
            <img src="/eec-logo.svg" alt="EEC" width={24} height={28} />
          </span>
          PicoRV32 <span className="brand-light">Lab</span>
        </a>
        <nav
          className={mobileNav ? "nav-links nav-open" : "nav-links"}
          aria-label="Main navigation"
        >
          {[
            ["explorer", "Explorer"],
            ["workbench", "Workbench"],
            ["lessons", "Lessons"],
            ["practice", "Practice"],
          ].map(([id, title]) => (
            <a
              href={`#${id}`}
              key={id}
              className={activeSection === id ? "active" : ""}
              aria-current={activeSection === id ? "location" : undefined}
              onClick={() => setMobileNav(false)}
            >
              {title}
            </a>
          ))}
        </nav>
        <div
          className={`connection-badge ${connected ? "is-connected" : ""}`}
          title={
            connected
              ? "Connected to the native Verilator simulation on this computer."
              : "Waiting for the local simulation server."
          }
        >
          <span />
          {connected ? "Local simulator" : "Connecting…"}
          <Icon name="chip" size={13} />
        </div>
        <button
          className="icon-button mobile-menu"
          onClick={() => setMobileNav((v) => !v)}
          aria-label="Toggle navigation"
          aria-expanded={mobileNav}
        >
          <Icon name={mobileNav ? "close" : "menu"} />
        </button>
      </header>

      <main>
        <section
          className={`hero ${activity ? "has-activity" : ""}`}
          id="explorer"
          aria-label="Interactive PicoRV32 explorer"
        >
          <div className="hero-scene">
            <BoardScene
              {...sceneProps}
              assemblyMode={activity === "assembly"}
              assemblyPlaced={placed}
              onPlacePart={placePart}
            />
          </div>
          <div className="hero-vignette" />
          <div className="hero-content">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> OPEN HARDWARE{" "}
              <span className="eyebrow-slash">/</span> RISC-V
            </div>
            <h1>
              A little core.
              <br />
              <em>A whole world.</em>
            </h1>
            <p>
              A processor you can get your hands on.
              <br className="desktop-break" /> Explore the parts. Write the
              code.
              <br className="desktop-break" /> Watch every instruction come to
              life.
            </p>
            <div className="hero-actions">
              <button
                className="button button-dark"
                onClick={() => go("workbench")}
              >
                <Icon name="code" size={17} />
                Open the workbench
                <Icon name="arrow" size={17} />
              </button>
              <span className="hero-level">
                <i />
                <i />
                <i /> All curious minds
              </span>
            </div>
            <div className="hero-note">
              <Icon name="info" size={13} />
              <span>Virtual demo board · original PicoRV32 core</span>
            </div>
          </div>

          <div className="scene-index">
            <span>THE EXPLORER</span>
            <strong>
              01 <i>/</i> 01
            </strong>
          </div>
          <div className="scene-caption">
            <Icon name="mouse" size={15} />
            <span>
              Drag to explore <i>·</i> Scroll to zoom <i>·</i> Click a part
            </span>
          </div>

          {detail && !activity && (
            <aside
              className="part-detail"
              role="dialog"
              aria-label={detail.name}
            >
              <button
                className="icon-button part-close"
                onClick={() => setSelectedPart(null)}
                aria-label="Close component details"
              >
                <Icon name="close" size={16} />
              </button>
              <span className="eyebrow">{detail.label}</span>
              <h3>{detail.name}</h3>
              <p>{detail.description}</p>
              <details>
                <summary>
                  Take a closer look <Icon name="chevron" size={13} />
                </summary>
                <p>{detail.detail}</p>
              </details>
              <span className="part-detail-foot">
                <span /> VIRTUAL DEMO SYSTEM
              </span>
            </aside>
          )}

          {activity === "quiz" && (
            <aside
              className="activity-panel"
              aria-label="Component quiz"
              aria-live="polite"
            >
              <button
                className="icon-button part-close"
                onClick={endActivity}
                aria-label="Close quiz"
              >
                <Icon name="close" size={16} />
              </button>
              <div className="eyebrow">
                <Icon name="target" size={14} /> FIND THE PART{" "}
                <span>
                  {quizFinished
                    ? "COMPLETE"
                    : `${quizIndex + 1} / ${questions.length}`}
                </span>
              </div>
              {quizFinished ? (
                <>
                  <div className="activity-success">
                    <Icon name="check" size={28} />
                  </div>
                  <h3>You know your way around.</h3>
                  <p>
                    {quizScore} of {questions.length} found on your first try
                    without a hint. Every part has a job; now you know where to
                    find it.
                  </p>
                  <button className="button button-teal" onClick={endActivity}>
                    Back to practice
                    <Icon name="arrow" size={15} />
                  </button>
                </>
              ) : (
                <>
                  <h3>{questions[quizIndex].question}</h3>
                  <div className="question-progress">
                    {questions.map((q, i) => (
                      <span
                        key={q.id}
                        className={i <= quizIndex ? "done" : ""}
                      />
                    ))}
                  </div>
                  {quizFeedback && (
                    <p
                      className={
                        quizAnswered
                          ? "activity-feedback success"
                          : "activity-feedback"
                      }
                    >
                      {quizFeedback}
                    </p>
                  )}
                  <div className="activity-buttons">
                    {quizAnswered ? (
                      <button
                        className="button button-teal"
                        onClick={nextQuestion}
                      >
                        {quizIndex === questions.length - 1
                          ? "See my score"
                          : "Next part"}
                        <Icon name="arrow" size={15} />
                      </button>
                    ) : (
                      <>
                        <button
                          className="button button-small"
                          onClick={() => {
                            setQuizHinted(true);
                            setSelectedPart(questions[quizIndex].id);
                            setQuizFeedback(questions[quizIndex].hint);
                          }}
                        >
                          A little hint
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setQuizHinted(true);
                            setQuizAnswered(true);
                            setSelectedPart(questions[quizIndex].id);
                            setQuizFeedback(
                              `Here it is: ${parts.find((p) => p.id === questions[quizIndex].id)?.name}.`,
                            );
                          }}
                        >
                          Show me
                        </button>
                      </>
                    )}
                  </div>
                  <details className="accessible-parts">
                    <summary>Choose a component by name</summary>
                    <div>
                      {parts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => inspectPart(p.id)}
                          disabled={quizAnswered}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </aside>
          )}

          {activity === "assembly" && (
            <aside
              className="activity-panel assembly-panel"
              aria-label="Board assembly"
              aria-live="polite"
            >
              <button
                className="icon-button part-close"
                onClick={endActivity}
                aria-label="Close assembly exercise"
              >
                <Icon name="close" size={16} />
              </button>
              <div className="eyebrow">
                <Icon name="layers" size={14} /> ASSEMBLE IT{" "}
                <span>{placed.length} / 6</span>
              </div>
              <h3>
                {placed.length === 6
                  ? "A place for every part."
                  : "Build it, piece by piece."}
              </h3>
              <p
                className={
                  placed.length === 6 ? "activity-feedback success" : ""
                }
              >
                {assemblyFeedback}
              </p>
              <div className="parts-tray">
                {parts.map((p) => (
                  <button
                    key={p.id}
                    disabled={placed.includes(p.id)}
                    className={trayPart === p.id ? "selected" : ""}
                    onClick={() => setTrayPart(p.id)}
                  >
                    <Icon
                      name={
                        p.id === "cpu"
                          ? "chip"
                          : p.id === "ram"
                            ? "memory"
                            : p.id === "clock"
                              ? "clock"
                              : p.id === "power"
                                ? "bolt"
                                : p.id === "gpio"
                                  ? "switches"
                                  : "terminal"
                      }
                      size={20}
                    />
                    <span>{p.name}</span>
                    {placed.includes(p.id) && <Icon name="check" size={14} />}
                  </button>
                ))}
              </div>
              {placed.length === 6 ? (
                <button className="button button-teal" onClick={endActivity}>
                  Board complete
                  <Icon name="check" size={16} />
                </button>
              ) : (
                <button
                  className="text-button assembly-fit"
                  onClick={() => placePart(trayPart)}
                >
                  Fit selected part <Icon name="arrow" size={14} />
                </button>
              )}
              <span className="activity-footnote">
                A conceptual assembly of the lab’s virtual modules.
              </span>
            </aside>
          )}

          <div className="hero-dock">
            <div
              className="view-toolbar"
              role="toolbar"
              aria-label="3D explorer controls"
            >
              <div className="camera-segment">
                {(
                  [
                    ["perspective", "3/4"],
                    ["top", "Top"],
                    ["bottom", "Bottom"],
                    ["front", "Front"],
                  ] as [CameraView, string][]
                ).map(([view, text]) => (
                  <button
                    className={camera === view ? "selected" : ""}
                    key={view}
                    aria-pressed={camera === view}
                    onClick={() => {
                      setCamera(view);
                      setSelectedPart(null);
                      setRotate(false);
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <span className="tool-divider" />
              <button
                className={rotate ? "selected" : ""}
                aria-pressed={rotate}
                onClick={() => setRotate((v) => !v)}
              >
                <Icon name="rotate" size={15} />
                <span>Rotate</span>
              </button>
              <button
                className={labels ? "selected" : ""}
                aria-pressed={labels}
                onClick={() => setLabels((v) => !v)}
              >
                <Icon name="label" size={15} />
                <span>Labels</span>
              </button>
              <button
                className={cutaway ? "selected" : ""}
                aria-pressed={cutaway}
                disabled={!!activity}
                onClick={() => {
                  setCutaway((v) => !v);
                  setSelectedPart(null);
                }}
              >
                <Icon name="chip" size={15} />
                <span>Inside the core</span>
              </button>
              <span className="tool-divider" />
              <button
                className={`explode-button ${exploded ? "selected" : ""}`}
                aria-pressed={exploded}
                disabled={!!activity}
                onClick={() => {
                  setExploded((v) => !v);
                  setSelectedPart(null);
                }}
              >
                <Icon name="layers" size={15} />
                <span>Exploded view</span>
              </button>
            </div>
            <div className="demo-rail" aria-label="Choose an example program">
              <div className="rail-intro">
                <span>SMALL PROGRAMS.</span>
                <strong>Big discoveries.</strong>
                <Icon name="arrow" size={18} />
              </div>
              {demos.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => selectDemo(item.id)}
                  className={`demo-card ${demoId === item.id ? "active" : ""}`}
                  aria-pressed={demoId === item.id}
                >
                  <span className="demo-number">0{i + 1}</span>
                  <MiniBoard type={item.id} active={demoId === item.id} />
                  <span className="demo-name">{item.name}</span>
                  <span className="demo-subtitle">
                    {item.category.toLowerCase()}
                  </span>
                  {demoId === item.id && <span className="demo-active-line" />}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="workbench-section page-section" id="workbench">
          <div className="section-heading">
            <div>
              <SectionLabel number="01">THE WORKBENCH</SectionLabel>
              <h2>
                Ideas in.
                <br />
                <em>Instructions out.</em>
              </h2>
            </div>
            <div className="section-intro">
              <p>
                A real little processor, right here on your desk. Write a few
                lines of assembly, load them into memory, and follow the journey
                from your code to the core.
              </p>
              <div className="section-promises">
                <span>
                  <Icon name="chip" size={15} />
                  Original Verilog
                </span>
                <span>
                  <Icon name="clock" size={15} />
                  Cycle by cycle
                </span>
                <span>
                  <Icon name="code" size={15} />
                  GNU assembler
                </span>
              </div>
            </div>
          </div>

          <div className="workbench-shell" ref={benchRef}>
            <div className="bench-toolbar">
              <div className="bench-identity">
                <span className="bench-icon">
                  <Icon name="code" size={18} />
                </span>
                <div>
                  <strong>
                    {binaryLoaded
                      ? binaryName
                      : source === demo.source
                        ? demo.name
                        : "Your program"}
                  </strong>
                  <span>
                    RV32IM <i>·</i> {image?.length ?? 0} bytes loaded
                  </span>
                </div>
              </div>
              <div className="bench-controls">
                <button
                  className={`button button-small ${running ? "button-teal" : "button-dark"}`}
                  disabled={running ? !ready : !canExecute}
                  title={
                    dirty
                      ? "Assemble your changes before running."
                      : snapshot.halted
                        ? "Reset the program to run again."
                        : "Run the loaded program"
                  }
                  onClick={() =>
                    send(
                      running
                        ? { type: "pause" }
                        : { type: "run", speed, breakpoints },
                    )
                  }
                >
                  <Icon name={running ? "pause" : "play"} size={13} />
                  {running ? "Pause" : "Run"}
                </button>
                <button
                  className="button button-small"
                  disabled={!canExecute || running}
                  onClick={() => send({ type: "stepInstruction" })}
                >
                  <Icon name="step" size={14} />
                  <span className="step-text">Instruction</span>
                </button>
                <button
                  className="button button-small"
                  disabled={!canExecute || running}
                  onClick={() => send({ type: "stepCycle" })}
                >
                  <Icon name="clock" size={14} />
                  <span className="step-text">Cycle</span>
                </button>
                <button
                  className="icon-button"
                  disabled={!ready}
                  onClick={() => {
                    setError("");
                    send({ type: "reset" });
                  }}
                  title="Restore the loaded program and reset the core"
                  aria-label="Reset program"
                >
                  <Icon name="reset" size={17} />
                </button>
                <span className="tool-divider" />
                <label className="speed-control">
                  <span className="sr-only">
                    Simulation speed in cycles per second
                  </span>
                  <select
                    value={speed}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setSpeed(value);
                      if (running)
                        send({ type: "run", speed: value, breakpoints });
                    }}
                  >
                    {[10, 100, 1000, 10000].map((value) => (
                      <option value={value} key={value}>
                        {value.toLocaleString()} cycles/s
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="icon-button fullscreen-button"
                  aria-label="Toggle workbench full screen"
                  onClick={() => {
                    if (document.fullscreenElement)
                      void document.exitFullscreen();
                    else
                      void benchRef.current
                        ?.requestFullscreen()
                        .catch(() =>
                          setError(
                            "Full screen is unavailable in this browser.",
                          ),
                        );
                  }}
                >
                  <Icon name="expand" size={17} />
                </button>
              </div>
            </div>

            {error && (
              <div className="error-banner" role="alert">
                <Icon name="alert" size={17} />
                <span>{error}</span>
                <button
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
            {!connected && (
              <div className="connection-notice">
                <span className="loading-dot" />
                Waiting for your local simulator. If it is not installed yet,
                run <code>npm run setup:sim</code>.
              </div>
            )}

            <div className="bench-body">
              <div className="source-panel">
                <div className="panel-heading">
                  <span>
                    <Icon name="code" size={14} />
                    PROGRAM.S
                  </span>
                  <span
                    className={dirty ? "source-state dirty" : "source-state"}
                  >
                    {busy
                      ? "Assembling…"
                      : dirty
                        ? "Unassembled changes"
                        : binaryLoaded
                          ? "Binary loaded"
                          : "Assembled"}
                  </span>
                </div>
                <AssemblyEditor
                  value={source}
                  onChange={setSource}
                  activeLine={dirty ? undefined : activeLine}
                  diagnostics={diagnostics}
                />
                <div className="source-footer">
                  <button
                    className="button button-teal button-small"
                    disabled={!connected || busy || binaryLoaded}
                    title={
                      binaryLoaded
                        ? "Edit the assembly source to replace this imported binary."
                        : "Assemble the source and load it into the core."
                    }
                    onClick={() => void assemble(source)}
                  >
                    <Icon
                      name={busy ? "rotate" : "bolt"}
                      className={busy ? "spin" : ""}
                      size={14}
                    />
                    {busy ? "Assembling…" : "Assemble & load"}
                  </button>
                  <div>
                    <button
                      className="icon-button"
                      onClick={() =>
                        download("program.s", source, "text/plain")
                      }
                      aria-label="Download assembly source"
                      title="Download source"
                    >
                      <Icon name="download" size={15} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!connected || busy}
                      onClick={() => fileRef.current?.click()}
                      aria-label="Import a raw binary"
                      title="Import .bin"
                    >
                      <Icon name="upload" size={15} />
                    </button>
                    <input
                      type="file"
                      accept=".bin,application/octet-stream"
                      ref={fileRef}
                      onChange={(event) => void importBinary(event)}
                      hidden
                    />
                  </div>
                </div>
                <div className="source-tip">
                  <span className="keyboard-key">.bin</span> Raw binaries load
                  at address zero.{" "}
                  <button
                    disabled={!image}
                    onClick={() =>
                      image &&
                      download(
                        "program.bin",
                        new Uint8Array(image),
                        "application/octet-stream",
                      )
                    }
                  >
                    Export binary <Icon name="arrowUp" size={11} />
                  </button>
                </div>
              </div>

              <div className="live-panel">
                <div className="panel-heading">
                  <span>
                    <i className={`live-dot ${running ? "running" : ""}`} />
                    LIVE HARDWARE MODEL
                  </span>
                  <span
                    className={`state-tag ${snapshot.halted ? "halted" : ""}`}
                  >
                    {connected ? snapshot.status : "offline"}
                  </span>
                </div>
                <div className="bench-board">
                  <BoardScene
                    {...sceneProps}
                    onSelectPart={(id) => {
                      if (id) {
                        setActivity(null);
                        setSelectedPart(id);
                        setRotate(false);
                        go("explorer");
                      }
                    }}
                    compact
                    camera="perspective"
                    rotate={false}
                    labels={false}
                    exploded={false}
                    cutaway={false}
                    assemblyMode={false}
                  />
                  <div className="board-corner-label">
                    PICO<span>RV32</span>
                    <small>VIRTUAL DEMO BOARD / REV. 01</small>
                  </div>
                </div>
                <div className="hardware-io">
                  <div className="io-row">
                    <span className="io-title">
                      OUTPUT <code>0x10000004</code>
                    </span>
                    <div
                      className="led-bank"
                      aria-label={`Output LEDs: ${snapshot.leds.toString(2).padStart(8, "0")}`}
                    >
                      {Array.from({ length: 8 }, (_, i) => (
                        <div
                          className={`led-indicator ${snapshot.leds & (1 << i) ? "on" : ""}`}
                          key={i}
                          title={`LED ${i}: ${snapshot.leds & (1 << i) ? "on" : "off"}`}
                        >
                          <span />
                          <small>{i}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="io-row">
                    <span className="io-title">
                      INPUT <code>0x10000008</code>
                    </span>
                    <div className="switch-bank">
                      {Array.from({ length: 8 }, (_, i) => (
                        <button
                          key={i}
                          className={snapshot.inputs & (1 << i) ? "on" : ""}
                          disabled={!ready}
                          onClick={() =>
                            send({
                              type: "setInputs",
                              value: snapshot.inputs ^ (1 << i),
                            })
                          }
                          aria-label={`Input switch ${i}`}
                          aria-pressed={!!(snapshot.inputs & (1 << i))}
                        >
                          <span />
                          <small>{i}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="cpu-readout">
                  <div>
                    <span>CLOCK CYCLES</span>
                    <strong>{snapshot.cycle.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>INSTRUCTIONS</span>
                    <strong>{snapshot.retired.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>CONTROL STATE</span>
                    <strong className="control-state">
                      {snapshot.state.replaceAll("_", " ")}
                    </strong>
                  </div>
                </div>
                {snapshot.message && (
                  <div
                    className={`simulation-message ${snapshot.status === "error" ? "is-error" : ""}`}
                    role="status"
                  >
                    <Icon
                      name={snapshot.status === "error" ? "alert" : "info"}
                      size={13}
                    />
                    {snapshot.message}
                  </div>
                )}
              </div>

              <div className="inspector-panel">
                <div
                  className="inspector-tabs"
                  role="tablist"
                  aria-label="Inspect the processor"
                >
                  {inspectorTabs.map((name) => (
                    <button
                      key={name}
                      role="tab"
                      tabIndex={tab === name ? 0 : -1}
                      onKeyDown={(event) => navigateInspector(event, name)}
                      aria-selected={tab === name}
                      aria-controls={`inspector-${name}`}
                      id={`tab-${name}`}
                      onClick={() => setTab(name)}
                    >
                      <Icon
                        name={name === "console" ? "terminal" : name}
                        size={14}
                      />
                      <span>{name[0].toUpperCase() + name.slice(1)}</span>
                      {name === "console" && snapshot.console.length > 0 && (
                        <i />
                      )}
                    </button>
                  ))}
                </div>
                <div
                  className="inspector-content"
                  role="tabpanel"
                  id={`inspector-${tab}`}
                  aria-labelledby={`tab-${tab}`}
                  tabIndex={0}
                >
                  {tab === "registers" && (
                    <>
                      <div className="pc-readout">
                        <span>PROGRAM COUNTER</span>
                        <code>{hex(snapshot.pc)}</code>
                        <small>32 GENERAL-PURPOSE REGISTERS</small>
                      </div>
                      <div className="register-grid">
                        {snapshot.regs.map((value, i) => (
                          <div
                            key={i}
                            className={`register-item ${registerRef.current[i] !== undefined && registerRef.current[i] !== value ? "changed" : ""}`}
                          >
                            <span>
                              <b>x{i}</b>
                              <small>{aliases[i]}</small>
                            </span>
                            <code>{hex(value)}</code>
                          </div>
                        ))}
                      </div>
                      <p className="inspector-footnote">
                        x0 always reads zero. x2 initializes to 0x00010000.
                      </p>
                    </>
                  )}
                  {tab === "memory" && (
                    <>
                      <form className="memory-form" onSubmit={readMemory}>
                        <label htmlFor="memory-address">START ADDRESS</label>
                        <div>
                          <input
                            id="memory-address"
                            value={memoryAddress}
                            onChange={(event) =>
                              setMemoryAddress(event.target.value)
                            }
                            spellCheck={false}
                            maxLength={10}
                          />
                          <button
                            className="icon-button"
                            disabled={!ready}
                            aria-label="Read memory"
                          >
                            <Icon name="arrow" size={16} />
                          </button>
                        </div>
                      </form>
                      <div className="memory-table">
                        <div className="memory-table-head">
                          <span>ADDRESS</span>
                          <span>WORD · LITTLE ENDIAN</span>
                        </div>
                        {snapshot.memory.length ? (
                          snapshot.memory.map((word) => (
                            <div key={word.address}>
                              <code>{hex(word.address)}</code>
                              <code>{hex(word.value)}</code>
                            </div>
                          ))
                        ) : (
                          <p className="inspector-description">
                            Load a program to inspect RAM.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  {tab === "console" && (
                    <>
                      <div className="console-label">
                        <Icon name="terminal" size={14} />
                        <span>MEMORY-MAPPED CONSOLE</span>
                        <code>0x10000000</code>
                      </div>
                      <div
                        className="console-output"
                        role="log"
                        aria-label="Program console output"
                      >
                        {snapshot.console ? (
                          <pre>{snapshot.console}</pre>
                        ) : (
                          <div className="console-empty">
                            <span className="console-cursor" />
                            <p>The core has something to say.</p>
                            <small>
                              Run “Hello, RISC-V” to print your first message.
                            </small>
                            <button
                              className="text-button"
                              onClick={() => selectDemo("console")}
                            >
                              Load the example
                              <Icon name="arrow" size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="inspector-footnote">
                        Each character is an actual store to the virtual output
                        device.
                      </p>
                    </>
                  )}
                  {tab === "signals" && <Signals trace={snapshot.trace} />}
                </div>
              </div>
            </div>

            <details className="disassembly-section" open>
              <summary>
                <span>
                  <Icon name="registers" size={14} />
                  MACHINE CODE{" "}
                  <span className="summary-count">
                    {disassembly.length} instructions
                  </span>
                </span>
                <span className="disassembly-hint">
                  Click a dot to set a breakpoint{" "}
                  <Icon name="chevron" size={12} />
                </span>
              </summary>
              <div className="disassembly-scroll">
                <table>
                  <thead>
                    <tr>
                      <th aria-label="Breakpoint" />
                      <th>ADDRESS</th>
                      <th>MACHINE CODE</th>
                      <th>INSTRUCTION</th>
                      <th>SOURCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disassembly
                      .slice(0, disassemblyLimit)
                      .map((row, index) => (
                        <tr
                          key={`${row.address}-${index}`}
                          className={
                            snapshot.pc === row.address
                              ? "current-instruction"
                              : ""
                          }
                        >
                          <td>
                            <button
                              className={`breakpoint ${breakpoints.includes(row.address) ? "set" : ""}`}
                              aria-label={`${breakpoints.includes(row.address) ? "Remove" : "Set"} breakpoint at ${hex(row.address)}`}
                              aria-pressed={breakpoints.includes(row.address)}
                              onClick={() => toggleBreakpoint(row.address)}
                            />
                          </td>
                          <td>
                            <code>{hex(row.address)}</code>
                            {snapshot.pc === row.address && (
                              <Icon name="arrow" size={11} />
                            )}
                          </td>
                          <td>
                            <code>{row.hex}</code>
                          </td>
                          <td>
                            <code>{row.text}</code>
                          </td>
                          <td>
                            {row.line ? <span>line {row.line}</span> : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {disassembly.length > disassemblyLimit && (
                  <button
                    className="show-more-instructions"
                    onClick={() => setDisassemblyLimit((count) => count + 256)}
                  >
                    Show the next{" "}
                    {Math.min(256, disassembly.length - disassemblyLimit)}{" "}
                    instructions <Icon name="chevron" size={12} />
                  </button>
                )}
                {!disassembly.length && (
                  <div className="disassembly-empty">
                    Your assembled instructions will appear here.
                  </div>
                )}
              </div>
            </details>
            <div className="bench-bottom">
              <span>
                <i className={connected ? "connected" : ""} />
                {connected ? "Connected to Verilator" : "Simulator offline"}
              </span>
              <span>
                RV32IM <i>·</i> Native memory interface <i>·</i> 64 KiB RAM
              </span>
              <span>
                <Icon name="clock" size={12} /> {snapshot.cycle} clocks,{" "}
                {snapshot.retired} retired
              </span>
            </div>
          </div>

          <div className="example-note">
            <span className="example-note-label">
              <Icon name="flag" size={17} />
              ON THE BENCH
            </span>
            <p>
              {source === demo.source
                ? demo.description
                : "Your program runs on the same original PicoRV32 core. Inspect the registers, memory, console, and bus signals to follow what it does."}
            </p>
            <div>
              <span>LOOK FOR</span>
              <strong>
                {source === demo.source
                  ? demo.expected
                  : "Actual hardware state, one clock at a time."}
              </strong>
            </div>
          </div>
        </section>

        <section className="lessons-section page-section" id="lessons">
          <div className="section-heading">
            <div>
              <SectionLabel number="02">UNDER THE SURFACE</SectionLabel>
              <h2>
                Small by design.
                <br />
                <em>Full of possibility.</em>
              </h2>
            </div>
            <div className="section-intro">
              <p>
                PicoRV32 is a complete RISC-V processor written in Verilog. Its
                clever trick is simplicity: a compact set of hardware, reused
                over several clocks to do one useful thing after another.
              </p>
              <a
                className="inline-link"
                href="https://github.com/YosysHQ/picorv32"
                target="_blank"
                rel="noreferrer"
              >
                Meet the open-source project
                <Icon name="arrowUp" size={15} />
              </a>
            </div>
          </div>

          <div className="lesson-layout">
            <article className="core-story">
              <span className="eyebrow">HOW AN INSTRUCTION HAPPENS</span>
              <h3>
                A few bits.
                <br />A carefully timed journey.
              </h3>
              <p>
                First, the core fetches an instruction from memory. It decodes
                the bits, reads the registers it needs, and asks its arithmetic
                logic unit to do the work. A load or store adds a trip across
                the memory bus.
              </p>
              <div
                className="state-journey"
                aria-label="Instruction execution states"
              >
                <span>
                  <b>01</b> Fetch
                </span>
                <i />
                <span>
                  <b>02</b> Read
                </span>
                <i />
                <span>
                  <b>03</b> Execute
                </span>
                <i />
                <span>
                  <b>04</b> Memory
                </span>
              </div>
              <p className="story-caption">
                Each instruction visits the states it needs. Step Cycle to see
                the control state change; Step Instruction to see the completed
                result.
              </p>
              <div className="story-callout">
                <Icon name="clock" size={21} />
                <p>
                  <strong>One instruction can take several clocks.</strong>{" "}
                  Watch both counters on the workbench. Multiplication,
                  division, shifts, and memory operations follow their own paths
                  through the core.
                </p>
              </div>
              <button
                className="inline-link"
                onClick={() => {
                  selectDemo("hello", true);
                  setTab("signals");
                }}
              >
                Follow an instruction
                <Icon name="arrow" size={15} />
              </button>
            </article>
            <aside className="configuration-card">
              <span className="eyebrow">THIS LAB’S CONFIGURATION</span>
              <div className="configuration-title">
                <Icon name="chip" size={38} />
                <div>
                  <h3>PicoRV32</h3>
                  <span>Size-optimized RISC-V CPU</span>
                </div>
              </div>
              <dl>
                {[
                  ["Instruction set", "RV32IM"],
                  ["Register width", "32 bits"],
                  ["Register file", "32 registers"],
                  ["Program + data RAM", "64 KiB"],
                  ["Multiply / divide", "Enabled"],
                  ["Compressed instructions", "Disabled"],
                  ["Interrupts", "Disabled"],
                  ["Reset address", "0x00000000"],
                  ["Initial stack pointer", "0x00010000"],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="configuration-footer">
                <span className="open-source-mark">
                  <Icon name="code" size={13} /> ISC LICENSE
                </span>
                <span>Original RTL · pinned source</span>
              </div>
            </aside>
          </div>

          <div className="anatomy-heading">
            <div>
              <span className="eyebrow">SIX PARTS. ONE LITTLE SYSTEM.</span>
              <h3>Get to know your board.</h3>
            </div>
            <p>
              The board is an illustration. The core’s execution is real.
              <br />
              Pick a part to take a closer look in the explorer.
            </p>
          </div>
          <div className="anatomy-list">
            {parts.map((part, index) => (
              <button
                key={part.id}
                onClick={() => {
                  setActivity(null);
                  setSelectedPart(part.id);
                  setLabels(true);
                  setRotate(false);
                  go("explorer");
                }}
              >
                <span className="anatomy-number">0{index + 1}</span>
                <span className="anatomy-icon">
                  <Icon
                    name={
                      part.id === "cpu"
                        ? "chip"
                        : part.id === "ram"
                          ? "memory"
                          : part.id === "uart"
                            ? "terminal"
                            : part.id === "gpio"
                              ? "switches"
                              : part.id === "clock"
                                ? "clock"
                                : "bolt"
                    }
                    size={26}
                  />
                </span>
                <span className="anatomy-name">
                  <strong>{part.name}</strong>
                  <small>{part.short}</small>
                </span>
                <span className="anatomy-description">{part.description}</span>
                <Icon name="arrowUp" size={18} />
              </button>
            ))}
          </div>
        </section>

        <section className="practice-section page-section" id="practice">
          <div className="section-heading">
            <div>
              <SectionLabel number="03">MAKE IT STICK</SectionLabel>
              <h2>
                Now, <em>your turn.</em>
              </h2>
            </div>
            <div className="section-intro">
              <p>
                A good way to understand a system is to find your way around it.
                Try two small exercises on the 3D board. Take your time.
                Curiosity does the heavy lifting.
              </p>
            </div>
          </div>
          <div className="practice-grid">
            <article className="practice-card">
              <div className="practice-card-top">
                <span className="eyebrow">01 / A LITTLE EXPLORATION</span>
                <span className="practice-icon">
                  <Icon name="target" size={28} />
                </span>
              </div>
              <h3>Find the part.</h3>
              <p>
                We name a job. You find the part that does it. Turn the board,
                look closely, and click your answer.
              </p>
              <ol>
                <li>
                  <span>1</span>Read the clue and explore the board.
                </li>
                <li>
                  <span>2</span>Find the component. Hints are always here.
                </li>
                <li>
                  <span>3</span>See how much you’ve picked up.
                </li>
              </ol>
              <div className="practice-card-bottom">
                <button className="button button-dark" onClick={startQuiz}>
                  Find the parts
                  <Icon name="arrow" size={16} />
                </button>
                <span>
                  {savedScore ? (
                    <>
                      <Icon name="check" size={13} /> Last score: {savedScore}/6
                    </>
                  ) : (
                    "6 parts · about 2 min"
                  )}
                </span>
              </div>
            </article>
            <article className="practice-card assembly-card">
              <div className="practice-card-top">
                <span className="eyebrow">02 / PUT IT TOGETHER</span>
                <span className="practice-icon">
                  <Icon name="layers" size={28} />
                </span>
              </div>
              <h3>A place for every piece.</h3>
              <p>
                A bare board and a tray of parts. Fit each module onto its
                footprint and see how the system comes together.
              </p>
              <ol>
                <li>
                  <span>1</span>Pick a component from the parts tray.
                </li>
                <li>
                  <span>2</span>Find its home on the demo board.
                </li>
                <li>
                  <span>3</span>Fit all six modules to finish the build.
                </li>
              </ol>
              <div className="practice-card-bottom">
                <button className="button button-teal" onClick={startAssembly}>
                  Assemble the board
                  <Icon name="arrow" size={16} />
                </button>
                <span>
                  {assemblyDone ? (
                    <>
                      <Icon name="check" size={13} /> Completed
                    </>
                  ) : (
                    "6 modules · a few minutes"
                  )}
                </span>
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <a className="brand" href="#explorer" aria-label="PicoRV32 Lab">
            <span className="brand-icon">
              <img src="/eec-logo.svg" alt="EEC" width={24} height={28} />
            </span>
            PicoRV32 <span className="brand-light">Lab</span>
          </a>
          <p>Built for the joy of figuring things out.</p>
          <a className="back-to-top" href="#explorer">
            Back to the bench
            <Icon name="arrowUp" size={16} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>
            Original PicoRV32 RTL <i>·</i> Verilator <i>·</i> Three.js
          </span>
          <span>Procedural 3D illustration. Native hardware simulation.</span>
          <a
            href="https://github.com/YosysHQ/picorv32"
            target="_blank"
            rel="noreferrer"
          >
            Open hardware, open possibilities
            <Icon name="arrowUp" size={12} />
          </a>
        </div>
      </footer>
    </>
  );
}

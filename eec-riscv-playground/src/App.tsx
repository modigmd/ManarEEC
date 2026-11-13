import { useCallback, useEffect, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import AssemblyEditor from "./AssemblyEditor";
import BoardScene from "./BoardScene";
import InstructionFlow from "./InstructionFlow";
import ProcessorMark from "./ProcessorMark";
import Icon from "./icons";
import {
  lessons,
  initialSnapshot,
  hex,
  exampleRetirement,
  checkLesson,
  tools,
} from "./curriculum";
import type {
  AssemblyResult,
  CameraView,
  Diagnostic,
  DisassemblyLine,
  FlowPhase,
  LessonId,
  RetiredInstruction,
  Snapshot,
  TraceSample,
} from "./types";

const DIRECTORY = "https://eec-club-hardware.netlify.app/";
const REPOSITORY = "https://github.com/modigmd/ManarEEC";
const OLD_LAB = "http://127.0.0.1:5173/";
const IS_LOCAL = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
  location.hostname,
);
const phases: FlowPhase[] = ["instruction", "registers", "alu", "writeback"];
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
type View = "flow" | "board" | "registers" | "memory" | "signals";
const views: { id: View; name: string; icon: string }[] = [
  { id: "flow", name: "Inside CPU", icon: "chip" },
  { id: "board", name: "Board", icon: "cube" },
  { id: "registers", name: "Registers", icon: "registers" },
  { id: "memory", name: "Memory", icon: "memory" },
  { id: "signals", name: "Signals", icon: "signals" },
];
const boardParts: Record<string, { name: string; text: string }> = {
  cpu: {
    name: "PicoRV32 core",
    text: "The original 32-bit RISC-V Verilog core executes your instructions. This package is an illustration of a soft processor.",
  },
  ram: {
    name: "Program & data RAM",
    text: "64 KiB of shared memory holds instructions, variables, and the stack. The program begins at address zero.",
  },
  gpio: {
    name: "Input / output",
    text: "Eight LEDs show the low eight output bits. The input switches are read through a memory-mapped register.",
  },
  uart: {
    name: "Console bridge",
    text: "Write a character byte at 0x10000000 to send text to the virtual console.",
  },
  clock: {
    name: "Clock",
    text: "Every rising edge advances the hardware model. PicoRV32 generally needs several clocks per instruction.",
  },
  power: {
    name: "Power & reset",
    text: "Reset restores the loaded program and clears its execution history. The demo board is a virtual learning system.",
  },
};

function read(key: string, fallback = "") {
  try {
    return localStorage.getItem(`eec-riscv.${key}`) || fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(`eec-riscv.${key}`, value);
  } catch {
    /* The project works without persistent browser storage. */
  }
}
function initialLesson(): LessonId {
  const saved = read("lesson");
  return lessons.find((l) => l.id === saved)?.id || lessons[0].id;
}
function initialCompleted(): LessonId[] {
  try {
    return JSON.parse(read("completed", "[]")).filter((id: string) =>
      lessons.some((l) => l.id === id),
    );
  } catch {
    return [];
  }
}
function go(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
}
function download(filename: string, bytes: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SectionHeading({
  title,
  children,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
      </div>
      {children && <div className="section-heading-copy">{children}</div>}
    </div>
  );
}

function SignalView({ trace }: { trace: TraceSample[] }) {
  const samples = trace.slice(-56);
  if (!samples.length)
    return (
      <div className="panel-empty">
        <Icon name="signals" size={36} />
        <h4>Give the clock a little work.</h4>
        <p>
          Run or step your program to record real memory-bus and retirement
          signals.
        </p>
      </div>
    );
  return (
    <div className="signal-view">
      <p className="inspector-intro">
        The last {samples.length} clock cycles, recorded from the hardware
        model.
      </p>
      {(
        [
          ["mem_valid", "memValid"],
          ["mem_ready", "memReady"],
          ["mem_write", "memWrite"],
          ["retired", "retired"],
        ] as const
      ).map(([name, field]) => (
        <div className="signal-row" key={field}>
          <code>{name}</code>
          <svg
            viewBox={`0 0 ${samples.length * 10} 30`}
            role="img"
            aria-label={`${name} signal waveform`}
            preserveAspectRatio="none"
          >
            <path
              d={samples
                .map(
                  (s, i) =>
                    `${i === 0 ? "M" : "L"}${i * 10} ${s[field] ? 7 : 24}H${(i + 1) * 10}`,
                )
                .join(" ")}
            />
          </svg>
        </div>
      ))}
      <div className="signal-range">
        <span>cycle {samples[0].cycle}</span>
        <span>{samples.at(-1)?.cycle}</span>
      </div>
      <div className="trace-log">
        {samples
          .slice(-8)
          .reverse()
          .map((s) => (
            <div key={s.cycle}>
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
  const [lessonId, setLessonId] = useState<LessonId>(initialLesson);
  const lesson = lessons.find((l) => l.id === lessonId) || lessons[0];
  const lessonIndex = lessons.findIndex((l) => l.id === lesson.id);
  const [source, setSource] = useState(() => {
    const id = initialLesson();
    return read(`draft.${id}`, lessons.find((l) => l.id === id)!.source);
  });
  const [compiledSource, setCompiledSource] = useState("");
  const [loadedLesson, setLoadedLesson] = useState<LessonId | null>(null);
  const [image, setImage] = useState<number[] | null>(null);
  const [disassembly, setDisassembly] = useState<DisassemblyLine[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [completed, setCompleted] = useState<LessonId[]>(initialCompleted);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkFeedback, setCheckFeedback] = useState("");
  const [view, setView] = useState<View>("flow");
  const [speed, setSpeed] = useState(10000);
  const [memoryAddress, setMemoryAddress] = useState("0x00000000");
  const [camera, setCamera] = useState<CameraView>("perspective");
  const [labels, setLabels] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const [phase, setPhase] = useState<FlowPhase>("instruction");
  const [flowPlaying, setFlowPlaying] = useState(false);
  const [frozenRetirement, setFrozenRetirement] =
    useState<RetiredInstruction | null>(null);
  const [examplePhase, setExamplePhase] = useState<FlowPhase>("instruction");
  const [examplePlaying, setExamplePlaying] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const initialConnection = useRef(false);
  const compileGeneration = useRef(0);
  const currentSource = useRef(source);
  const currentLesson = useRef(lesson.id);
  const currentSnapshot = useRef(snapshot);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  currentSource.current = source;
  currentLesson.current = lesson.id;
  currentSnapshot.current = snapshot;
  const running = snapshot.status === "running";
  const dirty = source !== compiledSource;
  const ready = connected && !busy && image !== null;
  const executable =
    ready && !dirty && loadedLesson === lesson.id && !snapshot.halted;
  const verifiedNow =
    loadedLesson === lesson.id &&
    !dirty &&
    snapshot.retired > 0 &&
    checkLesson(lesson.id, snapshot);
  const activeLine = !dirty
    ? disassembly.find((line) => line.address === snapshot.pc)?.line
    : undefined;
  const shownRetirement = frozenRetirement || snapshot.lastRetired || null;
  const instructionText = shownRetirement
    ? disassembly.find((line) => line.address === shownRetirement.pc)?.text
    : undefined;

  useEffect(() => {
    save(`draft.${lesson.id}`, source);
  }, [source, lesson.id]);
  useEffect(() => {
    save("completed", JSON.stringify(completed));
  }, [completed]);
  useEffect(() => {
    if (verifiedNow)
      setCompleted((previous) =>
        previous.includes(lesson.id) ? previous : [...previous, lesson.id],
      );
  }, [verifiedNow, lesson.id]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        setSelectedPart(null);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useEffect(
    () => () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    },
    [],
  );

  const send = useCallback((command: Record<string, unknown>) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError(
        IS_LOCAL
          ? "The local hardware simulator is disconnected. Keep the server running and try again."
          : "The hardware simulator disconnected. We’re reconnecting automatically. Check your connection, then try again when the core is ready.",
      );
      return false;
    }
    socket.current.send(JSON.stringify(command));
    return true;
  }, []);

  const assemble = useCallback(
    async (text: string, id: LessonId) => {
      const generation = ++compileGeneration.current;
      setBusy(true);
      setError("");
      setCheckFeedback("");
      setDiagnostics([]);
      setFlowPlaying(false);
      setFrozenRetirement(null);
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(JSON.stringify({ type: "pause" }));
      try {
        const response = await fetch("/api/assemble", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: text }),
        });
        const result: AssemblyResult = await response.json();
        if (generation !== compileGeneration.current) return;
        if (!response.ok || !result.ok || !result.image) {
          setDiagnostics(result.diagnostics || []);
          setError(
            result.diagnostics?.[0]?.message ||
              result.message ||
              "Assembly failed. Check your source and try again.",
          );
          return;
        }
        setSnapshot(initialSnapshot);
        setImage(result.image);
        setDisassembly(result.disassembly || []);
        setCompiledSource(text);
        setLoadedLesson(id);
        setPhase("instruction");
        send({ type: "load", image: result.image });
        send({ type: "setInputs", value: 0 });
      } catch (failure) {
        if (generation === compileGeneration.current)
          setError(
            IS_LOCAL
              ? failure instanceof Error
                ? failure.message
                : "Could not reach the local assembler."
              : "Could not reach the assembler. Check your connection and try Assemble & load again.",
          );
      } finally {
        if (generation === compileGeneration.current) setBusy(false);
      }
    },
    [send],
  );

  useEffect(() => {
    let disposed = false;
    let reconnect: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (disposed) return;
      const channel = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/simulation`,
      );
      socket.current = channel;
      channel.onopen = () => {
        initialConnection.current = false;
      };
      channel.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "snapshot") {
            setSnapshot(message.snapshot);
            if (!initialConnection.current) {
              initialConnection.current = true;
              setConnected(true);
              setError("");
            }
          } else if (message.type === "error")
            setError(
              message.message || "The hardware simulator reported an error.",
            );
        } catch {
          setError(
            IS_LOCAL
              ? "An unreadable response arrived from the simulator. Restart the local server."
              : "The simulator sent an unreadable response. Refresh this page to reconnect. If it happens again, try again later.",
          );
        }
      };
      channel.onerror = () => {
        if (!disposed) setConnected(false);
      };
      channel.onclose = () => {
        if (!disposed) {
          setConnected(false);
          reconnect = setTimeout(connect, 2000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      socket.current?.close();
    };
  }, []);
  useEffect(() => {
    if (connected) void assemble(currentSource.current, currentLesson.current);
  }, [connected, assemble]);

  useEffect(() => {
    if (!flowPlaying) return;
    if (phase === "writeback") {
      setFlowPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setPhase(phases[phases.indexOf(phase) + 1]),
      1200,
    );
    return () => clearTimeout(timer);
  }, [phase, flowPlaying]);
  useEffect(() => {
    if (!examplePlaying) return;
    if (examplePhase === "writeback") {
      setExamplePlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setExamplePhase(phases[phases.indexOf(examplePhase) + 1]),
      1200,
    );
    return () => clearTimeout(timer);
  }, [examplePhase, examplePlaying]);

  function selectLesson(id: LessonId, starter = false) {
    const next = lessons.find((l) => l.id === id)!;
    const nextSource = starter ? next.source : read(`draft.${id}`, next.source);
    setLessonId(id);
    save("lesson", id);
    setSource(nextSource);
    setError("");
    setCheckFeedback("");
    setFrozenRetirement(null);
    setFlowPlaying(false);
    setPhase("instruction");
    setView(id === "add" ? "flow" : "board");
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulseActive(false);
    if (connected) void assemble(nextSource, id);
  }
  function runCommand(
    type: "run" | "pause" | "stepInstruction" | "stepCycle" | "reset",
  ) {
    setError("");
    setCheckFeedback("");
    setFlowPlaying(false);
    setFrozenRetirement(null);
    const clearPulse = (type === "pause" || type === "reset") && pulseActive;
    if (clearPulse || type === "reset") {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = null;
      setPulseActive(false);
    }
    send(type === "run" ? { type, speed, breakpoints: [] } : { type });
    if (type === "reset") send({ type: "setInputs", value: 0 });
    else if (clearPulse)
      send({ type: "setInputs", value: currentSnapshot.current.inputs & ~1 });
  }
  function pulseButton() {
    if (!running || pulseActive) return;
    setPulseActive(true);
    send({ type: "setInputs", value: currentSnapshot.current.inputs | 1 });
    const duration = Math.max(250, Math.ceil(128000 / speed));
    pulseTimer.current = setTimeout(() => {
      send({ type: "setInputs", value: currentSnapshot.current.inputs & ~1 });
      setPulseActive(false);
      pulseTimer.current = null;
    }, duration);
  }
  function verify() {
    if (verifiedNow) {
      setCheckFeedback(
        "Verified against the running hardware model. You’re ready for the next step.",
      );
      return;
    }
    setCheckFeedback(
      dirty
        ? "Assemble your changes first, then run the program and check its result."
        : `Not there yet. ${lesson.checkpoint}`,
    );
  }
  function replayFlow() {
    if (!shownRetirement) return;
    setFrozenRetirement(shownRetirement);
    setPhase("instruction");
    setFlowPlaying(true);
  }
  function playFlow() {
    if (flowPlaying) setFlowPlaying(false);
    else replayFlow();
  }
  function changePhase(next: FlowPhase) {
    if (shownRetirement) setFrozenRetirement(shownRetirement);
    setPhase(next);
    setFlowPlaying(false);
  }
  function exportProject() {
    if (!image) return;
    const readme = `# ManarEEC — ${lesson.title}\n\nThis is a simulation project for the original PicoRV32 RV32IM core.\n\n## Run it\n1. Start ManarEEC locally (npm start in its source directory).\n2. Open http://127.0.0.1:5174.\n3. Paste program.s into the editor, click Assemble & Load, then Run.\n4. For the counter, click Press button while the processor is running.\n\nprogram.bin is a raw little-endian RV32IM image loaded at address zero. It is firmware, not an FPGA bitstream.\n\n## Memory map\n0x00000000–0x0000ffff: 64 KiB RAM\n0x10000000: console character output\n0x10000004: eight output LED bits\n0x10000008: eight input switch bits\n\n## Expected result\n${lesson.expected}\n\n## How to build\n${lesson.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n## Sources\nEEC directory: ${DIRECTORY}\nPicoRV32: https://github.com/YosysHQ/picorv32\nVerilator: https://verilator.org/\nGNU Binutils: https://www.gnu.org/software/binutils/\n\nPhysical FPGA deployment additionally requires a board-specific top-level design, RTL RAM and peripherals, clock/reset design, pin constraints, synthesis, place-and-route, and a programmer.\n`;
    const archive = zipSync(
      {
        "program.s": strToU8(compiledSource),
        "program.bin": new Uint8Array(image),
        "README.md": strToU8(readme),
      },
      { level: 6 },
    );
    download(
      "eec-riscv-project.zip",
      new Uint8Array(archive).buffer,
      "application/zip",
    );
  }
  function tabKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % views.length
        : event.key === "ArrowLeft"
          ? (index + views.length - 1) % views.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? views.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setView(views[next].id);
    document.getElementById(`view-${views[next].id}`)?.focus();
  }
  const sceneProps = {
    camera,
    rotate: false,
    labels,
    exploded: false,
    cutaway,
    selectedPart,
    onSelectPart: setSelectedPart,
    leds: snapshot.leds,
    running,
    cpuState: snapshot.state,
    compact: true,
  };

  return (
    <>
      <a className="skip-link" href="#build">
        Skip to the guided project
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="eec-brand"
            href="#project"
            aria-label="ManarEEC — home"
          >
            <img src="/eec-logo.svg" alt="" />
            <strong>EEC</strong>
            <span>
              ManarEEC<small>نادي الهندسة الكهربائية</small>
            </span>
          </a>
          <nav
            aria-label="Main navigation"
            className={mobileNav ? "main-nav open" : "main-nav"}
          >
            {[
              ["project", "Project"],
              ["build", "Build"],
              ["understand", "How it works"],
              ["tools", "Tools"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={() => setMobileNav(false)}>
                {label}
              </a>
            ))}
          </nav>
          <a
            className="directory-link"
            href={DIRECTORY}
            target="_blank"
            rel="noreferrer"
          >
            Open hardware directory
            <Icon name="arrowUp" size={14} />
          </a>
          <button
            className="icon-button nav-toggle"
            aria-label="Toggle navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav((v) => !v)}
          >
            <Icon name={mobileNav ? "close" : "menu"} />
          </button>
        </div>
      </header>

      <main>
        <section className="project-hero section-wrap" id="project">
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>
                From an open core
                <br />{" "}
                to your first
                <br />{" "}
                <em>working project.</em>
              </h1>
              <p className="hero-lede">
                Build a button-controlled LED counter with the PicoRV32 core.
                Follow your code through a virtual board, see what each
                instruction does, and make it your own.
              </p>
              <div className="hero-actions">
                <button
                  className="button button-primary"
                  onClick={() => go("build")}
                >
                  Start building
                  <Icon name="arrow" size={17} />
                </button>
                <button className="text-link" onClick={() => go("understand")}>
                  <Icon name="chip" size={17} />
                  See inside the core
                </button>
              </div>
              <div className="hero-facts">
                <span>
                  <Icon name="flag" size={14} />4 guided steps
                </span>
                <span>
                  <Icon name="code" size={14} />
                  Open-source core
                </span>
                <span>
                  <Icon name="cube" size={14} />
                  No board needed
                </span>
              </div>
            </div>
            <div className="hero-instrument">
              <div className="instrument-top">
                <span
                  className={
                    connected ? "connection-status online" : "connection-status"
                  }
                >
                  <i />
                  {connected
                    ? IS_LOCAL
                      ? "Local core connected"
                      : "Hardware core connected"
                    : IS_LOCAL
                      ? "Connecting to core"
                      : "Reconnecting to hardware core…"}
                </span>
              </div>
              <div className="hero-board">
                <BoardScene
                  {...sceneProps}
                  camera="perspective"
                  labels={false}
                  cutaway={false}
                  selectedPart={null}
                  onSelectPart={() => go("build")}
                />
              </div>
              <div className="hero-leds">
                <div>
                  <span className="tiny-label">LED output</span>
                  <code>{snapshot.leds.toString(2).padStart(8, "0")}</code>
                </div>
                <div
                  className="mini-led-bank"
                  aria-label={`Live output ${snapshot.leds.toString(2).padStart(8, "0")}`}
                >
                  {Array.from({ length: 8 }, (_, i) => (
                    <i
                      key={i}
                      className={snapshot.leds & (1 << (7 - i)) ? "lit" : ""}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="continuation-bar">
            <div className="continuation-icon">
              <Icon name="book" size={21} />
            </div>
            <p>
              <strong>You found the tools. Here’s how to use them.</strong>
              <span>
                A hands-on companion to the EEC open hardware directory, focused
                on one complete RISC-V project.
              </span>
            </p>
            <a
              href={`${DIRECTORY}#t-picorv32`}
              target="_blank"
              rel="noreferrer"
            >
              View PicoRV32 in the directory
              <Icon name="arrowUp" size={15} />
            </a>
          </div>
        </section>

        <section
          className="project-overview section-wrap"
          aria-labelledby="overview-title"
        >
          <div className="overview-heading">
            <h2 id="overview-title">
              One button.
              <br />
              Eight LEDs. <em>Your code.</em>
            </h2>
            <p>
              Every press adds one to an eight-bit counter. The processor reads
              the input, updates a register, and writes the new value to the
              LEDs.
            </p>
          </div>
          <div className="outcome-path">
            <div>
              <span className="outcome-icon">
                <Icon name="switches" size={27} />
              </span>
              <strong>Press a button</strong>
              <small>The input becomes a bit</small>
            </div>
            <i />
            <div>
              <span className="outcome-icon processor-mark-host">
                <ProcessorMark size={80} />
              </span>
              <strong>The core does the work</strong>
              <small>Read → add → write</small>
            </div>
            <i />
            <div>
              <span className="outcome-icon led-symbol">
                <i />
                <i />
                <i />
                <i />
              </span>
              <strong>See the result</strong>
              <small>Binary becomes light</small>
            </div>
          </div>
          <div className="project-requirements">
            <span>
              <Icon name="check" size={14} />A modern browser
            </span>
            <span>
              <Icon name="check" size={14} />
              {IS_LOCAL ? "A running local simulator" : "An internet connection"}
            </span>
            <span>
              <Icon name="check" size={14} />A little curiosity
            </span>
            <span className="requirements-note">
              Start with zero assembly experience.
            </span>
          </div>
        </section>

        <section className="build-section section-wrap" id="build">
          <SectionHeading
            title={
              <>
                A small project.
                <br />
                <em>Everything explained.</em>
              </>
            }
          >
            <p>
              Each step gives you a goal, the code to try, and a result you can
              check. The same original PicoRV32 core runs every program.
            </p>
            <span className="section-note">
              <span className="signal-dot" />
              {completed.length} of {lessons.length} steps completed
            </span>
          </SectionHeading>
          <div className="guided-workspace" ref={workspace}>
            <div className="workspace-heading">
              <div>
                <span className="workspace-symbol">
                  <Icon name="code" size={19} />
                </span>
                <div>
                  <strong>Button-controlled LED counter</strong>
                </div>
              </div>
              <button
                className="button button-outline small"
                disabled={!image || busy || dirty}
                onClick={exportProject}
              >
                <Icon name="download" size={14} />
                Download project
              </button>
            </div>
            <div className="workspace-grid">
              <aside className="lesson-sidebar">
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Project progress"
                  aria-valuemin={0}
                  aria-valuemax={lessons.length}
                  aria-valuenow={completed.length}
                >
                  <span
                    style={{
                      width: `${(completed.length / lessons.length) * 100}%`,
                    }}
                  />
                </div>
                <ol>
                  {lessons.map((item, i) => (
                    <li key={item.id}>
                      <button
                        onClick={() => selectLesson(item.id)}
                        className={item.id === lesson.id ? "active" : ""}
                        aria-current={
                          item.id === lesson.id ? "step" : undefined
                        }
                      >
                        <span
                          className={`lesson-marker ${completed.includes(item.id) ? "complete" : ""}`}
                        >
                          {completed.includes(item.id) ? (
                            <Icon name="check" size={14} />
                          ) : (
                            item.number
                          )}
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                        </span>
                        {item.id === lesson.id && (
                          <Icon name="chevron" size={12} />
                        )}
                      </button>
                      {i !== lessons.length - 1 && (
                        <span className="lesson-connector" />
                      )}
                    </li>
                  ))}
                </ol>
                <a
                  className="old-lab-link"
                  href={IS_LOCAL ? OLD_LAB : `${REPOSITORY}#readme`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {IS_LOCAL ? "Open the original CPU lab" : "Local setup guide"}
                  <Icon name="arrowUp" size={13} />
                </a>
              </aside>

              <div className="lesson-main">
                <div className="lesson-intro">
                  <div className="lesson-title">
                    <h3>{lesson.title}</h3>
                    {completed.includes(lesson.id) && (
                      <span className="completed-badge">
                        <Icon name="check" size={12} />
                        Completed
                      </span>
                    )}
                  </div>
                  <p>{lesson.aim}</p>
                  <details className="why-panel">
                    <summary>
                      <Icon name="book" size={14} />
                      Why this matters
                      <Icon name="chevron" size={13} />
                    </summary>
                    <p>{lesson.why}</p>
                  </details>
                  <ol className="task-list">
                    {lesson.steps.map((step, i) => (
                      <li key={step}>
                        <span>{i + 1}</span>
                        <p>{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="editor-shell">
                  <div className="editor-heading">
                    <span>
                      <Icon name="code" size={14} />
                      program.s
                    </span>
                    <span
                      className={dirty ? "draft-status dirty" : "draft-status"}
                    >
                      {busy
                        ? "Assembling…"
                        : dirty
                          ? "Unassembled changes"
                          : "Ready"}
                    </span>
                  </div>
                  <AssemblyEditor
                    value={source}
                    onChange={setSource}
                    activeLine={activeLine}
                    diagnostics={diagnostics}
                  />
                  <div className="editor-actions">
                    <button
                      className="button button-primary small"
                      onClick={() => void assemble(source, lesson.id)}
                      disabled={!connected || busy}
                    >
                      <Icon
                        name={busy ? "rotate" : "bolt"}
                        className={busy ? "spin" : ""}
                        size={14}
                      />
                      {busy ? "Assembling…" : "Assemble & load"}
                    </button>
                    <button
                      className="icon-button"
                      title="Download assembly source"
                      aria-label="Download assembly source"
                      onClick={() =>
                        download("program.s", source, "text/plain")
                      }
                    >
                      <Icon name="download" size={16} />
                    </button>
                    <button
                      className="text-link reset-source"
                      onClick={() => selectLesson(lesson.id, true)}
                    >
                      Restore starter
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="error-banner" role="alert">
                    <Icon name="alert" size={17} />
                    <span>{error}</span>
                    <button
                      className="icon-button"
                      aria-label="Dismiss error"
                      onClick={() => setError("")}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
                <div className="lesson-tip">
                  <Icon name="info" size={16} />
                  <p>{lesson.tip}</p>
                </div>
                <div className={`checkpoint ${verifiedNow ? "verified" : ""}`}>
                  <p>{lesson.expected}</p>
                  <button
                    className="button button-outline small"
                    disabled={!ready || dirty || loadedLesson !== lesson.id}
                    onClick={verify}
                  >
                    {verifiedNow ? (
                      <>
                        <Icon name="check" size={14} />
                        Result verified
                      </>
                    ) : (
                      <>
                        Check my result
                        <Icon name="arrow" size={14} />
                      </>
                    )}
                  </button>
                  {checkFeedback && (
                    <div className="checkpoint-feedback" role="status">
                      {checkFeedback}
                    </div>
                  )}
                  {verifiedNow && lessonIndex < lessons.length - 1 && (
                    <button
                      className="next-lesson"
                      onClick={() => selectLesson(lessons[lessonIndex + 1].id)}
                    >
                      Continue to step {lessons[lessonIndex + 1].number}
                      <Icon name="arrow" size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="live-workspace">
                <div className="execution-toolbar">
                  <div
                    className={`core-status ${connected ? "connected" : ""}`}
                  >
                    <i />
                    {!connected
                      ? IS_LOCAL
                        ? "Connecting"
                        : "Reconnecting"
                      : running
                        ? "Running"
                        : snapshot.halted
                          ? "Stopped"
                          : "Ready"}
                  </div>
                  <div className="execution-buttons">
                    <button
                      className="run-button"
                      disabled={running ? !connected : !executable}
                      onClick={() => runCommand(running ? "pause" : "run")}
                    >
                      <Icon name={running ? "pause" : "play"} size={14} />
                      {running ? "Pause" : "Run"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Step one instruction"
                      title="Execute one complete instruction"
                      disabled={!executable || running}
                      onClick={() => runCommand("stepInstruction")}
                    >
                      <Icon name="step" size={17} />
                      <span>Instruction</span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Step one clock cycle"
                      title="Advance one CPU clock"
                      disabled={!executable || running}
                      onClick={() => runCommand("stepCycle")}
                    >
                      <Icon name="clock" size={17} />
                      <span>Cycle</span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Reset processor"
                      title="Restore the loaded program"
                      disabled={!ready}
                      onClick={() => runCommand("reset")}
                    >
                      <Icon name="reset" size={17} />
                    </button>
                  </div>
                </div>
                <div
                  className="viewer-tabs"
                  role="tablist"
                  aria-label="Hardware views"
                >
                  {views.map((item, index) => (
                    <button
                      key={item.id}
                      id={`view-${item.id}`}
                      role="tab"
                      aria-selected={view === item.id}
                      aria-controls={`panel-${item.id}`}
                      tabIndex={view === item.id ? 0 : -1}
                      onClick={() => setView(item.id)}
                      onKeyDown={(event) => tabKey(event, index)}
                    >
                      <Icon name={item.icon} size={14} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
                <div
                  className={`hardware-view hardware-view-${view}`}
                  role="tabpanel"
                  id={`panel-${view}`}
                  aria-labelledby={`view-${view}`}
                  tabIndex={0}
                >
                  {view === "flow" && (
                    <InstructionFlow
                      retirement={shownRetirement}
                      phase={phase}
                      onPhaseChange={changePhase}
                      playing={flowPlaying}
                      onPlay={playFlow}
                      onReplay={replayFlow}
                      instructionText={instructionText}
                      compact
                    />
                  )}
                  {view === "board" && (
                    <>
                      <div className="board-view">
                        <BoardScene {...sceneProps} />
                        <div className="board-view-controls">
                          <button
                            className={
                              camera === "perspective" ? "selected" : ""
                            }
                            aria-pressed={camera === "perspective"}
                            onClick={() => {
                              setCamera("perspective");
                              setSelectedPart(null);
                            }}
                          >
                            3/4
                          </button>
                          <button
                            className={camera === "top" ? "selected" : ""}
                            aria-pressed={camera === "top"}
                            onClick={() => {
                              setCamera("top");
                              setSelectedPart(null);
                            }}
                          >
                            Top
                          </button>
                          <button
                            className={labels ? "selected" : ""}
                            aria-pressed={labels}
                            onClick={() => setLabels((v) => !v)}
                          >
                            Labels
                          </button>
                          <button
                            className={cutaway ? "selected" : ""}
                            aria-pressed={cutaway}
                            onClick={() => setCutaway((v) => !v)}
                          >
                            Cutaway
                          </button>
                        </div>
                      </div>
                      {selectedPart && boardParts[selectedPart] && (
                        <div className="selected-part">
                          <strong>{boardParts[selectedPart].name}</strong>
                          <button
                            className="icon-button"
                            aria-label="Close part information"
                            onClick={() => setSelectedPart(null)}
                          >
                            <Icon name="close" size={13} />
                          </button>
                          <p>{boardParts[selectedPart].text}</p>
                        </div>
                      )}
                    </>
                  )}
                  {view === "registers" && (
                    <div className="register-view">
                      <div className="pc-line">
                        <span>PROGRAM COUNTER</span>
                        <code>{hex(snapshot.pc)}</code>
                      </div>
                      <div className="register-grid">
                        {snapshot.regs.map((value, i) => (
                          <div
                            key={i}
                            className={
                              shownRetirement?.rd === i && i !== 0
                                ? "register-changed"
                                : ""
                            }
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
                        x0 reads zero. x2 initializes to 0x00010000.
                      </p>
                    </div>
                  )}
                  {view === "memory" && (
                    <div className="memory-view">
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (
                            !/^(?:0x)?[0-9a-f]{1,8}$/i.test(memoryAddress) ||
                            Number.parseInt(
                              memoryAddress.replace(/^0x/i, ""),
                              16,
                            ) > 65532
                          ) {
                            setError(
                              "Enter a hexadecimal RAM address from 0x00000000 to 0x0000fffc.",
                            );
                            return;
                          }
                          setError("");
                          send({
                            type: "readMemory",
                            address:
                              Number.parseInt(
                                memoryAddress.replace(/^0x/i, ""),
                                16,
                              ) & ~3,
                          });
                        }}
                      >
                        <label htmlFor="ram-address">START ADDRESS</label>
                        <div>
                          <input
                            id="ram-address"
                            value={memoryAddress}
                            maxLength={10}
                            onChange={(event) =>
                              setMemoryAddress(event.target.value)
                            }
                            spellCheck={false}
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
                        <div className="memory-table-heading">
                          <span>ADDRESS</span>
                          <span>32-BIT WORD</span>
                        </div>
                        {snapshot.memory.map((word) => (
                          <div key={word.address}>
                            <code>{hex(word.address)}</code>
                            <code>{hex(word.value)}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {view === "signals" && <SignalView trace={snapshot.trace} />}
                </div>
                <div className="cpu-stats">
                  <div>
                    <span>CLOCK CYCLES</span>
                    <strong>{snapshot.cycle.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>RETIRED</span>
                    <strong>{snapshot.retired.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>CONTROL STATE</span>
                    <code>{snapshot.state.replaceAll("_", " ")}</code>
                  </div>
                </div>
                <div className="live-io">
                  <div className="led-output">
                    <div>
                      <span className="tiny-label">Output LEDs</span>
                      <code>0x10000004</code>
                    </div>
                    <div
                      className="led-bank"
                      aria-label={`Output LEDs: ${snapshot.leds.toString(2).padStart(8, "0")}`}
                    >
                      {Array.from({ length: 8 }, (_, i) => 7 - i).map((bit) => (
                        <div
                          className={snapshot.leds & (1 << bit) ? "lit" : ""}
                          key={bit}
                        >
                          <i />
                          <span>{bit}</span>
                        </div>
                      ))}
                    </div>
                    <strong className="decimal-output">{snapshot.leds}</strong>
                  </div>
                  <div className="input-row">
                    <div>
                      <span className="tiny-label">Input switches</span>
                      <code>0x10000008</code>
                    </div>
                    <div className="input-switches">
                      {Array.from({ length: 8 }, (_, i) => 7 - i).map((bit) => (
                        <button
                          key={bit}
                          aria-label={`Input switch ${bit}`}
                          aria-pressed={!!(snapshot.inputs & (1 << bit))}
                          disabled={!ready || pulseActive}
                          onClick={() =>
                            send({
                              type: "setInputs",
                              value: snapshot.inputs ^ (1 << bit),
                            })
                          }
                        >
                          <i />
                          <span>{bit}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="button-input">
                    <button
                      className={
                        pulseActive
                          ? "hardware-button pressed"
                          : "hardware-button"
                      }
                      disabled={!running || pulseActive}
                      onClick={pulseButton}
                    >
                      <span />
                      <strong>
                        {pulseActive ? "Pressed" : "Press button"}
                      </strong>
                      <kbd>BIT 0</kbd>
                    </button>
                    <p>
                      {pulseActive && speed < 1000
                        ? "A slower clock needs a longer input pulse. Pause or Reset releases the button."
                        : lesson.id === "counter"
                          ? "Run the counter, then press. Each new press adds one."
                          : "The button pulses input bit 0. Run a polling program to read it."}
                    </p>
                  </div>
                </div>
                {snapshot.message && (
                  <div
                    className={
                      snapshot.status === "error"
                        ? "simulation-message is-error"
                        : "simulation-message"
                    }
                    role="status"
                  >
                    <Icon
                      name={snapshot.status === "error" ? "alert" : "info"}
                      size={13}
                    />
                    {snapshot.message}
                  </div>
                )}
                <div className="speed-row">
                  <span>
                    <Icon name="clock" size={13} />
                    Simulation speed
                  </span>
                  <label>
                    <span className="sr-only">
                      Simulation speed in cycles per second
                    </span>
                    <select
                      value={speed}
                      disabled={pulseActive}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSpeed(value);
                        if (running)
                          send({ type: "run", speed: value, breakpoints: [] });
                      }}
                    >
                      {[10, 100, 1000, 10000].map((value) => (
                        <option value={value} key={value}>
                          {value.toLocaleString()} cycles/s
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>
          {completed.length === lessons.length && (
            <div className="completion-banner">
              <span>
                <Icon name="check" size={26} />
              </span>
              <div>
                <h3>You built it. Now make it yours.</h3>
                <p>
                  You’ve read inputs, changed a register, and driven real
                  simulated outputs. Try changing <code>addi s0, s0, 1</code> to{" "}
                  <code>addi s0, s0, -1</code> in the counter. What will the
                  first press show?
                </p>
              </div>
              <button
                className="button button-primary"
                onClick={() => selectLesson("counter")}
              >
                Back to your counter
                <Icon name="arrow" size={15} />
              </button>
            </div>
          )}
        </section>

        <section className="understand-section section-wrap" id="understand">
          <SectionHeading
            title={
              <>
                Watch one instruction
                <br />
                <em>make something happen.</em>
              </>
            }
          >
            <p>
              <code>add t2, t0, t1</code> means: read two registers, add their
              values, and store the answer. Follow the four parts of that
              journey.
            </p>
          </SectionHeading>
          <div className="example-flow">
            <InstructionFlow
              retirement={exampleRetirement}
              phase={examplePhase}
              onPhaseChange={(next) => {
                setExamplePhase(next);
                setExamplePlaying(false);
              }}
              playing={examplePlaying}
              onPlay={() => {
                if (examplePlaying) setExamplePlaying(false);
                else {
                  setExamplePhase("instruction");
                  setExamplePlaying(true);
                }
              }}
              onReplay={() => {
                setExamplePhase("instruction");
                setExamplePlaying(true);
              }}
              instructionText="add t2, t0, t1"
              example
            />
          </div>
          <div className="multicycle-note">
            <Icon name="clock" size={22} />
            <p>
              <strong>One instruction, several clock cycles.</strong>
              PicoRV32 reuses its hardware over several clock cycles. This
              replay explains one instruction’s data flow. The workbench’s Cycle
              control shows the actual hardware states.
            </p>
          </div>
          <div className="concept-cards">
            <article>
              <h3>RISC-V is the instruction set.</h3>
              <p>
                It defines the operations a program can ask a processor to
                perform. Assembly is the readable form of those instructions.
              </p>
              <code>add t2, t0, t1</code>
            </article>
            <article>
              <h3>PicoRV32 is the core.</h3>
              <p>
                It is an open Verilog implementation of a RISC-V CPU. Verilator
                runs that original hardware description in this lab.
              </p>
              <code>Verilog → model → execution</code>
            </article>
            <article>
              <h3>An address can be a device.</h3>
              <p>
                A store to the output address sets LED bits. A load from the
                input address reads the switches. That is memory-mapped I/O.
              </p>
              <code>sw t1, 0(t0)</code>
            </article>
          </div>
          <details className="controls-reference">
            <summary>
              <span>
                <Icon name="book" size={17} />
                What does each control do?
              </span>
              <Icon name="chevron" size={16} />
            </summary>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Code editor", "Write and edit RISC-V assembly."],
                    [
                      "Assemble & load",
                      "Use GNU tools to convert source into machine instructions and load RAM.",
                    ],
                    [
                      "Virtual board",
                      "Explore an illustrative system containing the original simulated PicoRV32 core.",
                    ],
                    [
                      "Run / Pause",
                      "Execute continuously or stop at the current hardware state.",
                    ],
                    [
                      "Instruction",
                      "Advance until one instruction retires or the core stops.",
                    ],
                    [
                      "Cycle",
                      "Advance the actual hardware model by one clock.",
                    ],
                    [
                      "Registers",
                      "Inspect all 32 integer registers and the program counter.",
                    ],
                    ["Memory", "Read the shared instruction and data RAM."],
                    ["LEDs", "See the program’s memory-mapped output bits."],
                    [
                      "Input switches",
                      "Set the bits a running program can read.",
                    ],
                    [
                      "Trace replay",
                      "Explain the recorded operands and result of one retired instruction.",
                    ],
                  ].map(([name, description]) => (
                    <tr key={name}>
                      <th scope="row">{name}</th>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="tools-section section-wrap" id="tools">
          <SectionHeading
            title={
              <>
                The directory,
                <br />
                <em>put to work.</em>
              </>
            }
          >
            <p>
              The EEC directory organizes the open hardware ecosystem. This
              project gives a few of those tools a specific job, then shows
              where you can go next.
            </p>
            <a
              className="text-link"
              href={DIRECTORY}
              target="_blank"
              rel="noreferrer"
            >
              Explore the complete EEC directory
              <Icon name="arrowUp" size={15} />
            </a>
          </SectionHeading>
          <div className="tool-grid">
            {tools.map((tool) => (
              <article
                className={`tool-card ${tool.used ? "used" : ""}`}
                key={tool.id}
              >
                <div className="tool-card-heading">
                  <Icon
                    name={
                      tool.id === "picorv32"
                        ? "chip"
                        : tool.id === "verilator"
                          ? "signals"
                          : tool.id === "yosys"
                            ? "layers"
                            : tool.id === "nextpnr"
                              ? "cube"
                              : "code"
                    }
                    size={23}
                  />
                  <span>
                    {tool.used ? "In this project" : "For a future FPGA build"}
                  </span>
                </div>
                <h3>{tool.name}</h3>
                <p>{tool.description}</p>
                <div>
                  <a href={tool.url} target="_blank" rel="noreferrer">
                    Project source
                    <Icon name="arrowUp" size={13} />
                  </a>
                  {tool.directoryUrl && (
                    <a
                      href={tool.directoryUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tool.id === "binutils" ? "Documentation" : "EEC entry"}
                      <Icon name="arrowUp" size={13} />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="directory-explained">
            <div>
              <h3>The EEC directory maps open hardware.</h3>
              <p>
                The directory brings together 323 tools and designs in five main
                sections: process design kits (PDKs), compilers, design tools,
                verification, and hardware designs. You can search, filter by
                topic, save favorites, and follow the RTL-to-GDSII design path.
              </p>
            </div>
            <div>
              <h3>This playground guides a complete project.</h3>
              <p>
                One selected core, a concrete goal, guided instructions, a
                working environment, visual explanations, and checks on the
                result. The directory helps you discover; the playground helps
                you put it into practice.
              </p>
            </div>
          </div>
        </section>

        <section className="next-section section-wrap" id="next">
          <div className="next-heading">
            <h2>
              From a virtual system
              <br />
              <em>toward real hardware.</em>
            </h2>
            <p>
              You’ve built the firmware and understood the flow. Putting it on
              an FPGA is a separate, board-specific hardware project.
            </p>
          </div>
          <ol className="hardware-path">
            <li>
              <span>01</span>
              <div>
                <h3>Choose your FPGA board.</h3>
                <p>
                  Check its device family, clock, reset, LED pins, button
                  wiring, and programming method.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Build the surrounding hardware.</h3>
                <p>
                  Connect PicoRV32 to RTL RAM and I/O registers. Recreate the
                  memory map, synchronize the button, and debounce the physical
                  input.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Synthesize, place, and route.</h3>
                <p>
                  Use a supported toolchain such as Yosys and nextpnr, with
                  constraints for your exact device and board.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Program and test the board.</h3>
                <p>
                  Generate the FPGA bitstream and load it using the board’s
                  supported programmer. The downloaded <code>.bin</code> here is
                  CPU firmware, not that bitstream.
                </p>
              </div>
            </li>
          </ol>
          <div className="next-resources">
            <a
              href="https://github.com/YosysHQ/picorv32/tree/main/picosoc"
              target="_blank"
              rel="noreferrer"
            >
              Explore the upstream PicoSoC example
              <Icon name="arrowUp" size={16} />
            </a>
            <a href={`${DIRECTORY}#t-yosys`} target="_blank" rel="noreferrer">
              Find the next tool in the EEC directory
              <Icon name="arrowUp" size={16} />
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer section-wrap">
        <div className="footer-top">
          <a
            className="eec-brand"
            href="#project"
            aria-label="ManarEEC — back to top"
          >
            <img src="/eec-logo.svg" alt="" />
            <strong>EEC</strong>
            <span>ManarEEC</span>
          </a>
          <nav aria-label="Related websites">
            <a href={DIRECTORY} target="_blank" rel="noreferrer">
              EEC directory
              <Icon name="arrowUp" size={12} />
            </a>
            <a href={REPOSITORY} target="_blank" rel="noreferrer">
              Source on GitHub
              <Icon name="arrowUp" size={12} />
            </a>
            {IS_LOCAL && (
              <a href={OLD_LAB} target="_blank" rel="noreferrer">
                Original CPU lab
                <Icon name="arrowUp" size={12} />
              </a>
            )}
            <a
              href="https://github.com/YosysHQ/picorv32"
              target="_blank"
              rel="noreferrer"
            >
              PicoRV32 source
              <Icon name="arrowUp" size={12} />
            </a>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>
            A learning companion using EEC’s original logo and colors.
          </span>
        </div>
      </footer>
    </>
  );
}

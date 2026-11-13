import { useId, type ReactNode } from "react";
import type {
  FlowPhase,
  InstructionFlowProps,
  RetiredInstruction,
} from "./types";
import {
  boxCorners,
  corners,
  cylinder,
  fitProjection,
  haloOf,
  insetPlan,
  iso,
  lineOnTop,
  pathOf,
  planOutline,
  slabOf as buildSlab,
  type Plan,
  type SolidPaths,
} from "./iso/iso-kit";
import {
  exampleRetirement,
  explainRetirement,
  hex,
  word,
} from "./instruction-model";
export { exampleRetirement, explainRetirement } from "./instruction-model";
import "./instruction-flow.css";

const PHASES: FlowPhase[] = ["instruction", "registers", "alu", "writeback"];
const LABELS = [
  "Instruction memory",
  "Register file",
  "ALU / memory",
  "Write back",
];
// The figure is one mounted processor backplane: plate, four feet, corner screws,
// four sockets, four packages, 64 socket contacts, 32 register cells, six memory
// slots, bus terminals, three etched buses, three pin banks, and a writeback latch.
const WIDTH = 800;
const HEIGHT = 260;
const BASE: Plan = { x: 0, y: 0, w: 670, d: 156, r: 12 };
const P = fitProjection(boxCorners(BASE, -15, 36), WIDTH, HEIGHT, {
  pad: 32,
  azimuth: 78,
  elevation: 36,
});
const slabPaths = new Map<string, SolidPaths>();
// The camera and part dimensions stay fixed while live trace values change.
function slabOf(...args: Parameters<typeof buildSlab>): SolidPaths {
  const [plan, z, height, , steps = 8, bevel = 0] = args;
  const key = [
    plan.x,
    plan.y,
    plan.w,
    plan.d,
    plan.r,
    z,
    height,
    steps,
    bevel,
  ].join(",");
  const cached = slabPaths.get(key);
  if (cached) return cached;
  const paths = buildSlab(...args);
  slabPaths.set(key, paths);
  return paths;
}
const MODULES = [0, 1, 2, 3].map((i) => ({
  x: 24 + i * 158,
  y: 28,
  w: 146,
  d: 106,
  r: 6,
}));
const BASE_PATH = slabOf(BASE, -8, 8, P, 6, 1.2);
const BASE_GROOVE = planOutline(insetPlan(BASE, 6), 0.1, P, 6);
const SCREWS = corners(BASE, 13).map(([x, y]) => ({
  face: cylinder(x, y, 2.3, 0.2, 0.9, P, 16, 0.25),
  at: iso([x, y, 1.1], P),
}));
const FEET = corners(BASE, 20)
  .sort((a, b) => a[1] - b[1])
  .map(([x, y]) => cylinder(x, y, 6.5, -14, 6, P, 20, 0.8));

function Solid({
  paths,
  className = "",
  children,
}: {
  paths: SolidPaths;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <g className={`flow-solid ${className}`}>
      <path className="flow-solid-fill" d={paths.fill} />
      {paths.shades.map((d, i) =>
        d ? <path key={i} className={`flow-shade shade-${i}`} d={d} /> : null,
      )}
      <path className="flow-solid-top" d={paths.top} />
      <path className="flow-bevel" d={paths.bevel} />
      <path className="flow-edge" d={paths.outline} />
      {children}
    </g>
  );
}

function Module({
  index,
  active,
  record,
}: {
  index: number;
  active: boolean;
  record: RetiredInstruction | null;
}) {
  const plan = MODULES[index];
  const die = insetPlan(plan, 13);
  const memoryRows = Array.from({ length: 6 }, (_, i) => ({
    x: die.x + 12,
    y: die.y + 10 + i * 9,
    w: die.w - 24,
    d: 5.5,
    r: 1.1,
  }));
  return (
    <g
      className={`flow-module ${active ? "is-active" : ""}`}
      data-flow-module={PHASES[index]}
    >
      <Solid paths={slabOf(plan, 0, 5, P, 5, 0.8)} className="flow-socket" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} className="flow-contact-bank">
          <Solid
            paths={slabOf(
              { x: plan.x + 16 + i * 15.2, y: plan.y - 4, w: 6, d: 10, r: 0.7 },
              1,
              2,
              P,
              2,
              0.2,
            )}
            className="flow-contact"
          />
          <Solid
            paths={slabOf(
              {
                x: plan.x + 16 + i * 15.2,
                y: plan.y + plan.d - 6,
                w: 6,
                d: 10,
                r: 0.7,
              },
              1,
              2,
              P,
              2,
              0.2,
            )}
            className="flow-contact"
          />
        </g>
      ))}
      <Solid paths={slabOf(die, 5, 16, P, 5, 1)} className="flow-package" />
      <path
        className="flow-package-inset"
        d={planOutline(insetPlan(die, 5), 21.2, P, 5)}
      />
      {index === 0 &&
        memoryRows.map((row, i) => (
          <Solid
            key={i}
            paths={slabOf(row, 21.3, 0.6, P, 3)}
            className={`flow-memory-slot ${i === 2 ? "selected" : ""}`}
          />
        ))}
      {index === 1 &&
        Array.from({ length: 32 }, (_, i) => (
          <Solid
            key={i}
            paths={slabOf(
              {
                x: die.x + 10 + (i % 8) * 11.5,
                y: die.y + 11 + Math.floor(i / 8) * 13.4,
                w: 8.4,
                d: 9,
                r: 1,
              },
              21.3,
              0.65,
              P,
              2,
            )}
            className={`flow-register-cell ${record && (i === record.rs1 || i === record.rs2) ? "is-read" : ""}`}
          />
        ))}
      {index === 2 && (
        <>
          <path
            className="flow-gate"
            d={pathOf(
              [
                [die.x + 19, die.y + 13],
                [die.x + 44, die.y + 27],
                [die.x + 68, die.y + 13],
                [die.x + 94, die.y + 13],
                [die.x + 72, die.y + 59],
                [die.x + 41, die.y + 59],
              ].map(([x, y]) => iso([x, y, 21.5], P)),
              true,
            )}
          />
          <path
            className="flow-gate-mark"
            d={
              lineOnTop(
                [die.x + 46, die.y + 37],
                [die.x + 68, die.y + 37],
                21.8,
                P,
              ) +
              lineOnTop(
                [die.x + 57, die.y + 27],
                [die.x + 57, die.y + 47],
                21.8,
                P,
              )
            }
          />
        </>
      )}
      {index === 3 && (
        <>
          <Solid
            paths={slabOf(
              { x: die.x + 18, y: die.y + 16, w: die.w - 36, d: 40, r: 4 },
              21.3,
              1.4,
              P,
              5,
              0.5,
            )}
            className="flow-latch"
          />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              className="flow-latch-bit"
              d={lineOnTop(
                [die.x + 25 + i * 8, die.y + 22],
                [die.x + 25 + i * 8, die.y + 50],
                23,
                P,
              )}
            />
          ))}
        </>
      )}
      <circle
        className="flow-package-dot"
        cx={iso([die.x + 6, die.y + 6, 21.5], P)[0]}
        cy={iso([die.x + 6, die.y + 6, 21.5], P)[1]}
        r="1.7"
      />
    </g>
  );
}

function FlowArrow({
  index,
  active,
  playing,
}: {
  index: number;
  active: boolean;
  playing: boolean;
}) {
  const left = MODULES[index],
    right = MODULES[index + 1];
  const a = iso([left.x + left.w + 1, left.y + 52, 2.1], P);
  const b = iso([right.x - 1, right.y + 52, 2.1], P);
  return (
    <g
      className={`flow-bus ${active ? "is-active" : ""} ${playing ? "is-moving" : ""}`}
    >
      <path d={pathOf([a, b])} />
      <path className="flow-bus-pulse" d={pathOf([a, b])} />
      <circle cx={a[0]} cy={a[1]} r="2.3" />
      <circle cx={b[0]} cy={b[1]} r="2.3" />
    </g>
  );
}

export default function InstructionFlow({
  retirement,
  phase,
  onPhaseChange,
  playing,
  onPlay,
  onReplay,
  instructionText,
  example = false,
  compact = false,
}: InstructionFlowProps) {
  const filterId = `flow-floor-${useId().replace(/:/g, "")}`;
  const record = retirement ?? (example ? exampleRetirement : null);
  const details = record ? explainRetirement(record) : null;
  const phaseIndex = PHASES.indexOf(phase);
  const values = [
    instructionText ||
      (example
        ? "add t2, t0, t1"
        : record
          ? hex(record.instruction)
          : "No completed instruction"),
    details
      ? `${details.operandA.value}  /  ${details.operandB.value}`
      : "N/A / N/A",
    details?.equation ?? "Not available",
    details
      ? `${details.resultLabel.split(" · ")[0]} = ${details.resultValue}`
      : "Not available",
  ];
  const captions =
    record && details
      ? [
          `Instruction word ${hex(record.instruction)} at address ${hex(record.pc)}.`,
          `${details.operandA.label}: ${details.operandA.value}. ${details.operandB.label}: ${details.operandB.value}.`,
          `${details.operation}: ${details.equation}. The result comes from the recorded processor trace.`,
          details.finalDetail,
        ]
      : [
          "Run or step the processor to inspect a completed instruction.",
          "Source operands appear here after an instruction completes.",
          "This step shows arithmetic, memory access, or control flow for the selected instruction.",
          "Register writes, stores, and next-PC values come from the RVFI trace.",
        ];
  return (
    <figure
      className={`instruction-flow${compact ? " instruction-flow--compact" : ""}`}
      aria-label="Instruction execution explanation"
    >
      <div className="flow-card-head">
        <h3>Instruction data flow</h3>
        <span className={`flow-trace-status ${record ? "has-trace" : ""}`}>
          <i />
          {example
            ? "Example · 7 + 35 → 42"
            : record
              ? `Trace #${record.order}`
              : "Run a program to begin"}
        </span>
      </div>
      <div className="flow-art-wrap">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={
            record && details
              ? `${values[0]}. ${details.equation}. ${details.resultLabel}: ${details.resultValue}.`
              : "A processor backplane with instruction memory, a register file, arithmetic logic, and a writeback latch."
          }
        >
          <defs>
            <filter id={filterId}>
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <path
            className="flow-floor-shadow"
            filter={`url(#${filterId})`}
            d={haloOf(BASE, -14, 10, P)}
          />
          {FEET.map((paths, i) => (
            <Solid key={i} paths={paths} className="flow-foot" />
          ))}
          <Solid paths={BASE_PATH} className="flow-backplane" />
          <path className="flow-base-groove" d={BASE_GROOVE} />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              className="flow-floor-trace"
              d={lineOnTop([12, 18 + i * 14], [658, 18 + i * 14], 0.2, P)}
            />
          ))}
          {SCREWS.map((screw, i) => (
            <g key={i}>
              <Solid paths={screw.face} className="flow-screw" />
              <circle
                cx={screw.at[0]}
                cy={screw.at[1]}
                r=".75"
                fill="#0b131e"
              />
            </g>
          ))}
          {[0, 1, 2].map((i) => (
            <FlowArrow
              key={i}
              index={i}
              active={!!record && phaseIndex > i}
              playing={playing}
            />
          ))}
          {MODULES.map((_, i) => (
            <Module
              key={i}
              index={i}
              active={!!record && phaseIndex === i}
              record={record}
            />
          ))}
        </svg>
      </div>
      <div className="flow-phase-grid" aria-label="Explanation phases">
        {PHASES.map((item, i) => (
          <button
            type="button"
            key={item}
            className={item === phase ? "is-current" : ""}
            aria-pressed={item === phase}
            onClick={() => onPhaseChange(item)}
          >
            <span className="flow-step-name">
              {i === 2 && details?.memory ? "Memory access" : LABELS[i]}
            </span>
            <strong title={values[i]}>{values[i]}</strong>
            <span className="flow-step-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>
      <figcaption className="flow-caption" aria-live="polite">
        <strong>
          {record ? details?.operation : "No completed instruction"}
        </strong>
        <span>{captions[phaseIndex]}</span>
      </figcaption>
      <div className="flow-card-footer">
        {!example && record && (
          <span>
            {hex(record.pc)} · cycle {record.cycle}
          </span>
        )}
        <div>
          <button
            type="button"
            onClick={onReplay}
            disabled={!record}
            aria-label="Replay instruction explanation"
          >
            <span aria-hidden="true">↻</span>Replay
          </button>
          <button
            type="button"
            onClick={onPlay}
            disabled={!record}
            aria-pressed={playing}
          >
            <span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>
            {playing ? "Pause explanation" : "Play explanation"}
          </button>
        </div>
      </div>
      <p className="flow-accuracy-note">
        A replay of one {example ? "example" : "recorded"} instruction. PicoRV32
        takes several clock cycles per instruction; these steps explain its data
        flow.
      </p>
    </figure>
  );
}

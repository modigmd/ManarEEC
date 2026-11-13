import { memo, useId, type CSSProperties } from "react";
import {
  boxCorners,
  cylinder,
  depthOf,
  fitProjection,
  haloOf,
  onTop,
  planOutline,
  ring,
  slabOf,
  type Plan,
  type SolidPaths,
} from "./iso/iso-kit";
import "./input-output-marks.css";

export { default as LedOutputMark } from "./LedOutputMark";

// Match the processor's camera and scale. All hardware rests on the PCB.
const BOUNDS: Plan = { x: -39, y: -39, w: 78, d: 78, r: 0 };
const P = fitProjection(boxCorners(BOUNDS, -4, 11), 128, 128, {
  pad: 7,
  azimuth: 45,
  elevation: 47,
});
const PCB: Plan = { x: -34, y: -29, w: 68, d: 58, r: 4 };
const BOARD = slabOf(PCB, 0, 2.5, P, 6, 0.7);
const SHADOW = haloOf(PCB, -4, 6, P);
const CASE = slabOf(
  { x: -17, y: -17, w: 34, d: 34, r: 2 },
  2.5,
  8.5,
  P,
  5,
  0.7,
);
const COVER = [
  { x: -17, y: -17, w: 34, d: 5, r: 1 },
  { x: -17, y: 12, w: 34, d: 5, r: 1 },
  { x: -17, y: -12, w: 5, d: 24, r: 0.6 },
  { x: 12, y: -12, w: 5, d: 24, r: 0.6 },
].map((plan) => slabOf(plan, 11, 0.8, P, 4, 0.3));
const CAP_COLLAR = cylinder(0, 0, 12, 10.9, 2.1, P, 40, 0.4);
const CAP = cylinder(0, 0, 10.7, 13, 6.2, P, 48, 0.75);
const CAP_INSET = ring(0, 0, 8.3, 19.24, P, 40);
const CAP_SEAM = ring(0, 0, 10.2, 19.25, P, 40);
const MOUNTS = [
  [-28, -23],
  [28, -23],
  [-28, 23],
  [28, 23],
]
  .map(([x, y]) => ({
    foot: cylinder(x, y, 2.7, -3.5, 3.5, P, 16),
    pad: cylinder(x, y, 2.2, 2.5, 0.35, P, 20),
    bore: ring(x, y, 1.05, 2.88, P, 20),
    depth: depthOf([x, y, 0], P),
  }))
  .sort((a, b) => a.depth - b.depth);
const RIVETS = [-13.8, 13.8].flatMap((y) =>
  [-13.8, 13.8].map((x) => ({
    head: cylinder(x, y, 1.15, 11.8, 0.45, P, 16),
    slot: onTop(
      [
        [x - 0.65, y],
        [x + 0.65, y],
      ],
      12.28,
      P,
    ),
  })),
);
const TERMINALS = [-1, 1]
  .flatMap((side) =>
    [-10.5, 10.5].map((y, index) => {
      const foot: Plan = {
        x: side < 0 ? -25 : 17,
        y: y - 2.2,
        w: 8,
        d: 4.4,
        r: 0.65,
      };
      return {
        near: side > 0,
        delay: (side < 0 ? index : index + 2) * 0.09,
        foot: slabOf(foot, 2.55, 1.1, P, 3, 0.25),
        bend: slabOf(
          { ...foot, x: side < 0 ? -19.3 : 17, w: 2.3 },
          3.65,
          5.1,
          P,
          3,
          0.3,
        ),
        shine: planOutline(
          {
            ...foot,
            x: foot.x + 0.6,
            y: foot.y + 0.6,
            w: 6.8,
            d: 3.2,
            r: 0.35,
          },
          3.7,
          P,
          3,
        ),
        depth: depthOf([side * 21, y, 3], P),
      };
    }),
  )
  .sort((a, b) => a.depth - b.depth);
const TRACES = [-1, 1]
  .flatMap((side) =>
    [-1, 1].map((end) =>
      onTop(
        [
          [side * 23, end * 10.5],
          [side * 28, end * 10.5],
          [side * 28, end * 23],
        ],
        2.58,
        P,
      ),
    ),
  )
  .join("");
const HEADER = slabOf(
  { x: -13, y: 20, w: 26, d: 6, r: 1 },
  2.5,
  3.5,
  P,
  4,
  0.4,
);
const HEADER_PINS = [-8, 0, 8].map((x) => ({
  socket: planOutline({ x: x - 2, y: 21, w: 4, d: 4, r: 0.4 }, 6.04, P, 3),
  pin: slabOf({ x: x - 1, y: 22, w: 2, d: 2, r: 0.2 }, 6, 2.4, P, 2, 0.2),
}));
const RESISTOR = [
  slabOf({ x: -28, y: -2, w: 2.2, d: 4, r: 0.35 }, 2.5, 1.6, P, 3),
  slabOf({ x: -26, y: -2, w: 5, d: 4, r: 0.4 }, 2.6, 1.7, P, 3, 0.25),
  slabOf({ x: -21.2, y: -2, w: 2.2, d: 4, r: 0.35 }, 2.5, 1.6, P, 3),
];

function Solid({ paths, material }: { paths: SolidPaths; material: string }) {
  return (
    <g className={`io-mark__solid io-mark__${material}`}>
      <path className="io-mark__fill" d={paths.fill} />
      {paths.shades.map((d, index) =>
        d ? (
          <path className={`io-mark__shade--${index}`} d={d} key={index} />
        ) : null,
      )}
      <path className="io-mark__top" d={paths.top} />
      <path className="io-mark__bevel" d={paths.bevel} />
      <path className="io-mark__edge" d={paths.outline} />
    </g>
  );
}

/** Decorative tactile switch; the hover response is unrelated to simulator input. */
export const InputButtonMark = memo(function InputButtonMark({
  size = 80,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const terminals = (near: boolean) =>
    TERMINALS.filter((terminal) => terminal.near === near).map(
      (terminal, index) => (
        <g key={index}>
          <Solid paths={terminal.foot} material="metal" />
          <Solid paths={terminal.bend} material="metal" />
          <path
            className="io-mark__signal"
            d={terminal.shine}
            style={{ "--io-delay": `${terminal.delay}s` } as CSSProperties}
          />
        </g>
      ),
    );
  return (
    <svg
      className={`io-mark input-button-mark ${className}`}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={`input-shadow-${id}`}>
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <linearGradient id={`input-metal-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b7c9d6" />
          <stop offset=".45" stopColor="#7794ac" />
          <stop offset="1" stopColor="#bed4e3" />
        </linearGradient>
      </defs>
      <path
        className="io-mark__shadow"
        d={SHADOW}
        filter={`url(#input-shadow-${id})`}
      />
      <g
        className="io-mark__assembly"
        style={{ "--io-metal": `url(#input-metal-${id})` } as CSSProperties}
      >
        {MOUNTS.map((mount, index) => (
          <Solid key={index} paths={mount.foot} material="rubber" />
        ))}
        <Solid paths={BOARD} material="board" />
        <path className="io-mark__traces" d={TRACES} />
        {MOUNTS.map((mount, index) => (
          <g key={index}>
            <Solid paths={mount.pad} material="metal" />
            <path className="io-mark__bore" d={mount.bore} />
          </g>
        ))}
        {RESISTOR.map((paths, index) => (
          <Solid
            paths={paths}
            material={index === 1 ? "resistor" : "metal"}
            key={index}
          />
        ))}
        {terminals(false)}
        <Solid paths={CASE} material="case" />
        {terminals(true)}
        {COVER.map((paths, index) => (
          <Solid paths={paths} material="metal" key={index} />
        ))}
        {RIVETS.map((rivet, index) => (
          <g key={index}>
            <Solid paths={rivet.head} material="metal" />
            <path className="io-mark__slot" d={rivet.slot} />
          </g>
        ))}
        <Solid paths={CAP_COLLAR} material="case" />
        <Solid paths={CAP} material="cap" />
        <path className="io-mark__cap-inset" d={CAP_INSET} />
        <path className="io-mark__cap-seam" d={CAP_SEAM} />
        <Solid paths={HEADER} material="case" />
        {HEADER_PINS.map((pin, index) => (
          <g key={index}>
            <path className="io-mark__socket" d={pin.socket} />
            <Solid paths={pin.pin} material="metal" />
          </g>
        ))}
      </g>
    </svg>
  );
});

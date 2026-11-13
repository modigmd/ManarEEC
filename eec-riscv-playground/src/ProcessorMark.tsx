import { useId, type CSSProperties } from "react";
import {
  boxCorners,
  depthOf,
  fitProjection,
  haloOf,
  iso,
  onTop,
  planOutline,
  slabOf,
  type Plan,
  type SolidPaths,
} from "./iso/iso-kit";
import "./processor-mark.css";

const BODY: Plan = { x: -27, y: -27, w: 54, d: 54, r: 5.5 };
const DIE: Plan = { x: -13, y: -13, w: 26, d: 26, r: 2.2 };
const BOUNDS: Plan = { x: -39, y: -39, w: 78, d: 78, r: 0 };
const P = fitProjection(boxCorners(BOUNDS, -4, 11), 128, 128, {
  pad: 7,
  azimuth: 45,
  elevation: 47,
});
const CASE = slabOf(BODY, 0, 8, P, 6, 1.2);
const SILICON = slabOf(DIE, 8.1, 1.2, P, 5, 0.5);
const EDGE = planOutline({ x: -23, y: -23, w: 46, d: 46, r: 4 }, 8.15, P, 5);
const SHADOW = haloOf(BODY, -4, 8, P);
const PINS = Array.from({ length: 24 }, (_, i) => {
  const side = Math.floor(i / 6);
  const offset = -21 + (i % 6) * 7.6;
  const plan: Plan =
    side === 0
      ? { x: offset, y: -37, w: 4.3, d: 11, r: 0.7 }
      : side === 1
        ? { x: 26, y: offset, w: 11, d: 4.3, r: 0.7 }
        : side === 2
          ? { x: offset, y: 26, w: 4.3, d: 11, r: 0.7 }
          : { x: -37, y: offset, w: 11, d: 4.3, r: 0.7 };
  return {
    index: i,
    near: side === 1 || side === 2,
    paths: slabOf(plan, -1.8, 2.3, P, 3, 0.35),
    signal: planOutline(
      {
        ...plan,
        x: plan.x + 0.7,
        y: plan.y + 0.7,
        w: plan.w - 1.4,
        d: plan.d - 1.4,
        r: 0.4,
      },
      0.6,
      P,
      3,
    ),
    depth: depthOf([plan.x + plan.w / 2, plan.y + plan.d / 2, 0], P),
  };
}).sort((a, b) => a.depth - b.depth);
const TRACE_LINES = Array.from({ length: 6 }, (_, i) => {
  const outside = -21 + i * 7.6 + 2;
  const inside = -9 + i * 3.6;
  return [
    onTop(
      [
        [outside, -25],
        [outside, -20],
        [inside, -16],
        [inside, -13],
      ],
      8.18,
      P,
    ),
    onTop(
      [
        [25, outside],
        [20, outside],
        [16, inside],
        [13, inside],
      ],
      8.18,
      P,
    ),
    onTop(
      [
        [outside, 25],
        [outside, 20],
        [inside, 16],
        [inside, 13],
      ],
      8.18,
      P,
    ),
    onTop(
      [
        [-25, outside],
        [-20, outside],
        [-16, inside],
        [-13, inside],
      ],
      8.18,
      P,
    ),
  ].join("");
}).join("");
const DIE_CELLS = [-1, 1].flatMap((y) =>
  [-1, 1].map((x) =>
    slabOf(
      { x: x < 0 ? -9 : 1.4, y: y < 0 ? -9 : 1.4, w: 7.6, d: 7.6, r: 0.9 },
      9.4,
      0.4,
      P,
      3,
    ),
  ),
);
const CORNER_DOT = iso([-21, -20, 8.25], P);

function Solid({ paths, className }: { paths: SolidPaths; className: string }) {
  return (
    <g className={className}>
      <path className="processor-mark__fill" d={paths.fill} />
      {paths.shades.map((d, i) =>
        d ? (
          <path
            className={`processor-mark__shade processor-mark__shade--${i}`}
            d={d}
            key={i}
          />
        ) : null,
      )}
      <path className="processor-mark__top" d={paths.top} />
      <path className="processor-mark__bevel" d={paths.bevel} />
      <path className="processor-mark__edge" d={paths.outline} />
    </g>
  );
}

/** A decorative package mark; its short hover sweep does not represent simulation activity. */
export default function ProcessorMark({
  size = 80,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const drawPins = (near: boolean) =>
    PINS.filter((pin) => pin.near === near).map((pin) => (
      <g key={pin.index}>
        <Solid paths={pin.paths} className="processor-mark__pin" />
        <path
          className="processor-mark__signal"
          d={pin.signal}
          style={{ "--pin-delay": `${pin.index * 0.025}s` } as CSSProperties}
        />
      </g>
    ));
  return (
    <svg
      className={`processor-mark ${className}`}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={`processor-shadow-${id}`}>
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <linearGradient
          id={`processor-metal-${id}`}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0" stopColor="#b7c9d6" />
          <stop offset=".45" stopColor="#7794ac" />
          <stop offset="1" stopColor="#bed4e3" />
        </linearGradient>
      </defs>
      <path
        className="processor-mark__shadow"
        d={SHADOW}
        filter={`url(#processor-shadow-${id})`}
      />
      <g
        className="processor-mark__assembly"
        style={
          {
            "--processor-metal": `url(#processor-metal-${id})`,
          } as CSSProperties
        }
      >
        {drawPins(false)}
        <Solid paths={CASE} className="processor-mark__case" />
        <path className="processor-mark__inset" d={EDGE} />
        <path className="processor-mark__traces" d={TRACE_LINES} />
        <Solid paths={SILICON} className="processor-mark__silicon" />
        {DIE_CELLS.map((paths, i) => (
          <Solid key={i} paths={paths} className="processor-mark__cell" />
        ))}
        <circle
          cx={CORNER_DOT[0]}
          cy={CORNER_DOT[1]}
          r="1.1"
          className="processor-mark__orientation"
        />
        {drawPins(true)}
      </g>
    </svg>
  );
}

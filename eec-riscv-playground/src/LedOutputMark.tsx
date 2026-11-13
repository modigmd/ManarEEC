import { memo, useId, type CSSProperties } from "react";
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
import "./led-output-mark.css";

const PCB: Plan = { x: -36, y: -18, w: 72, d: 36, r: 3.2 };
const BOUNDS: Plan = { x: -39, y: -39, w: 78, d: 78, r: 0 };
const P = fitProjection(boxCorners(BOUNDS, -4, 11), 128, 128, {
  pad: 7,
  azimuth: 45,
  elevation: 47,
});
const BASE = slabOf(PCB, -0.7, 3.2, P, 5, 0.6);
const SHADOW = haloOf(PCB, -4, 7, P);
const INSET = planOutline(
  { x: -33.8, y: -15.8, w: 67.6, d: 31.6, r: 2.4 },
  2.55,
  P,
  5,
);
const LEDS = Array.from({ length: 8 }, (_, index) => {
  const x = -27.3 + index * 7.8;
  return {
    index,
    lit: (42 & (1 << index)) !== 0,
    depth: depthOf([x, -3.9, 5], P),
    housing: slabOf(
      { x: x - 2.9, y: -10.8, w: 5.8, d: 13.2, r: 1.1 },
      2.8,
      4.8,
      P,
      4,
      0.45,
    ),
    lens: slabOf(
      { x: x - 1.95, y: -9.2, w: 3.9, d: 9.9, r: 0.75 },
      7.61,
      0.65,
      P,
      4,
      0.2,
    ),
    traces: [
      onTop(
        [
          [x, -15.8],
          [x, -12.8],
        ],
        2.55,
        P,
      ),
      onTop(
        [
          [x, 4.2],
          [x, 15.8],
        ],
        2.55,
        P,
      ),
    ].join(""),
    pads: [-13.1, 2.5].map((y) =>
      slabOf({ x: x - 2.5, y, w: 5, d: 2.5, r: 0.45 }, 2.55, 0.3, P, 3, 0.12),
    ),
    contacts: [-1, 1].map((side) =>
      slabOf(
        { x: x - 1.8, y: side < 0 ? -25 : 15, w: 3.6, d: 10, r: 0.7 },
        -1.2,
        1.65,
        P,
        3,
        0.3,
      ),
    ),
  };
}).sort((a, b) => a.depth - b.depth);
const HOLES = [-1, 1].flatMap((y) =>
  [-1, 1].map((x) => iso([x * 32, y * 13.6, 2.7], P)),
);

function Solid({ paths, className }: { paths: SolidPaths; className: string }) {
  return (
    <g className={className}>
      <path className="led-output-mark__fill" d={paths.fill} />
      {paths.shades.map((d, i) =>
        d ? (
          <path
            key={i}
            className={`led-output-mark__shade led-output-mark__shade--${i}`}
            d={d}
          />
        ) : null,
      )}
      <path className="led-output-mark__top" d={paths.top} />
      <path className="led-output-mark__bevel" d={paths.bevel} />
      <path className="led-output-mark__edge" d={paths.outline} />
    </g>
  );
}

/** Decorative LED chase, separate from the workbench's live output. */
export default memo(function LedOutputMark({
  size = 80,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`led-output-mark ${className}`}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={`led-output-shadow-${id}`}>
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <linearGradient
          id={`led-output-metal-${id}`}
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
        className="led-output-mark__shadow"
        d={SHADOW}
        filter={`url(#led-output-shadow-${id})`}
      />
      <g
        className="led-output-mark__assembly"
        style={
          {
            "--led-output-metal": `url(#led-output-metal-${id})`,
          } as CSSProperties
        }
      >
        {LEDS.map((led) => (
          <g key={led.index}>
            {led.contacts.map((paths, i) => (
              <Solid
                key={i}
                paths={paths}
                className="led-output-mark__contact"
              />
            ))}
          </g>
        ))}
        <Solid paths={BASE} className="led-output-mark__pcb" />
        <path className="led-output-mark__inset" d={INSET} />
        {LEDS.map((led) => (
          <path
            key={led.index}
            className="led-output-mark__trace"
            d={led.traces}
          />
        ))}
        {HOLES.map(([x, y], i) => (
          <g key={i} className="led-output-mark__hole">
            <circle cx={x} cy={y} r="1.35" />
            <circle cx={x} cy={y} r="0.55" />
          </g>
        ))}
        {LEDS.map((led) => (
          <g
            key={led.index}
            className={`led-output-mark__led${led.lit ? " is-rest-on" : ""}`}
          >
            {led.pads.map((paths, i) => (
              <Solid key={i} paths={paths} className="led-output-mark__pad" />
            ))}
            <Solid paths={led.housing} className="led-output-mark__housing" />
            <Solid paths={led.lens} className="led-output-mark__lens" />
            <g
              className="led-output-mark__illumination is-on"
              style={{ "--led-step": led.index } as CSSProperties}
            >
              <Solid paths={led.lens} className="led-output-mark__lens" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
});

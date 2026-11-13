import type { CSSProperties } from "react";

const paths: Record<string, React.ReactNode> = {
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" />
      <rect x="9" y="9" width="6" height="6" rx=".5" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </>
  ),
  arrowUp: (
    <>
      <path d="m7 17 10-10M7 7h10v10" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  step: (
    <>
      <path d="m5 5 10 7-10 7ZM19 5v14" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  cycle: (
    <>
      <path d="m17 3 4 4-4 4M21 7H9a6 6 0 0 0-6 6m4 8-4-4 4-4m-4 4h12a6 6 0 0 0 6-6" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 8a8 8 0 1 0 .4 7M20 3v5h-5" />
    </>
  ),
  reset: (
    <>
      <path d="M4 8a8 8 0 1 1-.4 7M4 3v5h5" />
    </>
  ),
  label: (
    <>
      <path d="m3 4 8 0 10 10-7 7L3 10Z" />
      <circle cx="7.5" cy="8" r="1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  expand: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
    </>
  ),
  code: (
    <>
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m6 9 3 3-3 3m6 0h5" />
    </>
  ),
  registers: (
    <>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <rect x="3" y="10" width="18" height="5" rx="1" />
      <path d="M3 19h18M6 5.5h.01M6 12.5h.01" />
    </>
  ),
  memory: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 2v3m4-3v3m4-3v3M8 19v3m4-3v3m4-3v3M8 9h8m-8 4h4" />
    </>
  ),
  signals: (
    <>
      <path d="M2 17h4V7h6v10h6V7h4M2 22h20" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
    </>
  ),
  check: <path d="m5 12 4 4L20 5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-11v1" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.8a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3.2Z" />
      <path d="M12 9v4m0 3v1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  cube: (
    <>
      <path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M7.5 4.5l9 5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4m0 14v4M1 12h4m14 0h4" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-2-1-6-2-10 1Zm0 0v15" />
    </>
  ),
  flag: (
    <>
      <path d="M5 22V3c6-4 9 4 16 0v11c-7 4-10-4-16 0" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />
    </>
  ),
  mouse: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <path d="M12 2v7M6 9h12" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
  switches: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M7 9v6m5-6v6m5-6v6" />
    </>
  ),
};

export default function Icon({
  name,
  size = 18,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name] || paths.chip}
    </svg>
  );
}

export interface DisassemblyLine {
  address: number;
  hex: string;
  text: string;
  line?: number;
}
export interface Diagnostic {
  line: number;
  message: string;
}
export interface AssemblyResult {
  ok: boolean;
  image?: number[];
  disassembly?: DisassemblyLine[];
  lineMap?: Record<string, number>;
  diagnostics?: Diagnostic[];
  message?: string;
}
export interface MemoryWord {
  address: number;
  value: number;
}
export interface TraceSample {
  cycle: number;
  pc: number;
  state: string;
  memValid: boolean;
  memReady: boolean;
  memWrite: boolean;
  memAddr: number;
  memData: number;
  retired: boolean;
}
export interface Snapshot {
  cycle: number;
  retired: number;
  pc: number;
  regs: number[];
  state: string;
  trap: boolean;
  halted: boolean;
  status: "ready" | "paused" | "running" | "halted" | "error";
  message?: string;
  leds: number;
  inputs: number;
  console: string;
  memory: MemoryWord[];
  trace: TraceSample[];
  lastInstruction: number;
}
export type CameraView = "perspective" | "top" | "front" | "bottom";
export interface BoardSceneProps {
  camera: CameraView;
  rotate: boolean;
  labels: boolean;
  exploded: boolean;
  cutaway: boolean;
  selectedPart: string | null;
  onSelectPart: (id: string | null) => void;
  leds: number;
  running: boolean;
  cpuState: string;
  assemblyPlaced?: string[];
  assemblyMode?: boolean;
  onPlacePart?: (id: string) => void;
  compact?: boolean;
}
export interface Demo {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  duration: string;
  icon: string;
  source: string;
  description: string;
  expected: string;
}

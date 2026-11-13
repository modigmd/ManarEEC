import type { Lesson, LessonId, RetiredInstruction, Snapshot } from "./types";

export const hex = (value: number) =>
  `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
export const initialSnapshot: Snapshot = {
  cycle: 0,
  retired: 0,
  pc: 0,
  regs: Array(32).fill(0),
  state: "reset",
  trap: false,
  halted: false,
  status: "ready",
  leds: 0,
  inputs: 0,
  console: "",
  memory: [],
  trace: [],
  lastInstruction: 0,
  lastRetired: null,
};
export const exampleRetirement: RetiredInstruction = {
  order: 3,
  cycle: 13,
  pc: 8,
  nextPc: 12,
  instruction: 0x006283b3,
  rs1: 5,
  rs2: 6,
  rs1Value: 7,
  rs2Value: 35,
  rd: 7,
  rdValue: 42,
  memoryAddress: 0,
  memoryReadMask: 0,
  memoryWriteMask: 0,
  memoryReadData: 0,
  memoryWriteData: 0,
};

export const projectOverview = {
  title: "Build a button-controlled LED counter",
  subtitle: "One open-source core. One complete project.",
  description:
    "Write a program that reads a button, counts each new press, and shows the count on eight LEDs. See how your assembly becomes instructions and how those instructions move data through PicoRV32.",
  outcome:
    "Each press adds one. The eight LEDs display the count in binary, from 0 to 255.",
  prerequisites: [
    "A recent desktop browser",
    "Basic familiarity with binary numbers",
    "No FPGA board required for this guided simulation",
  ],
  learn: [
    "Read and write CPU registers",
    "Connect a program to memory-mapped input and output",
    "Use a loop and detect a button edge",
    "Verify a working project against real processor state",
  ],
  category: "Designs & Generators / CPUs / PicoRV32",
  duration: "4 guided steps",
};

export const lessons: Lesson[] = [
  {
    id: "add",
    number: "01",
    title: "Follow your first instruction",
    short: "Code → registers",
    aim: "Make the processor calculate 7 + 35 and find the result in t2.",
    why: "Registers are the CPU’s small, fast working storage. The ADD instruction reads two source registers and writes their sum into a destination register. This is the same mechanism the counter will use to increment its value.",
    steps: [
      "Read the program below. li gives a register a value; add combines two registers.",
      "Choose Assemble & Load. The assembler converts these lines to RISC-V machine instructions.",
      "Choose Instruction three times, or Run. Open Inside CPU to follow the most recently completed instruction.",
      "Find t2 (x7) in Registers. The result should be 42, shown as 0x0000002a in hexadecimal.",
    ],
    source: `.section .text
.globl _start
_start:
    li   t0, 7          # x5: first operand
    li   t1, 35         # x6: second operand
    add  t2, t0, t1     # x7: 7 + 35 = 42
    ebreak             # stop and inspect the result
`,
    expected: "t0 = 7 · t1 = 35 · t2 = 42",
    checkpoint: "The real core has written 42 to t2.",
    tip: "li is an assembler pseudo-instruction. For these small values GNU emits addi with x0, the register that always reads zero. The replay shows the actual machine instruction.",
  },
  {
    id: "led",
    number: "02",
    title: "Turn a value into light",
    short: "Registers → LEDs",
    aim: "Display the number 42 on the eight output LEDs.",
    why: "A store can send data to a peripheral instead of RAM. This lab maps its output register to 0x10000004. Writing a value there changes the eight LEDs. The CPU uses its normal memory bus to do it.",
    steps: [
      "Find the address 0x10000004 below. That is the virtual LED output register.",
      "Assemble & Load, then Run. sw stores the value in t1 to that address.",
      "Read the LEDs from bit 7 to bit 0: 00101010. Bits 5, 3, and 1 should be on.",
      "In Inside CPU, inspect the store’s memory address and write data. Registers and peripherals are different places to store a value.",
    ],
    source: `.section .text
.globl _start
_start:
    li   t0, 0x10000004  # LED output address
    li   t1, 42          # binary 00101010
    sw   t1, 0(t0)       # send the low eight bits to the LEDs
    ebreak
`,
    expected: "LEDs = 00101010₂ = 42₁₀",
    checkpoint: "The simulated output register contains 42.",
    tip: "The address is part of this lab’s virtual system, not a universal PicoRV32 pinout. A physical FPGA implementation needs a matching hardware peripheral.",
  },
  {
    id: "input",
    number: "03",
    title: "Read the outside world",
    short: "Button → registers",
    aim: "Read input switch 0 into a0 so the program can react to a button.",
    why: "A load can read an input peripheral. The eight switches live at 0x10000008. AND with 1 keeps just bit 0; the other seven switches cannot affect the button value.",
    steps: [
      "Assemble & Load, then turn input switch 0 on before running.",
      "Run the program. lw reads the input register; andi isolates bit 0.",
      "Open Registers and find a0 (x10). It should contain 1.",
      "To compare, reset, turn switch 0 off, and run again. a0 should now be zero.",
    ],
    source: `.section .text
.globl _start
_start:
    li   t0, 0x10000008  # input switch register
    lw   a0, 0(t0)       # read all eight input bits
    andi a0, a0, 1       # keep only button bit 0
    ebreak
`,
    expected: "Switch 0 on → a0 = 1",
    checkpoint: "The program has read an on-state from input 0.",
    tip: "Set the switch before Run. EBREAK stops the processor, so moving the switch after it stops cannot change a0 until you run the program again.",
  },
  {
    id: "counter",
    number: "04",
    title: "Build the complete counter",
    short: "Input → CPU → output",
    aim: "Combine input, arithmetic, a loop, and output into a working project.",
    why: "The program remembers the previous button state. It increments only when the state changes from zero to one. Holding the button down therefore counts once, and eight bits make the counter wrap from 255 back to zero.",
    steps: [
      "Assemble & Load. The counter starts at zero with the input switches off.",
      "Choose Run. This program intentionally keeps looping; Pause stops it.",
      "Use Press button to send a short real input pulse. The LEDs should show 1. Press again to get 2, then 3.",
      "Try holding switch 0 on: the count increases once, not on every CPU clock. Turn it off before the next press.",
      "Inspect s0 (x8), which holds the count. Pause and use Instruction or Cycle to follow the loop.",
    ],
    source: `.section .text
.globl _start
_start:
    li   t0, 0x10000008  # input address
    li   t1, 0x10000004  # LED output address
    li   s0, 0           # counter
    li   s1, 0           # previous button state
loop:
    lw   t2, 0(t0)
    andi t2, t2, 1       # current button state
    beq  t2, s1, loop    # unchanged? keep waiting
    mv   s1, t2          # remember the new state
    beqz t2, loop        # a release does not count
    addi s0, s0, 1       # one new press, one increment
    andi s0, s0, 255     # wrap to eight bits
    sw   s0, 0(t1)       # show the count
    j    loop
`,
    expected: "One press → 1 · two presses → 2 · holding → one increment",
    checkpoint:
      "The counter register and LED output match after a real input press.",
    tip: "An automatic press lasts at least 250 ms and is held longer at slow simulation speeds so the CPU can poll it. Real mechanical buttons also need debouncing; the virtual switches are clean signals.",
  },
];

export function checkLesson(id: LessonId, snapshot: Snapshot): boolean {
  if (!snapshot.retired || snapshot.status === "error") return false;
  switch (id) {
    case "add":
      return (
        snapshot.regs[5] === 7 &&
        snapshot.regs[6] === 35 &&
        snapshot.regs[7] === 42
      );
    case "led":
      return snapshot.leds === 42;
    case "input":
      return snapshot.halted && snapshot.regs[10] === 1;
    case "counter":
      return (
        !snapshot.trap &&
        snapshot.leds > 0 &&
        snapshot.leds === snapshot.regs[8]
      );
  }
}

export const tools = [
  {
    id: "picorv32",
    name: "PicoRV32",
    role: "THE PROCESSOR",
    description:
      "The open-source Verilog core that executes your instructions. This lab pins its upstream source and uses the native memory interface.",
    url: "https://github.com/YosysHQ/picorv32",
    directoryUrl: "https://eec-club-hardware.netlify.app/#t-picorv32",
    used: true,
  },
  {
    id: "verilator",
    name: "Verilator",
    role: "THE SIMULATOR",
    description:
      "Compiles the Verilog core into a native C++ hardware model. The project’s live registers, cycles, and retirement records come from that model.",
    url: "https://verilator.org/guide/latest/overview.html",
    directoryUrl: "https://eec-club-hardware.netlify.app/#t-verilator",
    used: true,
  },
  {
    id: "binutils",
    name: "GNU Binutils",
    role: "THE ASSEMBLER",
    description:
      "Assembles and links your RV32IM program and provides real machine-code disassembly. RISC-V assembly is software for the core; it does not define the core’s hardware.",
    url: "https://sourceware.org/binutils/docs/as/RISC_002dV_002dOptions.html",
    directoryUrl: "https://sourceware.org/binutils/",
    used: true,
  },
  {
    id: "yosys",
    name: "Yosys",
    role: "A NEXT HARDWARE STEP",
    description:
      "Synthesizes a hardware design for a supported FPGA flow. Use it after adding real RAM, peripherals, clock/reset logic, and board constraints.",
    url: "https://github.com/YosysHQ/yosys",
    directoryUrl: "https://eec-club-hardware.netlify.app/#t-yosys",
    used: false,
  },
  {
    id: "nextpnr",
    name: "nextpnr",
    role: "A NEXT HARDWARE STEP",
    description:
      "Places and routes synthesized logic for supported FPGA families. Its target and programming tools depend on the board you choose.",
    url: "https://github.com/YosysHQ/nextpnr",
    directoryUrl: "https://eec-club-hardware.netlify.app/#t-nextpnr",
    used: false,
  },
];

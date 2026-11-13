import type { Demo, Snapshot } from "./types";

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
};

export const parts = [
  {
    id: "cpu",
    name: "PicoRV32 core",
    short: "The little brain",
    label: "01 · PROCESSOR",
    description: "A complete 32-bit RISC-V processor, described in Verilog.",
    detail:
      "The original PicoRV32 RTL executes every instruction in this lab. Its compact multicycle design reuses hardware across clock cycles. Open the cutaway to explore a conceptual view of its decoder, register file, ALU, and control logic. The package shown is an illustration, not a manufactured PicoRV32 chip.",
  },
  {
    id: "ram",
    name: "Program & data memory",
    short: "Room to think",
    label: "02 · MEMORY",
    description:
      "64 KiB of shared space for your instructions, data, and stack.",
    detail:
      "Memory occupies 0x00000000–0x0000ffff. The CPU fetches instructions and reads or writes data through the same native memory interface. The initial stack pointer is 0x00010000, just above RAM, so the stack grows down into valid memory.",
  },
  {
    id: "uart",
    name: "Console bridge",
    short: "A way to say hello",
    label: "03 · OUTPUT",
    description: "Turn a memory write into a character in the console.",
    detail:
      "Store a character byte at 0x10000000 to append it to the console. This is a virtual memory-mapped output device in the simulation wrapper. The USB connector on the illustrative board represents the connection to your computer; this lab does not connect to physical USB hardware.",
  },
  {
    id: "gpio",
    name: "GPIO & LEDs",
    short: "Bits you can see",
    label: "04 · INPUT / OUTPUT",
    description:
      "Eight output lights and eight input switches make binary tangible.",
    detail:
      "Write the low eight bits of a word to 0x10000004 to set the LEDs. Read 0x10000008 to get the input switch states. Each LED corresponds to one bit: LED 0 is the least significant bit. These peripherals are part of this lab’s virtual wrapper.",
  },
  {
    id: "clock",
    name: "Clock source",
    short: "One tick at a time",
    label: "05 · TIMING",
    description: "Every clock edge advances the real hardware model.",
    detail:
      "Step Cycle advances one rising clock edge; Step Instruction advances until an instruction retires or the processor stops. An instruction generally takes several cycles on PicoRV32. The speed control sets simulation cycles per second, not a claimed physical operating frequency.",
  },
  {
    id: "power",
    name: "Power & reset",
    short: "A fresh beginning",
    label: "06 · CONTROL",
    description:
      "Reset the core, restore the program, and start at address zero.",
    detail:
      "Reset clears RAM, reloads the current program image, resets the core and its registers, and clears console output, LEDs, counters, and traces. The simulated core starts with x2 set to 0x00010000. The board’s power components illustrate a physical implementation.",
  },
];

export const demos: Demo[] = [
  {
    id: "hello",
    name: "Meet the registers",
    subtitle: "Your first instructions",
    category: "START HERE",
    duration: "2 min",
    icon: "registers",
    description:
      "Give two registers a value, then let the ALU add, multiply, and divide. Step through each instruction and follow the changing registers.",
    expected: "t2 = 42 · t3 = 245 · t4 = 5",
    source: `# A little arithmetic, on the actual PicoRV32 core.
# Click Assemble & Load, then Step instruction.
.section .text
.globl _start
_start:
    li   t0, 7          # x5: our first number
    li   t1, 35         # x6: our second number
    add  t2, t0, t1     # x7 = 42
    mul  t3, t0, t1     # x28 = 245
    div  t4, t1, t0     # x29 = 5
    ebreak             # stop and inspect the result
`,
  },
  {
    id: "fibonacci",
    name: "Fibonacci",
    subtitle: "A small loop, big ideas",
    category: "BRANCHES",
    duration: "4 min",
    icon: "fibonacci",
    description:
      "Build the Fibonacci sequence with two registers and a loop. Notice how a branch changes the program counter, and how many clock cycles each trip takes.",
    expected: "a0 = 55 · a1 = 89 · t0 = 0",
    source: `# Fibonacci: after ten iterations, a0 contains 55.
.section .text
.globl _start
_start:
    li   a0, 0
    li   a1, 1
    li   t0, 10
next:
    add  t1, a0, a1
    mv   a0, a1
    mv   a1, t1
    addi t0, t0, -1
    bnez t0, next
    ebreak
`,
  },
  {
    id: "memory",
    name: "Memory walk",
    subtitle: "Load. Add. Store.",
    category: "MEMORY",
    duration: "4 min",
    icon: "memory",
    description:
      "Walk through four words in RAM and add them together. Inspect memory to find the stored result and watch the native bus perform each transaction.",
    expected: "a0 = 100 · result in RAM = 100",
    source: `# Sum four words and store the result in RAM.
.section .text
.globl _start
_start:
    la   t0, values
    li   t1, 4
    li   a0, 0
next:
    lw   t2, 0(t0)
    add  a0, a0, t2
    addi t0, t0, 4
    addi t1, t1, -1
    bnez t1, next
    sw   a0, 0(t0)
    ebreak

.section .data
.balign 4
values:
    .word 10, 20, 30, 40
result:
    .word 0
`,
  },
  {
    id: "leds",
    name: "Chasing light",
    subtitle: "Bring the board to life",
    category: "GPIO",
    duration: "3 min",
    icon: "leds",
    description:
      "Move a single lit bit across eight LEDs. Run this continuous program, change the simulation speed, then pause to inspect its state.",
    expected: "A single light travels from LED 0 to LED 7.",
    source: `# Eight LEDs, one travelling bit. Press Pause to stop.
# GPIO output is memory-mapped at 0x10000004.
.section .text
.globl _start
_start:
    li   t0, 0x10000004
    li   t1, 1
light:
    sw   t1, 0(t0)
    li   t2, 16
wait:
    addi t2, t2, -1
    bnez t2, wait
    slli t1, t1, 1
    li   t2, 256
    bne  t1, t2, light
    li   t1, 1
    j    light
`,
  },
  {
    id: "console",
    name: "Hello, RISC-V",
    subtitle: "A message from the core",
    category: "CONSOLE",
    duration: "3 min",
    icon: "console",
    description:
      "Read a string from memory and send it out, one byte at a time. Each character reaches the console through a real simulated memory write.",
    expected: "Console: “Hello, RISC-V!”",
    source: `# Send a message through the virtual console bridge.
# Store a character byte at 0x10000000 to print it.
.section .text
.globl _start
_start:
    li   t0, 0x10000000
    la   t1, message
next:
    lbu  t2, 0(t1)
    beqz t2, done
    sb   t2, 0(t0)
    addi t1, t1, 1
    j    next
done:
    ebreak

.section .rodata
message:
    .asciz "Hello, RISC-V!\\n"
`,
  },
];

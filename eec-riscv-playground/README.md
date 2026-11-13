# ManarEEC

A project-first companion to the [EEC open hardware directory](https://eec-club-hardware.netlify.app/). It uses the directory’s original EEC logo, dark slate palette, cyan/blue accents, and fabrication grid. Source: [modigmd/ManarEEC](https://github.com/modigmd/ManarEEC).

The existing **PicoRV32 Lab** remains at **http://127.0.0.1:5173**. This companion runs at **http://127.0.0.1:5174** and has its own frontend, server, simulator executable, browser storage, and build output.

## What it adds to the directory

The original directory helps visitors discover open-source tools and designs, understand their place in the RTL-to-GDSII flow, and follow source links. This site takes one directory entry, PicoRV32, and turns it into a guided project with an observable result.

**Project: build a button-controlled eight-bit LED counter.**

1. Follow an ADD instruction: read `t0 = 7` and `t1 = 35`, then write `t2 = 42`.
2. Write 42 to the LED output register and read its binary pattern.
3. Read input switch zero into a CPU register.
4. Combine a loop, edge detection, arithmetic, input, and output into a working counter.

The project checks actual processor/peripheral state. A successful checkpoint is not an unchecked completion box. The counter increments once for each new press, ignores a held button, and wraps from 255 back to zero.

## Run locally

Use Node.js 22.12 or newer and Ubuntu under WSL on Windows (or Ubuntu directly).

```powershell
cd eec-riscv-playground
npm install
npm run setup:sim
npm run dev
```

Open **http://127.0.0.1:5174**. The existing lab can keep running on port 5173 at the same time. After initial setup, `npm run dev` launches the companion by itself.

For the production build:

```powershell
npm run build
npm start
```

`PICORV32_WSL_DISTRO` selects an Ubuntu WSL distribution other than the default `Ubuntu`. The setup script verifies the vendored core’s SHA-256 and builds a native simulation with Verilator. The source is pinned at commit `ef203c2b0a3fb793280f5114941416c425c5b461`. Atomic executable replacement allows a rebuild while an existing simulation is still running.

If npm needs the Windows certificate store on this network, use `$env:NODE_USE_SYSTEM_CA = '1'` before installing. Certificate verification remains enabled.

## What the visuals mean

The 3D board is an educational illustration of a virtual system. The original PicoRV32 RTL executes through Verilator; no JavaScript CPU emulator stands in for it.

The **Inside CPU** figure replays one completed instruction. Its operands, destination, result, memory address/data/masks, and program counters come from the core’s RVFI outputs. An example elsewhere on the page is clearly labelled as an example.

The replay’s four explanation phases are not four simultaneous pipeline stages. PicoRV32 is a multicycle processor. Use **Cycle** to advance its actual hardware state, or **Instruction** to advance until an instruction retires. Replay holds one retirement record while its visual explanation plays.

## Memory map

| Address                   | Role                                  |
| ------------------------- | ------------------------------------- |
| `0x00000000`–`0x0000ffff` | 64 KiB little-endian program/data RAM |
| `0x10000000`              | Console character output              |
| `0x10000004`              | Eight output LED bits                 |
| `0x10000008`              | Eight input switch bits               |

The core is configured as RV32IM with 32 registers, multiplication/division and counters enabled, compressed instructions/interrupts disabled, reset address zero, and initial stack pointer `0x00010000`.

An automatic button press changes actual simulated input bit zero. It lasts at least 250 ms and scales at slow simulation speeds so the polling program can read it. Input switches can also be held manually. Virtual inputs are clean signals; a physical button needs synchronization and debouncing.

## Project files and further hardware

The project ZIP contains your assembled source, the raw RV32IM binary, and instructions explaining how to run it and interpret the result. It is firmware for this simulated memory map. It is not an FPGA bitstream.

Moving to a physical FPGA requires a chosen device/board, a top-level RTL design, real RAM and peripheral registers, appropriate clock/reset logic, synchronized/debounced input, pin/timing constraints, synthesis, place-and-route, and the board’s programming tool. The site links back to the relevant EEC entries and upstream PicoSoC examples.

In a local launch, execution stays on your computer. In the hosted deployment, GNU assembly and the native CPU model run on the application's Linux server in a separate session for each browser. Fonts, logo, 3D assets, and the instruction figure are served by the application. Progress and per-lesson source drafts use browser storage with an `eec-riscv` prefix, separate from the existing lab.

The repository-root Dockerfile and Render Blueprint deploy the full guided application. See the [hosting instructions](../README.md#host-the-complete-website). HTTPS and WebSocket upgrades must reach the same application origin. GitHub Pages alone cannot host the native simulator.

## Verify

```powershell
npm run typecheck
npm test
npm run build
```

Tests exercise actual RVFI operands/writeback, output stores, input loads, rising-edge counting, held/released inputs, eight-bit wraparound, checkpoint rejection, and the instruction explanation model. Original simulation/server validation remains in the existing lab’s test suite.

## Source and attribution

- `src/curriculum.ts`: project instructions, runnable lesson programs, and real-state checkpoint conditions.
- `src/InstructionFlow.tsx`: the instruction replay figure; `src/instruction-model.ts` explains recorded instruction fields.
- `sim/`: the hardware wrapper and C++ harness. `lastRetired` records the RVFI read/write values used in the figure.
- `vendor/picorv32/`: unmodified upstream core, license, and pin metadata.
- `server/`: local assembly/disassembly API and per-connection hardware simulation.

EEC’s logo was extracted from the user-provided original directory and is preserved as a club identity asset. This learning companion does not modify the original EEC website. The instruction figure uses the provided Anatomy toolkit. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for libraries and source notices.

# ManarEEC

An EEC-branded learning website that takes one open hardware directory entry, PicoRV32, through a complete button-controlled LED-counter project. The guided website runs the original Verilog core through Verilator, with GNU RISC-V assembly, a 3D virtual board, instruction explanations, and checks against actual processor state.

This repository contains two independent applications:

- **ManarEEC** in [`eec-riscv-playground/`](eec-riscv-playground/README.md): the guided project, normally on port **5174** locally. The repository's Docker image deploys this application with full online simulation.
- **PicoRV32 Lab** at the repository root: the original general CPU workbench, normally on port **5173** locally.

To run ManarEEC locally after cloning this repository:

```powershell
cd eec-riscv-playground
npm ci
npm run setup:sim
npm run dev
```

After initial setup, `npm run dev` is the single launch command. See the [guided project's README](eec-riscv-playground/README.md) for its lessons, memory map, and production commands.

## Host the complete website

GitHub stores the complete source. The full application needs a Linux server that can run Node.js, GNU RISC-V tools, and the native Verilator executable; GitHub Pages cannot run this backend.

The root [`Dockerfile`](Dockerfile) builds the pinned core, runs the project tests, builds the frontend, and starts the guided website as a non-root user. [`render.yaml`](render.yaml) configures a free Render web service. The server accepts its public origin from `RENDER_EXTERNAL_URL` or an explicit `PUBLIC_ORIGIN`; local launches keep their loopback defaults.

[Deploy ManarEEC to Render](https://render.com/deploy?repo=https://github.com/modigmd/ManarEEC)

For another Docker host:

```sh
docker build -t manareec .
docker run --rm -p 10000:10000 -e PUBLIC_ORIGIN=https://your-domain.example manareec
```

Route HTTPS and WebSocket upgrades to port 10000. Set `PUBLIC_ORIGIN` to the exact public URL. Each browser gets its own CPU session; server limits bound concurrent sessions, assembly work, and idle sessions. Drafts and learning progress remain in each visitor's browser. Render's free instance can sleep when idle, so the first visit may take longer to start.

GitHub Actions builds the production container and checks HTTP assembly, WebSocket execution, the real ADD result, LED output, and reset. The smoke check can also be run against a deployed server with `node scripts/check-hosted.mjs https://your-domain.example` after installing the root dependencies.

## Original PicoRV32 Lab

A local, interactive RISC-V workbench. Explore an illustrated 3D demo board, assemble programs, and observe the **original PicoRV32 Verilog core** executing inside Verilator.

The lab uses the original EEC logo and dark slate/cyan identity. The separate guided companion, **ManarEEC**, lives in `eec-riscv-playground/`. This lab remains independently accessible on port **5173**.

The PCB, packages, and processor cutaway are educational illustrations. CPU execution, registers, bus activity, instruction retirement, and peripheral output come from the native hardware simulation. PicoRV32 is a soft processor core, not a manufactured development board.

## Start the lab

Requirements: Node.js 22.12 or newer, npm, and Ubuntu under WSL on Windows. Ubuntu Linux is also supported directly. This workspace was built and verified with Windows Node.js 24 and Ubuntu 24.04 under WSL.

```powershell
npm install
npm run setup:sim
npm run dev
```

Open the local address printed by the server (normally **http://127.0.0.1:5173**). After the first setup, `npm run dev` is the only launch command needed.

`setup:sim` verifies the vendored core hash, installs missing Ubuntu packages, and compiles the simulation executable. Packages are Verilator, GNU RISC-V Binutils, the C++ build toolchain, and nlohmann/json. On Windows it uses the WSL distribution `Ubuntu`; set `PICORV32_WSL_DISTRO` to select another Ubuntu distribution. Package installation needs root access; on Windows the setup invokes the selected WSL distribution's root user for installation.

On a network that uses the Windows certificate store for HTTPS, npm can use that store without disabling certificate verification:

```powershell
$env:NODE_USE_SYSTEM_CA = '1'
npm install
```

The application binds to loopback. Programs, drafts, and simulation data stay on this computer. Runtime fonts, models, and scripts are served locally; there are no external runtime asset requests. Outbound project and documentation links open only when clicked.

## Use the workbench

1. Choose one of the five examples or edit its assembly source.
2. Select **Assemble & Load**. GNU Binutils assembles and links the program for RV32IM.
3. Step through one instruction or one clock cycle, or run continuously. The speed is simulated clock cycles per second.
4. Inspect registers, memory, console output, and recent cycle traces. Click an instruction's breakpoint control to pause at its address.
5. Import a raw `.bin` program, or download the current assembly and assembled binary. Reset restores the current program image and clears execution history.

The LED example intentionally loops forever; Pause stops it. The other examples finish with `ebreak`. EBREAK is handled as a friendly program stop. Other unsupported instructions and misaligned accesses trigger the original core's trap behavior. Accesses outside the lab memory map stop the simulation with an error.

Editor drafts and exercise completion use local browser storage. Assembly is single-file: `.include` and `.incbin` are rejected. Assembly errors preserve the last successfully loaded program. Imported binary images stay in the current tab and survive a simulator reconnection; a full page reload restores your last assembly draft. Binary informational comments never replace that draft.

## Processor configuration

| Setting                              | Value                                      |
| ------------------------------------ | ------------------------------------------ |
| Upstream                             | YosysHQ/PicoRV32                           |
| Pinned commit                        | `ef203c2b0a3fb793280f5114941416c425c5b461` |
| Core variant                         | Native memory interface, RV32IM            |
| Integer registers                    | 32 × 32 bits; x0 is always zero            |
| Multiplication / division            | Enabled                                    |
| Compressed instructions / interrupts | Disabled                                   |
| Cycle / instruction counters         | Enabled                                    |
| RAM                                  | 65,536 bytes, little endian                |
| Reset address                        | `0x00000000`                               |
| Initial stack pointer                | `0x00010000`, growing down into RAM        |

PicoRV32 is a multicycle processor. The displayed control states are its real `cpu_state` values: fetch, operand loading, execution, shifting, memory access, and trap. The conceptual cutaway explains the functional units; it is not a physical die layout. Retirement comes from the core's RVFI instrumentation. Reset clocks are excluded from the displayed user cycle count.

## Memory map and program format

| Address                   | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `0x00000000`–`0x0000ffff` | Shared program/data RAM                    |
| `0x10000000`              | Console: write the low character byte      |
| `0x10000004`              | GPIO: read/write the low eight output bits |
| `0x10000008`              | Read the eight input switch bits           |

Program imports are raw, little-endian **RV32IM binary images**, 1–65,536 bytes, loaded at address zero. ELF, Intel HEX, compressed RISC-V instructions, Linux executables, and programs expecting an operating system are not supported. Imported binaries should initialize any required runtime state and use this memory map. Locally assembled programs use `_start` at zero and the supplied linker script.

```asm
.section .text
.globl _start
_start:
    li t0, 0x10000004
    li t1, 0b10100101
    sw t1, 0(t0)       # illuminate four LEDs
    ebreak
```

## Build and verify

```powershell
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build and the same local simulation API. Run `npm run setup:sim` again after changing the simulator wrapper or C++ harness. The app is deliberately local-only; it does not create a hosted website or cloud account.

Tests exercise the compiled core, arithmetic and M-extension edge cases, branches and jumps, memory lanes and sign extension, deterministic stepping and reset, all examples, peripheral output, trace limits, invalid programs, and assembly diagnostics.

## Implementation

- `src/`: React/TypeScript interface, procedural Three.js scene, and CodeMirror editor.
- `server/`: local HTTP/WebSocket server, GNU assembler integration, and native process bridge.
- `sim/`: Verilog wrapper, C++ simulation harness, and linker script.
- `vendor/picorv32/`: unmodified upstream source, license, and pin metadata.
- `scripts/`: toolchain setup and native simulator build.
- `tests/`: hardware and API verification.

`POST /api/assemble` accepts `{ "source": "..." }` and returns program bytes, GNU disassembly/source mapping, or line diagnostics. `POST /api/disassemble` accepts `{ "image": [byte, ...] }` and decodes imported binaries with GNU objdump. `/api/simulation` is the WebSocket endpoint. Simulation commands and TypeScript snapshot shapes are defined in `src/types.ts` and implemented in the server bridge. The process protocol is local and bounded; simulation advances in short batches so Pause remains responsive.

## Credits

The visual direction takes inspiration from [Robotics Lab](https://robotics-lab-app.vercel.app/#uno). The project was selected from the [EEC open hardware directory](https://eec-club-hardware.netlify.app/).

Hardware: [PicoRV32](https://github.com/YosysHQ/picorv32). Simulation: [Verilator](https://verilator.org/). Assembly: [GNU Binutils](https://www.gnu.org/software/binutils/). Interface: React, Vite, Three.js, and CodeMirror. Fonts: DM Sans, DM Serif Display, and IBM Plex Mono, bundled through Fontsource. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

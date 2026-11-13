import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { root, linuxPath, linuxExec, linuxSpawn } from "./platform.mjs";

const assemblyCache = path.join(root, ".cache", "assembly");
const processLimits = ["--as=268435456", "--core=0"];
const toolLimits = [...processLimits, "--fsize=4194304", "--cpu=5"];
const runTool = (executable, args, options = {}) => linuxExec(
  "prlimit", [...toolLimits, "--", executable, ...args],
  { timeout: 10000, ...options },
);

function sourceDiagnostic(source) {
  // Check the original text conservatively, including comments and strings.
  // This also covers directives after labels/semicolons and preprocessing modes.
  // Macro expansion could otherwise construct an include directive at runtime.
  const forbidden = /\.(include|incbin|macro|irp|irpc|altmacro|noaltmacro|mri)\b|\\\r?\n|\0/i.exec(source);
  if (!forbidden) return null;
  return {
    line: source.slice(0, forbidden.index).split("\n").length,
    message: /^(?:include|incbin)$/i.test(forbidden[1] || "")
      ? "File include directives are unavailable. Keep the program in this editor."
      : "Assembler macros, line continuations, and embedded null bytes are unavailable. Use ordinary RV32IM instructions and data directives.",
  };
}

function toolFailure(error) {
  if (/SIGXFSZ|SIGXCPU|SIGKILL/.test(String(error.signal)) ||
      // WSL reports the terminating Linux signal directly as its exit code.
      [9, 24, 25, 137, 152, 153].includes(error.code) ||
      /file too large|file size limit exceeded|CPU time limit exceeded|memory exhausted|out of memory|cannot allocate memory/i.test(String(error.stderr || error.message)))
    return "The program exceeded the assembler resource limit. Reduce repeated data, large address gaps, or generated instructions; the board has 64 KiB of RAM.";
  return null;
}

function parseDisassembly(output, sourceLines = false) {
  const disassembly = [],
    lineMap = {};
  let sourceLine;
  for (const line of output.split("\n")) {
    const sourceMatch = sourceLines && line.match(/program\.s:(\d+)/);
    if (sourceMatch) sourceLine = Number(sourceMatch[1]);
    const match = line.match(/^\s*([0-9a-f]+):\s+([0-9a-f]{2,8})\s+(.+)$/i);
    if (!match) continue;
    const address = parseInt(match[1], 16);
    const entry = {
      address,
      hex: match[2],
      text: match[3].replace(/\s+/g, " ").trim(),
    };
    if (sourceLine) {
      entry.line = sourceLine;
      lineMap[address] = sourceLine;
    }
    disassembly.push(entry);
  }
  return { disassembly, lineMap };
}

export async function disassemble(image) {
  const invalid = {
    ok: false,
    diagnostics: [
      {
        line: 1,
        message:
          "Program must contain 1–65536 bytes with values from 0 to 255.",
      },
    ],
  };
  if (!Array.isArray(image) || !image.length || image.length > 65536)
    return invalid;
  for (const byte of image)
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return invalid;
  await mkdir(assemblyCache, { recursive: true });
  const directory = await mkdtemp(path.join(assemblyCache, "binary-"));
  const filename = path.join(directory, "program.bin");
  try {
    await writeFile(filename, Buffer.from(image));
    const { stdout } = await runTool(
      "riscv64-unknown-elf-objdump",
      [
        "-D",
        "-z",
        "-b",
        "binary",
        "-m",
        "riscv:rv32",
        "-M",
        "no-aliases",
        linuxPath(filename),
      ],
      { timeout: 10000 },
    );
    return { ok: true, disassembly: parseDisassembly(stdout).disassembly };
  } catch (error) {
    const detail = String(
      error.stderr || error.message || "Disassembly failed.",
    );
    const clean = detail
      .replaceAll(linuxPath(directory), "")
      .replaceAll(directory, "")
      .replaceAll(linuxPath(root), "[project]")
      .trim();
    return {
      ok: false,
      diagnostics: [
        {
          line: 1,
          message: /not found|ENOENT/.test(clean)
            ? "GNU RISC-V tools are missing. Run npm run setup:sim, then restart the lab."
            : toolFailure(error) || clean.slice(0, 1000),
        },
      ],
    };
  } finally {
    if (directory.startsWith(assemblyCache + path.sep))
      await rm(directory, { recursive: true, force: true });
  }
}

export async function assemble(source) {
  if (
    typeof source !== "string" ||
    Buffer.byteLength(source) > 65536 ||
    !source.trim()
  )
    return {
      ok: false,
      diagnostics: [
        { line: 1, message: "Enter an assembly program of up to 64 KiB." },
      ],
    };
  const forbidden = sourceDiagnostic(source);
  if (forbidden)
    return {
      ok: false,
      diagnostics: [forbidden],
    };
  await mkdir(assemblyCache, { recursive: true });
  const directory = await mkdtemp(path.join(assemblyCache, "program-"));
  const input = path.join(directory, "program.s");
  const object = path.join(directory, "program.o");
  const elf = path.join(directory, "program.elf");
  const binary = path.join(directory, "program.bin");
  try {
    await writeFile(input, source.endsWith("\n") ? source : source + "\n");
    await runTool(
      "riscv64-unknown-elf-as",
      [
        "-march=rv32im",
        "-mabi=ilp32",
        "-mno-relax",
        "-g",
        "--gdwarf-4",
        "-o",
        linuxPath(object),
        linuxPath(input),
      ],
      { timeout: 10000 },
    );
    await runTool(
      "riscv64-unknown-elf-ld",
      [
        "-m",
        "elf32lriscv",
        "--no-relax",
        "-T",
        linuxPath(path.join(root, "sim/linker.ld")),
        "-o",
        linuxPath(elf),
        linuxPath(object),
      ],
      { timeout: 10000 },
    );
    await runTool(
      "riscv64-unknown-elf-objcopy",
      ["-O", "binary", linuxPath(elf), linuxPath(binary)],
      { timeout: 10000 },
    );
    const image = [...(await readFile(binary))];
    if (!image.length || image.length > 65536)
      throw new Error("The assembled program must contain 1–65536 bytes.");
    const { stdout } = await runTool("riscv64-unknown-elf-objdump", [
      "-d",
      "-l",
      "-M",
      "no-aliases",
      linuxPath(elf),
    ]);
    const { disassembly, lineMap } = parseDisassembly(stdout, true);
    return { ok: true, image, disassembly, lineMap };
  } catch (error) {
    if (toolFailure(error))
      return { ok: false, diagnostics: [{ line: 1, message: toolFailure(error) }] };
    const detail = String(error.stderr || error.message || "Assembly failed.");
    const diagnostics = [];
    for (const line of detail.split("\n")) {
      const match = line.match(
        /program\.s:(\d+):(?:\d+:)?\s*(?:Error|Warning):\s*(.+)/i,
      );
      if (match)
        diagnostics.push({ line: Number(match[1]), message: match[2] });
    }
    if (!diagnostics.length) {
      const clean = detail
        .replaceAll(linuxPath(directory), "")
        .replaceAll(directory, "")
        .replaceAll(linuxPath(root), "[project]")
        .trim();
      diagnostics.push({
        line: 1,
        message: /not found|ENOENT/.test(clean)
          ? "GNU RISC-V tools are missing. Run npm run setup:sim, then restart the lab."
          : toolFailure(error) || clean.slice(0, 1000),
      });
    }
    return { ok: false, diagnostics: diagnostics.slice(0, 20) };
  } finally {
    // Every assembly gets an isolated directory under the project-owned cache.
    if (directory.startsWith(assemblyCache + path.sep))
      await rm(directory, { recursive: true, force: true });
  }
}

export async function createSimulator() {
  const executable = path.join(root, "build/picorv32-sim");
  try {
    await access(executable);
  } catch {
    throw new Error(
      "The hardware simulator is not built. Run npm run setup:sim, then restart the lab.",
    );
  }
  const child = linuxSpawn("prlimit", [...processLimits, "--", linuxPath(executable)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let closed = false,
    exited = false,
    closing,
    stderr = "",
    pending = [],
    serial = Promise.resolve();
  const lines = createInterface({ input: child.stdout });
  const rejectPending = (error) => {
    for (const task of pending.splice(0)) {
      clearTimeout(task.timeout);
      task.reject(error);
    }
  };
  lines.on("line", (line) => {
    const task = pending.shift();
    if (!task) return;
    clearTimeout(task.timeout);
    try {
      const response = JSON.parse(line);
      if (response.error) task.reject(new Error(response.error));
      else task.resolve(response);
    } catch {
      task.reject(
        new Error(
          "The simulator returned an invalid response. Restart the lab.",
        ),
      );
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  child.on("error", (error) => {
    closed = true;
    exited = true;
    rejectPending(
      new Error(`Could not start the hardware simulator: ${error.message}`),
    );
  });
  child.on("exit", (code) => {
    closed = true;
    exited = true;
    rejectPending(
      new Error(`Hardware simulator stopped (${code}). ${stderr}`.trim()),
    );
  });
  const request = (command) => {
    const payload = JSON.stringify(command) + "\n";
    if (Buffer.byteLength(payload) > 400000)
      return Promise.reject(new Error("Simulator command exceeds the 64 KiB program limit."));
    const result = serial.then(
      () =>
        new Promise((resolve, reject) => {
          if (closed)
            return reject(
              new Error(
                "Hardware simulator is closed. Reload the page to reconnect.",
              ),
            );
          const task = {
            resolve,
            reject,
            timeout: setTimeout(() => {
              closed = true;
              child.kill();
              rejectPending(
                new Error(
                  "Hardware simulator did not respond in time. Restart the lab.",
                ),
              );
            }, 15000),
          };
          pending.push(task);
          child.stdin.write(payload, (error) => {
            if (error) {
              closed = true;
              child.kill();
              rejectPending(error);
            }
          });
        }),
    );
    serial = result.catch(() => {});
    return result;
  };
  child.stdin.on("error", () => {}); // Write errors are reported through their command callback.
  const close = () => {
    if (closing) return closing;
    closed = true;
    rejectPending(new Error("Simulator connection closed."));
    closing = (async () => {
      if (!exited) {
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 1000);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          child.stdin.end();
        });
      }
      lines.close();
    })();
    return closing;
  };
  const simulator = { request, close };
  try {
    await request({ type: "snapshot" });
  } catch (error) {
    await close();
    throw error;
  }
  return simulator;
}

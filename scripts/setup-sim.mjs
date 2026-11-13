import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  root,
  linuxPath,
  linuxExec,
  linuxSpawn,
  isWindows,
  distro,
} from "../server/platform.mjs";
import path from "node:path";

function inherit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Setup command exited with code ${code}.`)),
    );
  });
}

try {
  console.log("PicoRV32 Lab · preparing the original hardware simulator");
  if (isWindows) await linuxExec("/usr/bin/true");
  const core = await readFile(path.join(root, "vendor/picorv32/picorv32.v"));
  const hash = createHash("sha256").update(core).digest("hex");
  if (
    hash !== "0836050971b3c6cdd28ac3b1e5719a67fb645161912bef1e472e63995ceb0622"
  )
    throw new Error(
      "The vendored PicoRV32 source does not match the pinned upstream commit.",
    );
  const tools = [
    "verilator",
    "g++",
    "make",
    "riscv64-unknown-elf-as",
    "riscv64-unknown-elf-ld",
    "riscv64-unknown-elf-objcopy",
    "riscv64-unknown-elf-objdump",
  ];
  let missing = false;
  for (const tool of tools) {
    try {
      await linuxExec("/usr/bin/which", [tool]);
    } catch {
      missing = true;
      break;
    }
  }
  try {
    await linuxExec("/usr/bin/test", ["-f", "/usr/include/nlohmann/json.hpp"]);
  } catch {
    missing = true;
  }
  if (missing) {
    console.log(
      "Installing Verilator, GNU RISC-V Binutils and C++ build dependencies from Ubuntu packages…",
    );
    const install =
      "set -eu; apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y verilator build-essential binutils-riscv64-unknown-elf nlohmann-json3-dev";
    await inherit(
      isWindows
        ? spawn(
            "wsl.exe",
            ["-d", distro, "-u", "root", "--", "bash", "-c", install],
            { stdio: "inherit", windowsHide: true },
          )
        : spawn(
            process.getuid?.() === 0 ? "bash" : "sudo",
            process.getuid?.() === 0
              ? ["-c", install]
              : ["bash", "-c", install],
            { stdio: "inherit" },
          ),
    );
  }
  console.log("Compiling the pinned RV32IM core (usually under a minute)…");
  await inherit(
    linuxSpawn(
      "bash",
      [linuxPath(path.join(root, "scripts/build-sim.sh")), linuxPath(root)],
      { stdio: "inherit" },
    ),
  );
  const { stdout: version } = await linuxExec("verilator", ["--version"]);
  await mkdir(path.join(root, "build"), { recursive: true });
  await writeFile(
    path.join(root, "build/simulator.json"),
    JSON.stringify(
      {
        commit: "ef203c2b0a3fb793280f5114941416c425c5b461",
        coreSha256: hash,
        verilator: version.trim(),
        configuration: "RV32IM, 32 registers, 64 KiB RAM, no C or IRQ",
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("Ready. Run npm run dev to open the local lab.");
} catch (error) {
  console.error(`Simulator setup failed: ${error.message}`);
  const detail = `${error.message} ${error.stdout || ""} ${error.stderr || ""}`.replaceAll("\0", "");
  if (
    isWindows &&
    ((error.code === "ENOENT" && error.path === "wsl.exe") ||
      /WSL_E_(?:DISTRO_NOT_FOUND|DEFAULT_DISTRO_NOT_FOUND|WSL_OPTIONAL_COMPONENT_REQUIRED)|HCS_E_HYPERV_NOT_INSTALLED|no distribution with the supplied name|no installed distributions/i.test(detail))
  )
    console.error(
      "Check that Ubuntu is installed with WSL. Set PICORV32_WSL_DISTRO if your distribution uses another name.",
    );
  process.exitCode = 1;
}

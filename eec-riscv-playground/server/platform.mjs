import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const isWindows = process.platform === "win32";
const execFileAsync = promisify(execFile);
export const distro = process.env.PICORV32_WSL_DISTRO || "Ubuntu";

export function linuxPath(filename) {
  const absolute = path.resolve(filename);
  return isWindows
    ? "/mnt/" +
        absolute[0].toLowerCase() +
        absolute.slice(2).replaceAll("\\", "/")
    : absolute;
}

export function linuxSpawn(executable, args = [], options = {}) {
  return isWindows
    ? spawn("wsl.exe", ["-d", distro, "--", executable, ...args], {
        cwd: root,
        windowsHide: true,
        ...options,
      })
    : spawn(executable, args, { cwd: root, ...options });
}

export async function linuxExec(executable, args = [], options = {}) {
  const defaults = {
    cwd: root,
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
  };
  return isWindows
    ? execFileAsync("wsl.exe", ["-d", distro, "--", executable, ...args], {
        ...defaults,
        ...options,
      })
    : execFileAsync(executable, args, { ...defaults, ...options });
}

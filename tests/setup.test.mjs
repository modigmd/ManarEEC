import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createSimulator } from "../server/simulator.mjs";

const execute = promisify(execFile);
const project = fileURLToPath(new URL("..", import.meta.url));

test(
  "simulator setup atomically replaces the binary while an existing instance is active",
  { timeout: 45000 },
  async () => {
    const existing = await createSimulator();
    let replacement;
    try {
      const before = await existing.request({ type: "stepCycle" });
      assert.equal(before.cycle, 1);
      const { stdout } = await execute(
        process.execPath,
        ["scripts/setup-sim.mjs"],
        {
          cwd: project,
          timeout: 40000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
      assert.match(stdout, /Built the original PicoRV32/);
      const after = await existing.request({ type: "stepCycle" });
      assert.equal(
        after.cycle,
        2,
        "the old executable continues running after replacement",
      );
      replacement = await createSimulator();
      const fresh = await replacement.request({ type: "stepCycle" });
      assert.equal(
        fresh.cycle,
        1,
        "new instances start from the replacement executable",
      );
    } finally {
      await existing.close();
      await replacement?.close();
    }
  },
);

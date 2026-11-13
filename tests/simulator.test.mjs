import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assemble, createSimulator } from "../server/simulator.mjs";
import { demos } from "../src/data.ts";

const timeout = 45_000;
const program = (body) =>
  `.section .text\n.globl _start\n_start:\n${body}\n    ebreak\n`;

async function withProgram(source, check) {
  const result = await assemble(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.image.length > 0 && result.image.length <= 65536);
  const sim = await createSimulator();
  try {
    await sim.request({ type: "load", image: result.image });
    await check(sim, result);
  } finally {
    await sim.close();
  }
}

async function finish(sim, maxCycles = 50_000) {
  let snapshot;
  for (let i = 0; i < maxCycles / 2000; i++) {
    snapshot = await sim.request({ type: "tick", cycles: 2000 });
    if (snapshot.halted) break;
  }
  assert.ok(snapshot.halted, "program must stop within the cycle budget");
  assert.match(snapshot.message, /EBREAK/i, snapshot.message);
  return snapshot;
}

test("vendored hardware matches the pinned upstream source", async () => {
  const content = await readFile(
    new URL("../vendor/picorv32/picorv32.v", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(content).digest("hex"),
    "0836050971b3c6cdd28ac3b1e5719a67fb645161912bef1e472e63995ceb0622",
  );
});

test(
  "arithmetic, signed and unsigned comparisons, jumps, and x0 execute in RTL",
  { timeout },
  async () => {
    await withProgram(
      program(`
    li t0, -12
    li t1, 5
    add a0, t0, t1
    sub a1, t1, t0
    slt a2, t0, t1
    sltu a3, t0, t1
    srai a4, t0, 2
    srli a5, t0, 2
    li zero, 999
    li a6, 0
    blt t0, t1, good
    li a6, 999
good:
    jal ra, subroutine
    j end
subroutine:
    addi a6, a6, 11
    ret
end:`),
      async (sim) => {
        const s = await finish(sim);
        assert.equal(s.regs[0], 0);
        assert.equal(s.regs[10], 0xfffffff9);
        assert.equal(s.regs[11], 17);
        assert.equal(s.regs[12], 1);
        assert.equal(s.regs[13], 0);
        assert.equal(s.regs[14], 0xfffffffd);
        assert.equal(s.regs[15], 0x3ffffffd);
        assert.equal(s.regs[16], 11);
        assert.equal(s.regs[2], 0x10000);
        assert.ok(s.cycle > s.retired, "PicoRV32 is a multicycle processor");
        assert.ok(s.trace.some((sample) => sample.retired));
      },
    );
  },
);

test(
  "multiplication and division edge cases follow the actual M extension",
  { timeout },
  async () => {
    await withProgram(
      program(`
    li t0, -7
    li t1, 3
    mul a0, t0, t1
    div a1, t0, t1
    rem a2, t0, t1
    div a3, t0, zero
    rem a4, t0, zero
    li t2, 0x80000000
    li t3, -1
    div a5, t2, t3
    mulhu a6, t2, t2`),
      async (sim) => {
        const s = await finish(sim);
        assert.deepEqual(
          s.regs.slice(10, 17),
          [
            0xffffffeb, 0xfffffffe, 0xffffffff, 0xffffffff, 0xfffffff9,
            0x80000000, 0x40000000,
          ],
        );
      },
    );
  },
);

test(
  "byte, halfword and word memory operations preserve lanes and sign extension",
  { timeout },
  async () => {
    await withProgram(
      program(`
    li t0, 0x200
    li t1, 0x80ff7f01
    sw t1, 0(t0)
    lb a0, 3(t0)
    lbu a1, 3(t0)
    lh a2, 2(t0)
    lhu a3, 2(t0)
    li t2, 0x55
    sb t2, 1(t0)
    lw a4, 0(t0)
    li t3, 0xfffc
    sw t1, 0(t3)
    lw a5, 0(t3)`),
      async (sim) => {
        const s = await finish(sim);
        assert.deepEqual(
          s.regs.slice(10, 16),
          [0xffffff80, 128, 0xffff80ff, 33023, 0x80ff5501, 0x80ff7f01],
        );
        const memory = await sim.request({
          type: "readMemory",
          address: 0x200,
        });
        assert.equal(memory.memory[0].value, 0x80ff5501);
      },
    );
  },
);

test(
  "step and reset are deterministic and clear execution history",
  { timeout },
  async () => {
    await withProgram(demos[0].source, async (sim) => {
      const initial = await sim.request({ type: "snapshot" });
      assert.equal(initial.cycle, 0);
      const cycle = await sim.request({ type: "stepCycle" });
      assert.equal(cycle.cycle, 1);
      const first = await sim.request({ type: "stepInstruction" });
      assert.equal(first.retired, 1);
      const second = await sim.request({ type: "stepInstruction" });
      assert.equal(second.retired, 2);
      await finish(sim);
      const reset = await sim.request({ type: "reset" });
      assert.equal(reset.cycle, 0);
      assert.equal(reset.retired, 0);
      assert.deepEqual(reset.trace, []);
      assert.equal(reset.console, "");
      assert.equal(reset.leds, 0);
      const afterReset = await sim.request({ type: "stepInstruction" });
      assert.equal(afterReset.retired, 1);
      assert.deepEqual(afterReset.regs, first.regs);
      assert.equal(afterReset.pc, first.pc);
    });
  },
);

for (const demo of demos.filter((d) => d.id !== "leds")) {
  test(`bundled example: ${demo.name}`, { timeout }, async () => {
    await withProgram(demo.source, async (sim, assembled) => {
      assert.ok(assembled.disassembly.length > 0);
      assert.ok(
        assembled.disassembly.some((line) => Number.isInteger(line.line)),
        "GNU debug line information maps to the editor",
      );
      const s = await finish(sim);
      if (demo.id === "hello")
        assert.deepEqual([s.regs[7], s.regs[28], s.regs[29]], [42, 245, 5]);
      if (demo.id === "fibonacci")
        assert.deepEqual([s.regs[10], s.regs[11], s.regs[5]], [55, 89, 0]);
      if (demo.id === "memory") {
        assert.equal(s.regs[10], 100);
        const memory = await sim.request({
          type: "readMemory",
          address: s.regs[5],
        });
        assert.equal(memory.memory[0].value, 100);
      }
      if (demo.id === "console") assert.equal(s.console, "Hello, RISC-V!\n");
    });
  });
}

test(
  "GPIO output and input use the documented memory map",
  { timeout },
  async () => {
    await withProgram(
      program(`
    li t0, 0x10000004
    li t1, 0xa5
    sw t1, 0(t0)
    lw a0, 4(t0)
    lw a1, 0(t0)`),
      async (sim) => {
        await sim.request({ type: "setInputs", value: 0x3c });
        const s = await finish(sim);
        assert.equal(s.leds, 0xa5);
        assert.equal(s.regs[10], 0x3c);
        assert.equal(s.regs[11], 0xa5);
      },
    );
  },
);

test(
  "chasing LEDs keep executing and trace storage stays bounded",
  { timeout },
  async () => {
    await withProgram(
      demos.find((d) => d.id === "leds").source,
      async (sim) => {
        const states = new Set();
        for (let i = 0; i < 8; i++)
          states.add((await sim.request({ type: "tick", cycles: 500 })).leds);
        const s = await sim.request({ type: "snapshot" });
        assert.equal(s.halted, false);
        assert.ok(states.size > 2);
        assert.ok(s.trace.length <= 512);
        assert.ok(s.retired > 100);
      },
    );
  },
);

test(
  "invalid instructions and invalid memory access stop with useful errors",
  { timeout },
  async () => {
    await withProgram(program("    .word 0xffffffff"), async (sim) => {
      const s = await sim.request({ type: "tick", cycles: 100 });
      assert.equal(s.halted, true);
      assert.equal(s.trap, true);
      assert.match(s.message, /trap|unsupported/i);
    });
    await withProgram(
      program("    li t0, 0x20000000\n    lw a0, 0(t0)"),
      async (sim) => {
        const s = await sim.request({ type: "tick", cycles: 100 });
        assert.equal(s.halted, true);
        assert.equal(s.status, "error");
        assert.match(s.message, /20000000/);
      },
    );
  },
);

test(
  "assembly diagnostics and program size validation reject invalid inputs",
  { timeout },
  async () => {
    const bad = await assemble(program("    this_is_not_an_instruction a0, 5"));
    assert.equal(bad.ok, false);
    assert.ok(bad.diagnostics.length > 0);
    assert.ok(bad.diagnostics.some((d) => d.line > 0));
    const sim = await createSimulator();
    try {
      await assert.rejects(
        sim.request({ type: "load", image: Array(65537).fill(0) }),
        /65536|large|bytes/i,
      );
      await assert.rejects(
        sim.request({ type: "load", image: [256] }),
        /byte|invalid/i,
      );
      await assert.rejects(
        sim.request({ type: "readMemory", address: 65536 }),
        /address|memory/i,
      );
    } finally {
      await sim.close();
    }
  },
);

test("the core catches misaligned word loads", { timeout }, async () => {
  await withProgram(
    program("    li t0, 0x200\n    lw a0, 1(t0)"),
    async (sim) => {
      const s = await sim.request({ type: "tick", cycles: 200 });
      assert.equal(s.halted, true);
      assert.equal(s.trap, true);
      assert.match(s.message, /misaligned|trap/i);
    },
  );
});

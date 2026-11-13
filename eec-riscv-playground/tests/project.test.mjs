import test from "node:test";
import assert from "node:assert/strict";
import { assemble, createSimulator } from "../server/simulator.mjs";
import { lessons, checkLesson } from "../src/curriculum.ts";

async function inLesson(id, run, change = (source) => source) {
  const lesson = lessons.find((item) => item.id === id);
  const built = await assemble(change(lesson.source));
  assert.equal(built.ok, true, JSON.stringify(built.diagnostics));
  const core = await createSimulator();
  try {
    await core.request({ type: "load", image: built.image });
    await core.request({ type: "setInputs", value: 0 });
    await run(core, built);
  } finally {
    await core.close();
  }
}

test(
  "the instruction replay is backed by actual RVFI operands and writeback",
  { timeout: 30000 },
  async () => {
    await inLesson("add", async (core) => {
      let s;
      for (let i = 0; i < 3; i++)
        s = await core.request({ type: "stepInstruction" });
      assert.equal(s.lastRetired.pc, 8);
      assert.equal(s.lastRetired.instruction, 0x006283b3);
      assert.deepEqual(
        [
          s.lastRetired.rs1,
          s.lastRetired.rs2,
          s.lastRetired.rs1Value,
          s.lastRetired.rs2Value,
        ],
        [5, 6, 7, 35],
      );
      assert.deepEqual([s.lastRetired.rd, s.lastRetired.rdValue], [7, 42]);
      assert.equal(checkLesson("add", s), true);
      assert.equal(s.lastRetired.cycle, s.cycle);
      const reset = await core.request({ type: "reset" });
      assert.equal(reset.lastRetired, null);
    });
  },
);

test(
  "the LED lesson records the real store address, mask, and data",
  { timeout: 30000 },
  async () => {
    await inLesson("led", async (core) => {
      const s = await core.request({ type: "tick", cycles: 500 });
      assert.equal(s.halted, true);
      assert.equal(checkLesson("led", s), true);
      assert.equal(s.leds, 42);
      assert.equal(s.lastRetired.memoryAddress, 0x10000004);
      assert.equal(s.lastRetired.memoryWriteMask, 15);
      assert.equal(s.lastRetired.memoryWriteData, 42);
      assert.equal(s.lastRetired.rd, 0);
    });
  },
);

test(
  "the input lesson reads switch zero and exposes the actual bus read",
  { timeout: 30000 },
  async () => {
    await inLesson("input", async (core) => {
      await core.request({ type: "setInputs", value: 1 });
      let read;
      for (let i = 0; i < 8; i++) {
        const s = await core.request({ type: "stepInstruction" });
        if (s.lastRetired?.memoryReadMask) {
          read = s.lastRetired;
          break;
        }
      }
      assert.ok(read);
      assert.equal(read.memoryAddress, 0x10000008);
      assert.equal(read.memoryReadData, 1);
      const finished = await core.request({ type: "tick", cycles: 500 });
      assert.equal(finished.regs[10], 1);
      assert.equal(checkLesson("input", finished), true);
      await core.request({ type: "reset" });
      await core.request({ type: "setInputs", value: 2 });
      const otherBit = await core.request({ type: "tick", cycles: 500 });
      assert.equal(otherBit.regs[10], 0);
      assert.equal(checkLesson("input", otherBit), false);
    });
  },
);

test(
  "the complete counter counts rising edges and ignores a held or released button",
  { timeout: 30000 },
  async () => {
    await inLesson("counter", async (core) => {
      let s = await core.request({ type: "tick", cycles: 1000 });
      assert.equal(s.regs[8], 0);
      assert.equal(checkLesson("counter", s), false);
      await core.request({ type: "setInputs", value: 1 });
      s = await core.request({ type: "tick", cycles: 1000 });
      assert.equal(s.regs[8], 1);
      assert.equal(s.leds, 1);
      assert.equal(checkLesson("counter", s), true);
      s = await core.request({ type: "tick", cycles: 1000 });
      assert.equal(s.leds, 1, "holding does not repeatedly increment");
      await core.request({ type: "setInputs", value: 0 });
      s = await core.request({ type: "tick", cycles: 1000 });
      assert.equal(s.leds, 1, "a release is not a new press");
      await core.request({ type: "setInputs", value: 1 });
      s = await core.request({ type: "tick", cycles: 1000 });
      assert.equal(s.regs[8], 2);
      assert.equal(s.leds, 2);
      assert.equal(s.halted, false);
    });
  },
);

test("the counter wraps from 255 to zero", { timeout: 30000 }, async () => {
  await inLesson(
    "counter",
    async (core) => {
      await core.request({ type: "tick", cycles: 500 });
      await core.request({ type: "setInputs", value: 1 });
      const s = await core.request({ type: "tick", cycles: 1000 });
      assert.equal(s.regs[8], 0);
      assert.equal(s.leds, 0);
    },
    (source) => source.replace("li   s0, 0 ", "li   s0, 255 "),
  );
});

test("checkpoints do not pass on empty or erroneous simulator state", () => {
  for (const lesson of lessons) {
    const empty = {
      retired: 0,
      regs: Array(32).fill(0),
      leds: 0,
      status: "paused",
    };
    assert.equal(checkLesson(lesson.id, empty), false);
    assert.equal(
      checkLesson(lesson.id, {
        ...empty,
        retired: 10,
        status: "error",
        regs: Array(32).fill(42),
        leds: 42,
      }),
      false,
    );
  }
});

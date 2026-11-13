import test from "node:test";
import assert from "node:assert/strict";
import {
  exampleRetirement,
  explainRetirement,
} from "../src/instruction-model.ts";

test("the addition explanation uses the core's recorded operands and result", () => {
  const explanation = explainRetirement(exampleRetirement);
  assert.equal(explanation.operation, "Add");
  assert.equal(explanation.equation, "7 + 35");
  assert.equal(explanation.resultValue, "42");
  assert.equal(explanation.resultLabel, "t2 · x7");
  const recorded = explainRetirement({ ...exampleRetirement, rdValue: 99 });
  assert.equal(
    recorded.resultValue,
    "99",
    "the UI must never silently substitute an emulated calculation",
  );
});

test("an immediate instruction shows its encoded immediate instead of an unused second register", () => {
  const explanation = explainRetirement({
    ...exampleRetirement,
    instruction: 0xfff28293,
    rs2: 0,
    rs2Value: 0,
    rd: 5,
    rdValue: 6,
  });
  assert.equal(explanation.operandB.label, "Encoded immediate");
  assert.equal(explanation.operandB.value, "-1");
  assert.equal(explanation.equation, "7 + -1");
});

test("memory stores display the recorded bus write without pretending to write a register", () => {
  const explanation = explainRetirement({
    ...exampleRetirement,
    instruction: 0x0062a023,
    rs1: 5,
    rs2: 6,
    rd: 0,
    rdValue: 0,
    memoryAddress: 0x10000004,
    memoryWriteMask: 15,
    memoryWriteData: 42,
  });
  assert.equal(explanation.operation, "Store to memory");
  assert.equal(explanation.resultLabel, "Memory write");
  assert.equal(explanation.resultValue, "42");
  assert.match(explanation.finalDetail, /No integer register/);
  assert.match(explanation.equation, /10000004/);
});

test("loads and branches describe their observed memory and control-flow effects", () => {
  const load = explainRetirement({
    ...exampleRetirement,
    instruction: 0x0002a503,
    rd: 10,
    rdValue: 255,
    memoryAddress: 512,
    memoryReadData: 255,
    memoryReadMask: 15,
  });
  assert.equal(load.operation, "Load from memory");
  assert.equal(load.resultValue, "255");
  const branch = explainRetirement({
    ...exampleRetirement,
    instruction: 0x00628463,
    rd: 0,
    nextPc: 16,
  });
  assert.equal(branch.operation, "Compare & branch");
  assert.equal(branch.resultLabel, "Branch taken");
  assert.equal(branch.resultValue, "0x00000010");
  assert.match(branch.finalDetail, /does not write/);
});

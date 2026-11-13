import type { RetiredInstruction } from "./types";
const ALIASES = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
];
export const hex = (n: number) =>
  `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
export const word = (n: number) =>
  n >>> 0 <= 999999 ? String(n >>> 0) : hex(n);
const register = (n: number) => `${ALIASES[n] ?? `x${n}`} · x${n}`;
const signExtend = (n: number, bits: number) =>
  (n << (32 - bits)) >> (32 - bits);

export const exampleRetirement: RetiredInstruction = {
  order: 0,
  cycle: 0,
  pc: 8,
  nextPc: 12,
  instruction: 0x006283b3,
  rs1: 5,
  rs2: 6,
  rs1Value: 7,
  rs2Value: 35,
  rd: 7,
  rdValue: 42,
  memoryAddress: 0,
  memoryReadMask: 0,
  memoryWriteMask: 0,
  memoryReadData: 0,
  memoryWriteData: 0,
};

/** The displayed calculation explains recorded RVFI values; it never emulates CPU execution. */
export function explainRetirement(record: RetiredInstruction) {
  const opcode = record.instruction & 0x7f;
  const funct3 = (record.instruction >>> 12) & 7;
  const funct7 = record.instruction >>> 25;
  const immediate = signExtend(record.instruction >>> 20, 12);
  let operation = "Execute";
  let equation = `${word(record.rs1Value)} · ${word(record.rs2Value)}`;
  let operandA = { label: register(record.rs1), value: word(record.rs1Value) };
  let operandB = { label: register(record.rs2), value: word(record.rs2Value) };
  let resultLabel = record.rd ? register(record.rd) : "Program counter";
  let resultValue = record.rd ? word(record.rdValue) : hex(record.nextPc);
  let finalDetail = record.rd
    ? `The recorded result is written to ${register(record.rd)}.`
    : `Execution continues at ${hex(record.nextPc)}; x0 remains zero.`;
  let memory = false;

  if (opcode === 0x33 || opcode === 0x13) {
    const right = opcode === 0x13 ? immediate : record.rs2Value;
    if (opcode === 0x13)
      operandB = { label: "Encoded immediate", value: String(immediate) };
    if (opcode === 0x33 && funct7 === 1) {
      operation = [
        "Multiply low",
        "Multiply high signed",
        "Multiply high signed/unsigned",
        "Multiply high unsigned",
        "Divide signed",
        "Divide unsigned",
        "Remainder signed",
        "Remainder unsigned",
      ][funct3];
      equation = `${word(record.rs1Value)} ${funct3 < 4 ? "×" : funct3 < 6 ? "÷" : "rem"} ${word(right)}`;
    } else {
      const subtract = opcode === 0x33 && funct3 === 0 && funct7 === 0x20;
      const arithmeticShift =
        funct3 === 5 && (record.instruction & 0x40000000) !== 0;
      operation = [
        subtract ? "Subtract" : "Add",
        "Shift left",
        "Compare signed",
        "Compare unsigned",
        "Bitwise XOR",
        arithmeticShift ? "Shift right signed" : "Shift right",
        "Bitwise OR",
        "Bitwise AND",
      ][funct3];
      const symbol = [
        subtract ? "−" : "+",
        "<<",
        "<",
        "< unsigned",
        "XOR",
        arithmeticShift ? ">> signed" : ">>",
        "OR",
        "AND",
      ][funct3];
      const shownRight = funct3 === 1 || funct3 === 5 ? right & 31 : right;
      if (opcode === 0x13 && (funct3 === 1 || funct3 === 5))
        operandB.value = String(shownRight);
      equation = `${word(record.rs1Value)} ${symbol} ${opcode === 0x13 ? shownRight : word(shownRight)}`;
    }
  } else if (opcode === 0x03) {
    memory = true;
    operation = "Load from memory";
    operandB = { label: "Address offset", value: String(immediate) };
    equation = `Read ${hex(record.memoryAddress)}`;
    finalDetail = `The memory read returned ${word(record.memoryReadData)}. The core writes the loaded value ${word(record.rdValue)} to ${register(record.rd)}.`;
  } else if (opcode === 0x23) {
    memory = true;
    operation = "Store to memory";
    equation = `Write ${hex(record.memoryAddress)}`;
    resultLabel = "Memory write";
    resultValue = word(record.memoryWriteData);
    finalDetail = `The store writes ${hex(record.memoryWriteData)} at ${hex(record.memoryAddress)} with byte mask ${record.memoryWriteMask.toString(2).padStart(4, "0")}. No integer register is written.`;
  } else if (opcode === 0x63) {
    operation = "Compare & branch";
    const comparison =
      ["=", "≠", "", "", "< signed", "≥ signed", "< unsigned", "≥ unsigned"][
        funct3
      ] || "compare";
    equation = `${word(record.rs1Value)} ${comparison} ${word(record.rs2Value)}`;
    resultLabel =
      record.nextPc !== (record.pc + 4) >>> 0
        ? "Branch taken"
        : "Next instruction";
    resultValue = hex(record.nextPc);
    finalDetail = `The recorded next program counter is ${hex(record.nextPc)}. A branch does not write an integer register.`;
  } else if (opcode === 0x6f || opcode === 0x67) {
    operation = opcode === 0x6f ? "Jump" : "Jump via register";
    equation = `PC → ${hex(record.nextPc)}`;
    operandA = {
      label: opcode === 0x6f ? "Current PC" : register(record.rs1),
      value: opcode === 0x6f ? hex(record.pc) : word(record.rs1Value),
    };
    operandB = { label: "Return address", value: hex((record.pc + 4) >>> 0) };
  } else if (opcode === 0x37 || opcode === 0x17) {
    const upper = (record.instruction & 0xfffff000) >>> 0;
    operation = opcode === 0x37 ? "Load upper immediate" : "Add PC & immediate";
    operandA = {
      label: opcode === 0x37 ? "Starting value" : "Current PC",
      value: opcode === 0x37 ? "0" : hex(record.pc),
    };
    operandB = { label: "Upper immediate", value: hex(upper) };
    equation =
      opcode === 0x37 ? hex(upper) : `${hex(record.pc)} + ${hex(upper)}`;
  } else if (opcode === 0x73) {
    operation = "Read hardware counter";
    equation = "Recorded counter value";
    operandA = { label: "CSR address", value: hex(record.instruction >>> 20) };
    operandB = { label: "Source", value: "Core counter" };
  } else if (opcode === 0x0f) {
    operation = "Memory ordering";
    equation = "Complete the ordering instruction";
  }
  return {
    opcode,
    operation,
    equation,
    operandA,
    operandB,
    resultLabel,
    resultValue,
    finalDetail,
    memory,
  };
}

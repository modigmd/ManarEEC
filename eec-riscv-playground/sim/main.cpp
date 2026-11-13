#include "Vlab_top.h"
#include "verilated.h"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <iomanip>
#include <iostream>
#include <memory>
#include <set>
#include <sstream>
#include <string>
#include <vector>

using json = nlohmann::json;

static std::string hex32(uint32_t v) {
  std::ostringstream out;
  out << "0x" << std::hex << std::setfill('0') << std::setw(8) << v;
  return out.str();
}

class Simulator {
  std::unique_ptr<Vlab_top> top;
  std::array<uint8_t, 65536> ram{};
  std::vector<uint8_t> image;
  std::deque<json> trace;
  uint64_t cycle = 0, retired = 0;
  uint32_t lastInstruction = 0, memoryAddress = 0;
  uint8_t leds = 0, inputs = 0;
  uint32_t ignoredBreakpoint = 0;
  uint64_t ignoredRetirement = 0;
  bool ignoringBreakpoint = false;
  bool halted = false, fault = false;
  std::string message, console;
  json lastRetired = nullptr;

  std::string state() const {
    switch (top->dbg_state) {
      case 128: return "trap";
      case 64: return "fetch";
      case 32: return "ld_rs1";
      case 16: return "ld_rs2";
      case 8: return "exec";
      case 4: return "shift";
      case 2: return "stmem";
      case 1: return "ldmem";
      default: return "reset";
    }
  }

  uint32_t word(uint32_t addr) const {
    addr &= ~3u;
    return uint32_t(ram[addr]) | uint32_t(ram[addr + 1]) << 8 |
      uint32_t(ram[addr + 2]) << 16 | uint32_t(ram[addr + 3]) << 24;
  }

  void tick() {
    if (halted) return;
    top->clk = 0;
    top->mem_ready = 0;
    top->eval();
    const bool valid = top->mem_valid;
    const bool write = top->mem_wstrb != 0;
    const uint32_t addr = top->mem_addr;
    const uint32_t data = top->mem_wdata;
    const uint8_t mask = top->mem_wstrb;
    uint32_t readData = 0;
    if (valid) {
      const uint32_t aligned = addr & ~3u;
      if (aligned < ram.size()) {
        readData = word(aligned);
        if (write) for (int i = 0; i < 4; ++i)
          if (mask & (1u << i)) ram[aligned + i] = (data >> (i * 8)) & 255;
      } else if (!top->mem_instr && aligned == 0x10000000) {
        if (mask & 1) {
          console += char(data & 255);
          if (console.size() > 8192) console.erase(0, console.size() - 8192);
        }
      } else if (!top->mem_instr && aligned == 0x10000004) {
        readData = leds;
        if (mask & 1) leds = data & 255;
      } else if (!top->mem_instr && aligned == 0x10000008 && !write) {
        readData = inputs;
      } else {
        halted = true;
        fault = true;
        message = std::string(write ? "Write" : "Read") + " outside the lab memory map at " + hex32(addr) + ". Reset or load another program.";
        return;
      }
      top->mem_rdata = readData;
      top->mem_ready = 1;
      top->eval();
    }
    top->clk = 1;
    top->eval();
    ++cycle;
    const bool didRetire = top->rvfi_valid && !top->rvfi_trap && top->rvfi_insn != 0x00100073;
    if (didRetire) {
      ++retired; lastInstruction = top->rvfi_insn;
      lastRetired = {
        {"order", retired}, {"cycle", cycle},
        {"pc", top->rvfi_pc_rdata}, {"nextPc", top->rvfi_pc_wdata},
        {"instruction", top->rvfi_insn},
        {"rs1", top->rvfi_rs1_addr}, {"rs2", top->rvfi_rs2_addr},
        {"rs1Value", top->rvfi_rs1_rdata}, {"rs2Value", top->rvfi_rs2_rdata},
        {"rd", top->rvfi_rd_addr}, {"rdValue", top->rvfi_rd_wdata},
        {"memoryAddress", top->rvfi_mem_addr},
        {"memoryReadMask", top->rvfi_mem_rmask}, {"memoryWriteMask", top->rvfi_mem_wmask},
        {"memoryReadData", top->rvfi_mem_rdata}, {"memoryWriteData", top->rvfi_mem_wdata}
      };
    }
    trace.push_back({{"cycle", cycle}, {"pc", top->dbg_pc}, {"state", state()},
      {"memValid", valid}, {"memReady", valid}, {"memWrite", valid && write},
      {"memAddr", addr}, {"memData", write ? data : readData}, {"retired", didRetire}});
    if (trace.size() > 512) trace.pop_front();
    if (top->trap) {
      halted = true;
      uint32_t pc = top->dbg_pc;
      uint32_t insn = pc < ram.size() ? word(pc) : 0;
      if (insn == 0x00100073) message = "Program complete — EBREAK at " + hex32(pc) + ".";
      else message = "Hardware trap at " + hex32(pc) + " (instruction " + hex32(insn) + "). Check unsupported instructions or misaligned accesses.";
    }
  }

 public:
  Simulator() { reset(); }
  void reset() {
    top = std::make_unique<Vlab_top>();
    ram.fill(0);
    std::copy(image.begin(), image.end(), ram.begin());
    leds = 0; cycle = 0; retired = 0; lastInstruction = 0;
    console.clear(); trace.clear(); halted = false; fault = false; message.clear(); lastRetired = nullptr;
    ignoringBreakpoint = false;
    top->resetn = 0; top->mem_ready = 0; top->mem_rdata = 0;
    for (int i = 0; i < 5; ++i) {
      top->clk = 0; top->eval(); top->clk = 1; top->eval();
    }
    top->clk = 0; top->resetn = 1; top->eval();
  }

  json snapshot() const {
    json regs = json::array();
    for (int i = 0; i < 32; ++i) regs.push_back(i ? top->dbg_regs[i] : 0);
    json memory = json::array();
    for (uint32_t i = memoryAddress; i < std::min(memoryAddress + 256u, 65536u); i += 4)
      memory.push_back({{"address", i}, {"value", word(i)}});
    return {{"cycle", cycle}, {"retired", retired}, {"pc", top->dbg_pc}, {"regs", regs},
      {"state", state()}, {"trap", bool(top->trap)}, {"halted", halted},
      {"status", fault ? "error" : halted ? "halted" : "paused"}, {"message", message},
      {"leds", leds}, {"inputs", inputs}, {"console", console}, {"memory", memory},
      {"trace", trace}, {"lastInstruction", lastInstruction}, {"lastRetired", lastRetired}};
  }

  json request(const json& command) {
    const std::string type = command.value("type", "snapshot");
    if (type == "load") {
      if (!command.contains("image") || !command["image"].is_array() || command["image"].empty() || command["image"].size() > 65536)
        throw std::runtime_error("Program must contain 1–65536 bytes.");
      std::vector<uint8_t> next;
      for (const auto& b : command["image"]) {
        if (!b.is_number_integer() || b.get<int>() < 0 || b.get<int>() > 255) throw std::runtime_error("Program contains an invalid byte.");
        next.push_back(b.get<uint8_t>());
      }
      image = std::move(next); memoryAddress = 0; reset();
    } else if (type == "reset") reset();
    else if (type == "stepCycle") { if (!halted) message.clear(); ignoringBreakpoint = false; tick(); }
    else if (type == "stepInstruction") {
      if (!halted) message.clear();
      ignoringBreakpoint = false;
      auto before = retired;
      for (int i = 0; i < 10000 && !halted && retired == before; ++i) tick();
      if (!halted && retired == before) {
        fault = true; halted = true; message = "Instruction did not finish within 10,000 cycles. Reset the processor.";
      }
    } else if (type == "tick") {
      int count = std::clamp(command.value("cycles", 1), 1, 2000);
      std::set<uint32_t> breakpoints;
      if (command.contains("breakpoints")) for (const auto& b : command["breakpoints"]) breakpoints.insert(b.get<uint32_t>());
      if (command.value("resume", false)) {
        ignoringBreakpoint = true; ignoredBreakpoint = top->dbg_pc; ignoredRetirement = retired;
        if (!halted) message.clear();
      }
      auto breakpointReached = [&]() {
        return breakpoints.find(top->dbg_pc) != breakpoints.end() &&
          (!ignoringBreakpoint || top->dbg_pc != ignoredBreakpoint || retired > ignoredRetirement);
      };
      if ((cycle == 0 || top->rvfi_valid) && breakpointReached()) {
        message = "Breakpoint reached at " + hex32(top->dbg_pc) + ".";
        return snapshot();
      }
      for (int i = 0; i < count && !halted; ++i) {
        tick();
        if (top->rvfi_valid && breakpointReached()) {
          message = "Breakpoint reached at " + hex32(top->dbg_pc) + ".";
          break;
        }
      }
    } else if (type == "setInputs") {
      inputs = command.value("value", 0) & 255;
    } else if (type == "readMemory") {
      auto address = command.value("address", 0);
      if (address < 0 || address >= 65536) throw std::runtime_error("Memory address must be within 0x00000000–0x0000ffff.");
      memoryAddress = uint32_t(address) & ~3u;
    } else if (type != "snapshot" && type != "pause") throw std::runtime_error("Unknown simulator command.");
    return snapshot();
  }
};

int main(int argc, char** argv) {
  Verilated::commandArgs(argc, argv);
  Simulator sim;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.size() > 500000) { std::cout << json({{"error", "Command too large."}}).dump() << std::endl; continue; }
    try { std::cout << sim.request(json::parse(line)).dump() << std::endl; }
    catch (const std::exception& e) { std::cout << json({{"error", e.what()}}).dump() << std::endl; }
  }
  return 0;
}

`timescale 1ns / 1ps
module lab_top (
  input clk,
  input resetn,
  input mem_ready,
  input [31:0] mem_rdata,
  output trap,
  output mem_valid,
  output mem_instr,
  output [31:0] mem_addr,
  output [31:0] mem_wdata,
  output [3:0] mem_wstrb,
  output [31:0] dbg_pc,
  output [7:0] dbg_state,
  output [31:0] dbg_regs [0:31],
  output rvfi_valid,
  output rvfi_trap,
  output [31:0] rvfi_insn,
  output [31:0] rvfi_pc_rdata,
  output [31:0] rvfi_pc_wdata,
  output [4:0] rvfi_rs1_addr,
  output [4:0] rvfi_rs2_addr,
  output [31:0] rvfi_rs1_rdata,
  output [31:0] rvfi_rs2_rdata,
  output [4:0] rvfi_rd_addr,
  output [31:0] rvfi_rd_wdata,
  output [31:0] rvfi_mem_addr,
  output [3:0] rvfi_mem_rmask,
  output [3:0] rvfi_mem_wmask,
  output [31:0] rvfi_mem_rdata,
  output [31:0] rvfi_mem_wdata
);
  picorv32 #(
    .ENABLE_COUNTERS(1), .ENABLE_COUNTERS64(1),
    .ENABLE_REGS_16_31(1), .ENABLE_REGS_DUALPORT(1),
    .ENABLE_MUL(1), .ENABLE_DIV(1), .COMPRESSED_ISA(0),
    .ENABLE_IRQ(0), .REGS_INIT_ZERO(1),
    .PROGADDR_RESET(32'h00000000), .STACKADDR(32'h00010000)
  ) cpu (
    .clk(clk), .resetn(resetn), .trap(trap),
    .mem_valid(mem_valid), .mem_instr(mem_instr),
    .mem_ready(mem_ready), .mem_rdata(mem_rdata),
    .mem_addr(mem_addr), .mem_wdata(mem_wdata), .mem_wstrb(mem_wstrb),
    .pcpi_wr(1'b0), .pcpi_rd(32'b0), .pcpi_wait(1'b0), .pcpi_ready(1'b0),
    .irq(32'b0),
    .rvfi_valid(rvfi_valid), .rvfi_trap(rvfi_trap), .rvfi_insn(rvfi_insn),
    .rvfi_pc_rdata(rvfi_pc_rdata), .rvfi_pc_wdata(rvfi_pc_wdata),
    .rvfi_rs1_addr(rvfi_rs1_addr), .rvfi_rs2_addr(rvfi_rs2_addr),
    .rvfi_rs1_rdata(rvfi_rs1_rdata), .rvfi_rs2_rdata(rvfi_rs2_rdata),
    .rvfi_rd_addr(rvfi_rd_addr), .rvfi_rd_wdata(rvfi_rd_wdata),
    .rvfi_mem_addr(rvfi_mem_addr), .rvfi_mem_rmask(rvfi_mem_rmask),
    .rvfi_mem_wmask(rvfi_mem_wmask), .rvfi_mem_rdata(rvfi_mem_rdata),
    .rvfi_mem_wdata(rvfi_mem_wdata)
  );
  assign dbg_pc = cpu.reg_pc;
  assign dbg_state = cpu.cpu_state;
  assign dbg_regs[0] = 32'b0;
  for (genvar i = 1; i < 32; i = i + 1) begin
    assign dbg_regs[i] = cpu.cpuregs[i];
  end
endmodule

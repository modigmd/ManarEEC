OUTPUT_ARCH(riscv)
ENTRY(_start)
MEMORY { RAM (rwx) : ORIGIN = 0, LENGTH = 64K }
SECTIONS {
  .text : { *(.text.start) *(.text .text.*) } > RAM
  .rodata : ALIGN(4) { *(.rodata .rodata.*) } > RAM
  .data : ALIGN(4) { *(.data .data.*) } > RAM
  .bss : ALIGN(4) { *(.bss .bss.* COMMON) } > RAM
  /DISCARD/ : { *(.comment) *(.riscv.attributes) }
}

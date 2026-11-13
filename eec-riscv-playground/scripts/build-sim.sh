#!/usr/bin/env bash
set -euo pipefail
project_root="$1"
build_dir="$(mktemp -d /tmp/picorv32-lab-build.XXXXXX)"
staged_binary=""
trap 'rm -rf -- "$build_dir"; if [[ -n "$staged_binary" ]]; then rm -f -- "$staged_binary"; fi' EXIT
cp -- "$project_root/sim/lab_top.sv" "$project_root/sim/main.cpp" "$project_root/vendor/picorv32/picorv32.v" "$build_dir/"
cd "$build_dir"
verilator --cc --exe --build -j 2 --top-module lab_top \
  -DRISCV_FORMAL -Wno-fatal -Wno-PINMISSING -Wno-WIDTH \
  -CFLAGS '-std=c++17 -O2' --Mdir obj_dir lab_top.sv picorv32.v main.cpp > build.log 2>&1 || { cat build.log; exit 1; }
mkdir -p -- "$project_root/build"
staged_binary="$(mktemp "$project_root/build/.picorv32-sim.XXXXXX")"
cp -- obj_dir/Vlab_top "$staged_binary"
chmod +x "$staged_binary"
# Replace the directory entry so running simulators retain their existing executable.
mv -f -- "$staged_binary" "$project_root/build/picorv32-sim"
staged_binary=""
printf 'Built the original PicoRV32 RV32IM hardware model.\n'
verilator --version

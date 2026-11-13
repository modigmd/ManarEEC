# Third-party notices

## PicoRV32

The unmodified core is vendored from https://github.com/YosysHQ/picorv32 at commit `ef203c2b0a3fb793280f5114941416c425c5b461`.

Copyright © 2015 Claire Xenia Wolf. Distributed under the ISC license. The complete license is preserved at `vendor/picorv32/LICENSE` and in the source file header. Source SHA-256: `0836050971b3c6cdd28ac3b1e5719a67fb645161912bef1e472e63995ceb0622`.

## Application libraries

React and React DOM (Meta), Vite (Evan You and contributors), Three.js (three.js authors), CodeMirror (Marijn Haverbeke and contributors), and ws (Einar Otto Stangvik and contributors) are used under their MIT licenses. Their notices are included in their installed npm packages. TypeScript is distributed under Apache-2.0. The dependency lockfile records the installed versions.

## Fonts

DM Sans, Montserrat, and IBM Plex Mono are distributed under the SIL Open Font License 1.1. Fontsource packages include the font license and copyright information. All fonts are served locally.

## EEC identity and instruction figure

The EEC emblem is copied from the original user-provided EEC directory at https://eec-club-hardware.netlify.app/ and remains an EEC identity asset. The local companion uses it at the user’s request; no ownership of the emblem is asserted.

The instruction backplane uses the provided Anatomy skill’s isometric toolkit, copied to `src/iso/iso-kit.ts` as permitted by that toolkit’s authoring workflow. The figure’s geometry, presentation, and instruction explanations are included in the application source.

The project export feature uses fflate (MIT license); its license is included in the installed package.

## Native toolchain

Verilator, GNU Binutils, GCC/build tools, and nlohmann/json are installed as Ubuntu packages by the setup script. Their upstream licenses and package copyright notices are available in `/usr/share/doc` inside the selected Linux environment. GNU assembler/linker tools run as separate local processes. nlohmann/json is MIT-licensed. The generated simulator includes the Verilator runtime under its upstream licensing terms.

## Visual assets

The board geometry, workbench props, textures, icons, and illustrations in this project are created procedurally in the application source. No models, photographs, or audio were copied from the design reference.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { BoardSceneProps, CameraView } from "./types";
import "./board-scene.css";

const PARTS = [
  {
    id: "cpu",
    name: "PicoRV32 core",
    number: "01",
    anchor: [0.35, 0.76, -0.05],
  },
  {
    id: "ram",
    name: "64 KiB memory",
    number: "02",
    anchor: [-1.85, 0.62, -0.15],
  },
  {
    id: "uart",
    name: "Serial interface",
    number: "03",
    anchor: [-3.3, 0.66, 1.15],
  },
  {
    id: "gpio",
    name: "Input / output",
    number: "04",
    anchor: [2.82, 0.64, -0.1],
  },
  {
    id: "clock",
    name: "System clock",
    number: "05",
    anchor: [0.68, 0.57, 1.43],
  },
  {
    id: "power",
    name: "Power & reset",
    number: "06",
    anchor: [-2.28, 0.6, 1.47],
  },
];

type Part = {
  id: string;
  group: THREE.Group;
  base: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
  anchor: THREE.Vector3;
};
type Lamp = { material: THREE.MeshStandardMaterial; light: THREE.PointLight };

export default function BoardScene(props: BoardSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const [unavailable, setUnavailable] = useState(false);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D virtual PicoRV32 demo board. Drag to orbit and scroll to zoom. Components are also available in the labeled component list.",
    );
    renderer.domElement.setAttribute("role", "img");
    container.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d1520");
    scene.fog = new THREE.Fog("#0d1520", 25, 57);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 120);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 6.5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.enablePan = true;
    controls.autoRotateSpeed = 0.24;
    controls.target.set(0, 0.42, 0);
    camera.position.set(6.6, 9.8, 11);
    camera.lookAt(controls.target);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentScene = new RoomEnvironment();
    const environment = pmrem.fromScene(environmentScene, 0.03);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.85;
    environmentScene.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xcce9ff, 0x1b2e44, 1.7));
    const sun = new THREE.DirectionalLight(0xe1efff, 3.2);
    sun.position.set(-5, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 11;
    sun.shadow.camera.bottom = -11;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00008;
    sun.shadow.radius = 4;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x75cfff, 1.15);
    fill.position.set(8, 6, -4);
    scene.add(fill);

    const mat = (
      color: THREE.ColorRepresentation,
      roughness = 0.65,
      metalness = 0,
    ): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const black = mat("#18212c", 0.8);
    const plastic = mat("#202b38", 0.5);
    const silver = mat("#a7bbc9", 0.28, 0.9);
    const gold = mat("#c5a65b", 0.26, 0.78);
    const cream = mat("#b8c9d7", 0.7);
    const green = mat("#155e88", 0.52, 0.12);
    const darkGreen = mat("#082f48", 0.7);
    const white = mat("#d5e8f4", 0.8);
    const textureList: THREE.Texture[] = [];
    const helperMaterials: THREE.Material[] = [];
    const mesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material | THREE.Material[],
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const box = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      radius = 0.025,
    ) =>
      mesh(
        new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(radius, w / 4, h / 4, d / 4),
        ),
        material,
        parent,
        x,
        y,
        z,
      );
    const cylinder = (
      parent: THREE.Object3D,
      r: number,
      height: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      radiusBottom = r,
    ) =>
      mesh(
        new THREE.CylinderGeometry(r, radiusBottom, height, 32),
        material,
        parent,
        x,
        y,
        z,
      );
    const lineTube = (
      parent: THREE.Object3D,
      points: THREE.Vector3[],
      radius: number,
      material: THREE.Material,
    ) =>
      mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          48,
          radius,
          8,
          false,
        ),
        material,
        parent,
      );
    const makeTexture = (
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D) => void,
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      draw(ctx);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      textureList.push(tex);
      return tex;
    };
    const print = (
      parent: THREE.Object3D,
      text: string,
      width: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      color = "#e1e9d8",
      size = 54,
    ) => {
      const tex = makeTexture(1024, 256, (ctx) => {
        ctx.clearRect(0, 0, 1024, 256);
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `500 ${size}px "IBM Plex Mono", monospace`;
        ctx.fillText(text, 512, 130);
      });
      const material = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      helperMaterials.push(material);
      const p = mesh(
        new THREE.PlaneGeometry(width, depth),
        material,
        parent,
        x,
        y,
        z,
      );
      p.rotation.x = -Math.PI / 2;
      p.castShadow = false;
      return p;
    };

    // The mat and all markings are drawn locally, so the scene works without a network.
    const deskTexture = makeTexture(1024, 1024, (ctx) => {
      ctx.fillStyle = "#131c29";
      ctx.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 210; i++) {
        ctx.strokeStyle = `rgba(63,89,119,${0.025 + (i % 5) * 0.008})`;
        ctx.lineWidth = (i % 3) + 1;
        ctx.beginPath();
        ctx.moveTo(0, i * 5);
        ctx.bezierCurveTo(
          250,
          i * 5 + Math.sin(i) * 20,
          660,
          i * 5 - 10,
          1024,
          i * 5 + 7,
        );
        ctx.stroke();
      }
    });
    deskTexture.wrapS = deskTexture.wrapT = THREE.RepeatWrapping;
    deskTexture.repeat.set(2, 2);
    const deskMat = new THREE.MeshStandardMaterial({
      map: deskTexture,
      roughness: 0.86,
    });
    box(scene, 80, 0.3, 60, 0, -0.34, 0, deskMat, 0.08);
    const cuttingTexture = makeTexture(2048, 1536, (ctx) => {
      ctx.fillStyle = "#182c3d";
      ctx.fillRect(0, 0, 2048, 1536);
      const step = 72;
      for (let i = 0; i < 2048; i += step) {
        ctx.strokeStyle = i % (step * 5) === 0 ? "#3a596d" : "#2b465b";
        ctx.lineWidth = i % (step * 5) === 0 ? 1.8 : 1;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 1536);
        ctx.stroke();
      }
      for (let i = 0; i < 1536; i += step) {
        ctx.strokeStyle = i % (step * 5) === 0 ? "#3a596d" : "#2b465b";
        ctx.lineWidth = i % (step * 5) === 0 ? 1.8 : 1;
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(2048, i);
        ctx.stroke();
      }
      ctx.strokeStyle = "#547185";
      ctx.lineWidth = 2;
      ctx.strokeRect(28, 28, 1992, 1480);
      ctx.font = "16px monospace";
      ctx.fillStyle = "#7893a6";
      for (let i = 1; i < 28; i++) ctx.fillText(String(i), i * step + 8, 22);
      for (let i = 1; i < 21; i++) ctx.fillText(String(i), 8, i * step + 18);
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#6d8ca2";
      ctx.beginPath();
      ctx.moveTo(0, 1536);
      ctx.lineTo(1536, 0);
      ctx.stroke();
      ctx.restore();
      ctx.font = "500 23px monospace";
      ctx.fillText("PRECISION CUTTING MAT", 1430, 1480);
      ctx.font = "15px monospace";
      ctx.fillText("A2  /  600 × 450 mm  /  SELF-HEALING", 1430, 1510);
    });
    const matMaterial = new THREE.MeshStandardMaterial({
      map: cuttingTexture,
      roughness: 0.94,
      metalness: 0,
    });
    box(scene, 25, 0.075, 18.75, 0, -0.125, 0, matMaterial, 0.15);
    const matPlane = mesh(
      new THREE.PlaneGeometry(25, 18.75),
      matMaterial,
      scene,
      0,
      -0.085,
      0,
    );
    matPlane.rotation.x = -Math.PI / 2;
    matPlane.castShadow = false;

    const board = new THREE.Group();
    board.position.y = 0.18;
    scene.add(board);
    const shape = new THREE.Shape();
    const bw = 7.6,
      bd = 4.65,
      bevel = 0.24;
    shape.moveTo(-bw / 2 + bevel, -bd / 2);
    shape.lineTo(bw / 2 - bevel, -bd / 2);
    shape.lineTo(bw / 2, -bd / 2 + bevel);
    shape.lineTo(bw / 2, bd / 2 - bevel);
    shape.lineTo(bw / 2 - bevel, bd / 2);
    shape.lineTo(-bw / 2 + bevel, bd / 2);
    shape.lineTo(-bw / 2, bd / 2 - bevel);
    shape.lineTo(-bw / 2, -bd / 2 + bevel);
    shape.closePath();
    const boardGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.13,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      steps: 1,
    });
    boardGeometry.rotateX(-Math.PI / 2);
    mesh(boardGeometry, [green, darkGreen], board);
    const boardTexture = makeTexture(2048, 1280, (ctx) => {
      ctx.fillStyle = "#12547d";
      ctx.fillRect(0, 0, 2048, 1280);
      // Etched routing follows 45-degree bends around the central processor.
      ctx.lineCap = "round";
      for (let i = 0; i < 52; i++) {
        const x = 790 + (i % 13) * 32,
          y = 350 + Math.floor(i / 13) * 125;
        const left = i % 2 === 0;
        ctx.strokeStyle =
          i % 7 === 0 ? "#74afbc" : i % 3 === 0 ? "#2d86ad" : "#216a93";
        ctx.lineWidth = i % 7 === 0 ? 3.4 : 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const bend = left ? 400 + (i % 9) * 20 : 1500 + (i % 9) * 20;
        ctx.lineTo(left ? x - 65 : x + 65, y);
        ctx.lineTo(bend, y + ((i % 5) - 2) * 52);
        ctx.lineTo(bend, 180 + (i % 15) * 62);
        ctx.lineTo(left ? 200 : 1870, 180 + (i % 15) * 62);
        ctx.stroke();
        ctx.fillStyle = "#93c4d2";
        ctx.beginPath();
        ctx.arc(bend, y + ((i % 5) - 2) * 52, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#8ac0d7";
      ctx.lineWidth = 2;
      ctx.strokeRect(55, 50, 1938, 1180);
      ctx.strokeStyle = "#b5d6e9";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(785, 315, 550, 550);
      ctx.strokeRect(300, 440, 300, 230);
      ctx.fillStyle = "#b9e0ef";
      ctx.font = "bold 39px monospace";
      ctx.fillText("PICO / RV32", 85, 1040);
      ctx.font = "19px monospace";
      ctx.fillText("OPEN HARDWARE · VIRTUAL DEMO BOARD", 85, 1080);
      ctx.fillText("RV32IM  /  64 KiB SRAM  /  REV. 01", 85, 1115);
      ctx.font = "bold 18px monospace";
      const words = [
        ["U1 · CPU", 825, 294],
        ["U2 · SRAM", 320, 415],
        ["Y1 · CLOCK", 1150, 1040],
        ["GPIO / INPUT", 1540, 540],
        ["STATUS", 1570, 1010],
        ["USB / UART", 85, 760],
        ["RESET", 470, 1040],
        ["3V3", 150, 1150],
        ["GND", 270, 1150],
      ] as const;
      words.forEach(([text, x, y]) => ctx.fillText(text, x, y));
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = "#c0deed";
        ctx.fillText(i % 4 === 0 ? "GND" : String(i), 100 + i * 85, 135);
      }
      ctx.fillStyle = "#b8d5e7";
      ctx.font = "19px monospace";
      ctx.fillText("BUILT TO BE UNDERSTOOD.", 1310, 1170);
      for (let i = 0; i < 90; i++) {
        const x = 60 + ((i * 137) % 1900),
          y = 170 + ((i * 83) % 900);
        ctx.strokeStyle = "#3f8bad";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    const surfaceMaterial = new THREE.MeshStandardMaterial({
      map: boardTexture,
      roughness: 0.54,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const boardSurface = mesh(
      new THREE.PlaneGeometry(7.48, 4.53),
      surfaceMaterial,
      board,
      0,
      0.148,
      0,
    );
    boardSurface.rotation.x = -Math.PI / 2;
    boardSurface.castShadow = false;
    const undersideTexture = makeTexture(2048, 1280, (ctx) => {
      ctx.fillStyle = "#0c3b5d";
      ctx.fillRect(0, 0, 2048, 1280);
      ctx.lineWidth = 2;
      for (let i = 0; i < 46; i++) {
        const x = 130 + i * 39,
          y = i % 2 === 0 ? 145 : 1130;
        ctx.strokeStyle = "#1b638d";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + (i % 2 === 0 ? 90 : -90));
        ctx.lineTo(800 + i * 8, 520 + (i % 7) * 45);
        ctx.stroke();
        ctx.fillStyle = "#c9b770";
        ctx.beginPath();
        ctx.ellipse(x, y, 13, 19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7e8c7d";
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#7bb3c9";
      ctx.font = "bold 47px monospace";
      ctx.fillText("PicoRV32 Lab", 670, 580);
      ctx.font = "22px monospace";
      ctx.fillText("VIRTUAL DEMO BOARD · REV. 01", 670, 625);
      ctx.fillText("ISC OPEN-SOURCE CORE", 670, 660);
      ctx.strokeStyle = "#4d95b6";
      ctx.strokeRect(58, 50, 1932, 1180);
    });
    const undersideMaterial = new THREE.MeshStandardMaterial({
      map: undersideTexture,
      roughness: 0.63,
      metalness: 0.1,
    });
    const underside = mesh(
      new THREE.PlaneGeometry(7.48, 4.53),
      undersideMaterial,
      board,
      0,
      -0.018,
      0,
    );
    underside.rotation.x = Math.PI / 2;
    underside.castShadow = false;

    const parts: Part[] = [];
    const partGroup = (id: string, x: number, z: number) => {
      const group = new THREE.Group();
      group.position.set(x, 0.15, z);
      group.userData.partId = id;
      board.add(group);
      const definition = PARTS.find((p) => p.id === id)!;
      const part = {
        id,
        group,
        base: group.position.clone(),
        materials: [] as THREE.MeshStandardMaterial[],
        anchor: new THREE.Vector3(
          ...(definition.anchor as [number, number, number]),
        ),
      };
      parts.push(part);
      return group;
    };
    // Mounting holes, plated rims, and the standoffs visible beneath the board.
    for (const x of [-3.43, 3.43])
      for (const z of [-1.96, 1.96]) {
        cylinder(board, 0.17, 0.025, x, 0.165, z, gold);
        cylinder(board, 0.103, 0.037, x, 0.184, z, black);
        cylinder(board, 0.12, 0.19, x, -0.083, z, silver);
        cylinder(board, 0.067, 0.008, x, 0.207, z, silver);
        box(board, 0.075, 0.006, 0.017, x, 0.213, z, black, 0.002);
      }
    // Header banks use separate sockets and pins to read clearly at oblique angles.
    const header = (
      parent: THREE.Object3D,
      count: number,
      x: number,
      z: number,
      direction = 1,
    ) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      parent.add(group);
      if (direction === -1) group.rotation.y = Math.PI / 2;
      box(group, count * 0.24 + 0.1, 0.36, 0.37, 0, 0.28, 0, plastic, 0.035);
      for (let i = 0; i < count; i++) {
        const px = (i - (count - 1) / 2) * 0.24;
        box(group, 0.125, 0.01, 0.125, px, 0.466, 0, black, 0.012);
        box(group, 0.062, 0.06, 0.062, px, 0.459, 0, gold, 0.004);
        box(group, 0.045, 0.22, 0.045, px, 0.04, 0, gold, 0.003);
      }
    };
    header(board, 12, -1.53, -1.98);
    header(board, 10, 1.63, -1.98);
    header(board, 8, 1.89, 1.98);

    const cpu = partGroup("cpu", 0.35, -0.08);
    box(cpu, 2.12, 0.1, 2.12, 0, 0.12, 0, plastic, 0.065);
    const cpuLid = new THREE.Group();
    cpu.add(cpuLid);
    box(cpuLid, 1.92, 0.25, 1.92, 0, 0.28, 0, black, 0.09);
    print(cpuLid, "PicoRV32", 1.7, 0.43, 0, 0.413, -0.19, "#d6d8cd", 88);
    print(cpuLid, "RISC-V", 1.45, 0.29, 0, 0.414, 0.18, "#aeb7ac", 53);
    print(
      cpuLid,
      "RV32IM · OPEN CORE",
      1.7,
      0.2,
      0,
      0.415,
      0.59,
      "#76867c",
      34,
    );
    cylinder(cpuLid, 0.053, 0.007, -0.76, 0.414, -0.76, mat("#a7b09f"));
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < 16; i++) {
        const pin = new THREE.Group();
        pin.rotation.y = (side * Math.PI) / 2;
        cpu.add(pin);
        const x = (i - 7.5) * 0.114;
        box(pin, 0.051, 0.065, 0.27, x, 0.08, 1.02, silver, 0.006);
        box(pin, 0.051, 0.045, 0.13, x, 0.031, 1.19, silver, 0.004);
        box(pin, 0.073, 0.01, 0.2, x, 0.008, 1.21, gold, 0.002);
      }
    }
    const die = new THREE.Group();
    cpu.add(die);
    const silicon = mat("#3e5964", 0.24, 0.6);
    box(die, 1.59, 0.055, 1.59, 0, 0.198, 0, silicon, 0.03);
    const blocks: {
      state: RegExp;
      object: THREE.Mesh;
      material: THREE.MeshStandardMaterial;
    }[] = [];
    const blockSpecs = [
      {
        x: -0.38,
        z: -0.4,
        w: 0.62,
        d: 0.44,
        name: "DECODE",
        color: "#b3a665",
        state: /fetch|decode/,
      },
      {
        x: 0.35,
        z: -0.35,
        w: 0.65,
        d: 0.54,
        name: "REGISTERS",
        color: "#679b94",
        state: /rs1|rs2|reg/,
      },
      {
        x: -0.36,
        z: 0.29,
        w: 0.62,
        d: 0.58,
        name: "ALU",
        color: "#bc9072",
        state: /exec|shift|alu/,
      },
      {
        x: 0.36,
        z: 0.36,
        w: 0.65,
        d: 0.45,
        name: "CONTROL",
        color: "#7890a1",
        state: /mem|trap|store|load/,
      },
    ];
    blockSpecs.forEach((spec) => {
      const material = mat(spec.color, 0.4, 0.42);
      const object = box(
        die,
        spec.w,
        0.07,
        spec.d,
        spec.x,
        0.26,
        spec.z,
        material,
        0.015,
      );
      blocks.push({ state: spec.state, object, material });
      print(
        die,
        spec.name,
        spec.w * 0.95,
        0.18,
        spec.x,
        0.302,
        spec.z,
        "#f3e9d4",
        48,
      );
      for (let i = 0; i < 5; i++)
        box(
          die,
          spec.w * 0.8,
          0.006,
          0.012,
          spec.x,
          0.304,
          spec.z - spec.d * 0.35 + i * 0.035,
          mat("#c7d4be", 0.4, 0.6),
          0.002,
        );
    });
    for (let i = 0; i < 16; i++) {
      const n = (i - 7.5) * 0.09;
      lineTube(
        die,
        [
          new THREE.Vector3(n, 0.2, 0.79),
          new THREE.Vector3(n, 0.31, 0.91),
          new THREE.Vector3(n, 0.13, 1.03),
        ],
        0.006,
        gold,
      );
      lineTube(
        die,
        [
          new THREE.Vector3(n, 0.2, -0.79),
          new THREE.Vector3(n, 0.31, -0.91),
          new THREE.Vector3(n, 0.13, -1.03),
        ],
        0.006,
        gold,
      );
    }

    const ram = partGroup("ram", -1.88, -0.1);
    box(ram, 0.9, 0.21, 1.72, 0, 0.18, 0, black, 0.04);
    print(ram, "SRAM", 0.8, 0.3, 0, 0.29, -0.18, "#a3aca0", 68);
    print(ram, "64 KiB", 0.8, 0.2, 0, 0.292, 0.2, "#7c8e80", 50);
    for (const side of [-1, 1])
      for (let i = 0; i < 14; i++) {
        box(
          ram,
          0.23,
          0.048,
          0.052,
          side * 0.51,
          0.075,
          (i - 6.5) * 0.112,
          silver,
          0.004,
        );
        box(
          ram,
          0.2,
          0.01,
          0.07,
          side * 0.59,
          0.008,
          (i - 6.5) * 0.112,
          gold,
          0.002,
        );
      }

    const uart = partGroup("uart", -3.3, 0.95);
    box(uart, 0.88, 0.54, 0.92, -0.17, 0.3, 0, silver, 0.06);
    box(uart, 0.04, 0.34, 0.67, -0.627, 0.3, 0, black, 0.015);
    box(uart, 0.055, 0.12, 0.43, -0.65, 0.28, 0, cream, 0.015);
    for (let i = 0; i < 5; i++)
      box(uart, 0.06, 0.022, 0.045, -0.68, 0.34, (i - 2) * 0.07, gold, 0.002);
    box(uart, 0.54, 0.15, 0.62, 0.65, 0.12, -0.26, black);
    for (const x of [0.32, 0.98])
      for (let i = 0; i < 6; i++)
        box(uart, 0.16, 0.03, 0.039, x, 0.045, -0.54 + i * 0.1, silver, 0.002);
    print(uart, "UART", 0.53, 0.15, 0.65, 0.203, -0.25, "#b5bcb0", 50);
    box(uart, 0.31, 0.04, 0.12, 0.56, 0.04, 0.38, white, 0.005);
    box(uart, 0.31, 0.04, 0.12, 0.56, 0.04, 0.65, white, 0.005);

    const gpio = partGroup("gpio", 2.85, -0.1);
    const lamps: Lamp[] = [];
    for (let i = 0; i < 8; i++) {
      const z = (i - 3.5) * 0.34;
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: "#a6deec",
        emissive: "#42daf2",
        emissiveIntensity: 0,
        roughness: 0.27,
        metalness: 0.12,
      });
      box(gpio, 0.26, 0.035, 0.19, -0.23, 0.045, z, cream, 0.012);
      box(gpio, 0.18, 0.06, 0.12, -0.23, 0.085, z, ledMaterial, 0.015);
      box(gpio, 0.38, 0.16, 0.22, 0.4, 0.115, z, mat("#dfd6c2"), 0.025);
      box(gpio, 0.11, 0.065, 0.15, 0.42, 0.225, z, black, 0.012);
      const light = new THREE.PointLight("#72e4f7", 0, 0.5, 2);
      light.position.set(-0.23, 0.19, z);
      gpio.add(light);
      lamps.push({ material: ledMaterial, light });
      box(gpio, 0.19, 0.035, 0.08, -0.68, 0.04, z, black, 0.006);
      for (const x of [-0.8, -0.56])
        box(gpio, 0.065, 0.035, 0.09, x, 0.04, z, silver, 0.003);
    }
    print(gpio, "OUTPUT", 0.67, 0.2, -0.35, 0.02, -1.64, "#c0e2f0", 43);
    print(gpio, "INPUT", 0.55, 0.2, 0.4, 0.02, -1.64, "#c0e2f0", 43);

    const clock = partGroup("clock", 0.72, 1.47);
    box(clock, 0.82, 0.09, 0.35, 0, 0.11, 0, silver, 0.15);
    box(clock, 0.9, 0.025, 0.43, 0, 0.04, 0, silver, 0.15);
    print(clock, "CLK", 0.59, 0.19, 0, 0.161, 0, "#5f6b65", 48);
    for (const x of [-0.54, 0.54])
      box(clock, 0.15, 0.035, 0.12, x, 0.03, 0, gold, 0.004);
    for (const x of [-0.26, 0.27]) {
      box(clock, 0.18, 0.04, 0.11, x, 0.04, 0.38, mat("#bda77a"), 0.007);
      for (const z of [0.31, 0.45])
        box(clock, 0.18, 0.04, 0.036, x, 0.04, z, silver, 0.003);
    }

    const power = partGroup("power", -1.89, 1.48);
    box(power, 0.58, 0.13, 0.52, 0, 0.12, 0, silver, 0.05);
    cylinder(power, 0.17, 0.13, 0, 0.25, 0, black);
    for (const x of [-0.35, 0.35])
      for (const z of [-0.18, 0.18])
        box(power, 0.14, 0.025, 0.075, x, 0.035, z, silver, 0.003);
    const capacitor = (
      parent: THREE.Object3D,
      x: number,
      z: number,
      radius = 0.16,
      height = 0.45,
    ) => {
      cylinder(parent, radius, height, x, height / 2 + 0.02, z, black);
      cylinder(parent, radius * 0.97, 0.025, x, height + 0.03, z, silver);
      box(
        parent,
        radius * 1.4,
        0.006,
        0.012,
        x,
        height + 0.046,
        z,
        mat("#64716c"),
        0.002,
      );
      box(
        parent,
        0.012,
        0.006,
        radius * 1.4,
        x,
        height + 0.047,
        z,
        mat("#64716c"),
        0.002,
      );
    };
    capacitor(power, -0.95, -0.02, 0.2, 0.6);
    capacitor(power, -1.41, -0.1, 0.16, 0.46);
    box(power, 0.44, 0.09, 0.55, -0.62, 0.075, -0.56, black);
    box(power, 0.49, 0.02, 0.23, -0.62, 0.026, -0.93, silver, 0.007);
    const onMaterial = new THREE.MeshStandardMaterial({
      color: "#3ba7ca",
      emissive: "#65ddf2",
      emissiveIntensity: 0.6,
      roughness: 0.22,
    });
    box(power, 0.15, 0.055, 0.09, -0.62, 0.06, 0.38, onMaterial, 0.012);

    // Small passives around the large ICs make scale and manufacturing details legible.
    const ceramic = mat("#bbaa7e", 0.65);
    for (let i = 0; i < 44; i++) {
      const side = i % 4,
        row = Math.floor(i / 4);
      const x = side < 2 ? -0.9 + row * 0.22 : side === 2 ? -0.92 : 1.67;
      const z = side < 2 ? (side === 0 ? -1.55 : 1.1) : -1.2 + row * 0.21;
      if (side > 1 && row > 9) continue;
      const passive = new THREE.Group();
      passive.position.set(x, 0.18, z);
      board.add(passive);
      if (side > 1) passive.rotation.y = Math.PI / 2;
      box(
        passive,
        0.15,
        0.045,
        0.073,
        0,
        0,
        0,
        i % 3 === 0 ? black : ceramic,
        0.004,
      );
      for (const px of [-0.08, 0.08])
        box(passive, 0.05, 0.045, 0.08, px, 0, 0, silver, 0.003);
    }
    print(board, "PicoRV32 Lab", 2.75, 0.4, -1.22, 0.163, 0.98, "#b1ddeb", 67);
    print(
      board,
      "VIRTUAL DEMONSTRATION SYSTEM",
      2.78,
      0.22,
      -1.17,
      0.164,
      1.22,
      "#76b5d2",
      35,
    );
    print(board, "01", 0.35, 0.23, 3.18, 0.163, 1.86, "#b6d7e6", 65);

    // Components cast onto their pads, with all selectable surfaces grouped by identity.
    parts.forEach((part) =>
      part.group.traverse((object) => {
        object.userData.partId = part.id;
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial)
              part.materials.push(material);
          });
        }
      }),
    );
    const footprintSpecs: Record<
      string,
      { width: number; depth: number; x?: number; z?: number }
    > = {
      cpu: { width: 2.6, depth: 2.6 },
      ram: { width: 1.5, depth: 1.95 },
      uart: { width: 1.85, depth: 1.25, x: 0.18 },
      gpio: { width: 1.55, depth: 3.15 },
      clock: { width: 1.35, depth: 0.85, z: 0.12 },
      power: { width: 2.0, depth: 1.15, x: -0.5 },
    };
    const footprints = parts.map((part) => {
      const spec = footprintSpecs[part.id];
      const texture = makeTexture(512, 512, (ctx) => {
        ctx.clearRect(0, 0, 512, 512);
        ctx.fillStyle = "#e3c98b22";
        ctx.fillRect(32, 32, 448, 448);
        ctx.strokeStyle = "#e2d3a3";
        ctx.lineWidth = 5;
        ctx.setLineDash([15, 10]);
        ctx.strokeRect(35, 35, 442, 442);
        ctx.setLineDash([]);
        ctx.fillStyle = "#d8b46d";
        for (let i = 0; i < 10; i++) {
          const p = 62 + i * 42;
          ctx.fillRect(p, 14, 17, 45);
          ctx.fillRect(p, 453, 17, 45);
          if (part.id === "cpu") {
            ctx.fillRect(14, p, 45, 17);
            ctx.fillRect(453, p, 45, 17);
          }
        }
        ctx.fillStyle = "#e4dfb6";
        ctx.font = "500 34px monospace";
        ctx.textAlign = "center";
        ctx.fillText(part.id.toUpperCase(), 256, 250);
        ctx.font = "22px monospace";
        ctx.fillText("PLACE HERE", 256, 285);
      });
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        roughness: 0.7,
        metalness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      });
      const footprint = mesh(
        new THREE.PlaneGeometry(spec.width, spec.depth),
        material,
        board,
        part.base.x + (spec.x ?? 0),
        0.171,
        part.base.z + (spec.z ?? 0),
      );
      footprint.rotation.x = -Math.PI / 2;
      footprint.castShadow = false;
      footprint.userData.partId = part.id;
      footprint.visible = false;
      return footprint;
    });
    const selectionRing = mesh(
      new THREE.RingGeometry(0.09, 0.115, 40),
      new THREE.MeshBasicMaterial({
        color: "#f4e8ad",
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
      scene,
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.castShadow = false;
    selectionRing.visible = false;
    selectionRing.renderOrder = 30;

    // A solder spool, leads, and hand tools establish a real electronics bench.
    const spool = new THREE.Group();
    spool.position.set(-4.9, 0, -5.2);
    scene.add(spool);
    cylinder(spool, 1.25, 0.11, 0, 0.09, 0, cream);
    cylinder(spool, 0.91, 1.08, 0, 0.67, 0, mat("#8a8d86", 0.3, 0.8));
    for (let i = 0; i < 32; i++) {
      const ring = mesh(
        new THREE.TorusGeometry(0.91, 0.016, 5, 50),
        silver,
        spool,
        0,
        0.17 + i * 0.031,
        0,
      );
      ring.rotation.x = Math.PI / 2;
    }
    cylinder(spool, 1.25, 0.12, 0, 1.25, 0, cream);
    cylinder(spool, 0.3, 0.13, 0, 1.26, 0, black);
    const spoolPrint = print(
      spool,
      "SOLDER / 0.8 mm",
      1.7,
      0.38,
      0,
      1.317,
      -0.54,
      "#5a6459",
      45,
    );
    spoolPrint.rotation.z = -0.5;
    lineTube(
      scene,
      [
        new THREE.Vector3(-4.2, 0.2, -4.4),
        new THREE.Vector3(-3.3, 0.06, -3.5),
        new THREE.Vector3(-1.3, 0.03, -3.7),
        new THREE.Vector3(-0.6, 0.025, -2.9),
      ],
      0.018,
      silver,
    );

    const redRubber = mat("#ae4e38", 0.55);
    const grayRubber = mat("#303b39", 0.65);
    const probe = (
      x: number,
      z: number,
      angle: number,
      material: THREE.Material,
      sign: number,
    ) => {
      const group = new THREE.Group();
      group.position.set(x, 0.18, z);
      group.rotation.y = angle;
      scene.add(group);
      const body = cylinder(group, 0.12, 2.6, 0, 0, 0, material, 0.15);
      body.rotation.z = Math.PI / 2;
      const grip = cylinder(group, 0.17, 1.0, -0.45, 0, 0, material);
      grip.rotation.z = Math.PI / 2;
      const rim = cylinder(group, 0.22, 0.09, -1.06, 0, 0, material);
      rim.rotation.z = Math.PI / 2;
      const tip = cylinder(group, 0.028, 1.1, -1.8, 0, 0, silver);
      tip.rotation.z = Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const ring = mesh(
          new THREE.TorusGeometry(0.158, 0.015, 5, 18),
          material,
          group,
          -0.8 + i * 0.14,
          0,
          0,
        );
        ring.rotation.y = Math.PI / 2;
      }
      lineTube(
        scene,
        [
          new THREE.Vector3(
            x + 1.22 * Math.cos(angle),
            0.16,
            z - 1.22 * Math.sin(angle),
          ),
          new THREE.Vector3(x + 3.6, 0.06, z + sign * 0.2),
          new THREE.Vector3(x + 4.3, 0.08, z - 2),
          new THREE.Vector3(x + 3.8, 0.08, z - 4),
        ],
        0.067,
        material,
      );
    };
    probe(4.4, -5.0, -0.12, redRubber, 1);
    probe(4.9, -5.7, -0.08, grayRubber, -1);

    const tweezers = new THREE.Group();
    tweezers.position.set(-3.9, 0.06, 4.9);
    tweezers.rotation.y = -0.45;
    scene.add(tweezers);
    for (const sign of [-1, 1]) {
      const arm = box(
        tweezers,
        0.17,
        0.06,
        3.7,
        sign * 0.15,
        0.08,
        0,
        silver,
        0.04,
      );
      arm.rotation.y = sign * -0.065;
      box(tweezers, 0.1, 0.035, 0.7, sign * 0.04, 0.04, -2.1, silver, 0.03);
    }
    box(tweezers, 0.43, 0.07, 0.3, 0, 0.08, 1.7, silver, 0.04);
    const cableMat = mat("#7f94a5", 0.72);
    lineTube(
      scene,
      [
        new THREE.Vector3(-4.25, 0.47, 0.95),
        new THREE.Vector3(-5.4, 0.18, 1.1),
        new THREE.Vector3(-6.1, 0.08, 2.6),
        new THREE.Vector3(-8.7, 0.08, 3.6),
        new THREE.Vector3(-11, 0.15, 3),
      ],
      0.12,
      cableMat,
    );
    const usbPlug = new THREE.Group();
    usbPlug.position.set(-4.15, 0.45, 0.95);
    scene.add(usbPlug);
    box(usbPlug, 0.7, 0.35, 0.6, 0, 0, 0, cableMat, 0.11);
    for (let i = 0; i < 4; i++)
      box(usbPlug, 0.06, 0.35, 0.63, -0.15 + i * 0.11, 0, 0, cream, 0.02);

    const jumper = new THREE.Group();
    jumper.position.set(5.1, 0.05, 3.1);
    jumper.rotation.y = -0.4;
    scene.add(jumper);
    lineTube(
      jumper,
      [
        new THREE.Vector3(-1.4, 0.04, 0),
        new THREE.Vector3(-0.4, 0.14, -0.2),
        new THREE.Vector3(0.6, 0.06, 0.15),
        new THREE.Vector3(1.7, 0.08, -0.25),
      ],
      0.033,
      mat("#c58a43", 0.62),
    );
    for (const [x, z] of [
      [-1.5, 0],
      [1.78, -0.25],
    ]) {
      box(jumper, 0.43, 0.15, 0.17, x, 0.12, z, black, 0.018);
      box(
        jumper,
        0.33,
        0.035,
        0.035,
        x + (x < 0 ? -0.36 : 0.36),
        0.12,
        z,
        silver,
        0.002,
      );
    }

    let width = 1,
      height = 1,
      frame = 0,
      disposed = false;
    let inViewport = false;
    let desiredCamera = camera.position.clone();
    let desiredTarget = controls.target.clone();
    let cameraMoving = false;
    let previousView = "";
    const preset = (view: CameraView, compact: boolean) => {
      const distance =
        (compact ? 0.9 : 1) * (width < 650 && !compact ? 1.6 : 1);
      if (view === "top")
        return new THREE.Vector3(0, 15, 0.001).multiplyScalar(distance);
      if (view === "bottom")
        return new THREE.Vector3(5.5, 11.4, 10).multiplyScalar(distance);
      if (view === "front")
        return new THREE.Vector3(0.05, 4.1, 14.1).multiplyScalar(distance);
      return new THREE.Vector3(6.6, 9.8, 11).multiplyScalar(distance);
    };
    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.clearViewOffset();
      if (!props.compact && width > 850)
        camera.setViewOffset(width, height, -width * 0.18, 0, width, height);
      else if (!props.compact && width < 650)
        camera.setViewOffset(width, height, 0, -height * 0.12, width, height);
      camera.fov = width < 650 ? 43 : 35;
      camera.updateProjectionMatrix();
      previousView = "";
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const visibilityObserver = new IntersectionObserver((entries) => {
      inViewport = entries.some((entry) => entry.isIntersecting);
    });
    visibilityObserver.observe(container);
    controls.addEventListener("start", () => {
      cameraMoving = false;
    });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5)
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const targets = [
        ...parts.filter((part) => part.group.visible).map((part) => part.group),
        ...footprints.filter((footprint) => footprint.visible),
      ];
      const hits = raycaster.intersectObjects(targets, true);
      const visibleInScene = (object: THREE.Object3D): boolean =>
        object.visible && (!object.parent || visibleInScene(object.parent));
      const id = hits.find(
        (hit) => visibleInScene(hit.object) && hit.object.userData.partId,
      )?.object.userData.partId as string | undefined;
      if (id && live.current.assemblyMode) live.current.onPlacePart?.(id);
      else live.current.onSelectPart(id ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastTime = performance.now();
    const frameLoop = (time: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(frameLoop);
      if (!inViewport || document.hidden || !width || !height) {
        lastTime = time;
        return;
      }
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const current = live.current;
      const viewKey = `${current.camera}/${current.selectedPart ?? ""}/${current.compact ? "c" : "h"}`;
      if (previousView !== viewKey) {
        previousView = viewKey;
        const selected = parts.find((p) => p.id === current.selectedPart);
        desiredTarget = selected
          ? selected.group
              .getWorldPosition(new THREE.Vector3())
              .add(new THREE.Vector3(0, 0.28, 0))
          : new THREE.Vector3(0, current.camera === "bottom" ? 2.25 : 0.42, 0);
        desiredCamera = selected
          ? desiredTarget.clone().add(new THREE.Vector3(3.8, 5.4, 5.7))
          : preset(current.camera, !!current.compact);
        cameraMoving = true;
      }
      const smoothing = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 6);
      if (cameraMoving) {
        camera.position.lerp(desiredCamera, smoothing);
        controls.target.lerp(desiredTarget, smoothing);
        if (camera.position.distanceTo(desiredCamera) < 0.012) {
          camera.position.copy(desiredCamera);
          controls.target.copy(desiredTarget);
          cameraMoving = false;
        }
      }
      controls.autoRotate =
        current.rotate &&
        !cameraMoving &&
        !current.selectedPart &&
        !current.assemblyMode &&
        !reducedMotion.matches;
      controls.update(dt);
      const boardRotation = current.camera === "bottom" ? Math.PI : 0;
      const boardHeight = current.camera === "bottom" ? 2.25 : 0.18;
      let movingGeometry =
        Math.abs(board.rotation.x - boardRotation) > 0.001 ||
        Math.abs(board.position.y - boardHeight) > 0.001;
      board.rotation.x = THREE.MathUtils.lerp(
        board.rotation.x,
        boardRotation,
        smoothing,
      );
      board.position.y = THREE.MathUtils.lerp(
        board.position.y,
        boardHeight,
        smoothing,
      );
      board.updateMatrixWorld(true);
      parts.forEach((part, index) => {
        const assembled =
          !current.assemblyMode ||
          (current.assemblyPlaced ?? []).includes(part.id);
        const heightOffset = current.exploded ? 0.75 + index * 0.19 : 0;
        const partHeight = part.base.y + (assembled ? heightOffset : 0.7);
        movingGeometry ||=
          part.group.visible !== assembled ||
          Math.abs(part.group.position.y - partHeight) > 0.001;
        part.group.visible = assembled;
        footprints[index].visible = !!current.assemblyMode && !assembled;
        part.group.position.y = THREE.MathUtils.lerp(
          part.group.position.y,
          partHeight,
          smoothing,
        );
        const label = labelRefs.current[index];
        if (label) {
          const anchor = part.anchor.clone();
          anchor.y += current.assemblyMode ? 0 : heightOffset;
          anchor.applyMatrix4(board.matrixWorld);
          anchor.project(camera);
          label.style.transform = `translate(-50%, -100%) translate(${(anchor.x * 0.5 + 0.5) * width}px, ${(-anchor.y * 0.5 + 0.5) * height}px)`;
          label.style.opacity =
            (current.labels || current.assemblyMode) && anchor.z < 1
              ? "1"
              : "0";
          label.style.pointerEvents =
            current.labels || current.assemblyMode ? "auto" : "none";
          label.setAttribute(
            "aria-hidden",
            !current.labels && !current.assemblyMode ? "true" : "false",
          );
          label.tabIndex = current.labels || current.assemblyMode ? 0 : -1;
          label.dataset.selected = String(current.selectedPart === part.id);
          label.dataset.placed = String(assembled);
        }
      });
      movingGeometry ||=
        Math.abs(cpuLid.position.y - (current.cutaway ? 1.65 : 0)) > 0.001;
      cpuLid.position.y = THREE.MathUtils.lerp(
        cpuLid.position.y,
        current.cutaway ? 1.65 : 0,
        smoothing,
      );
      cpuLid.rotation.z = THREE.MathUtils.lerp(
        cpuLid.rotation.z,
        current.cutaway ? -0.08 : 0,
        smoothing,
      );
      die.visible = current.cutaway || current.exploded;
      blocks.forEach((block) => {
        const active =
          current.cutaway && block.state.test(current.cpuState.toLowerCase());
        block.material.emissive.set(active ? "#77d8f5" : "#000000");
        block.material.emissiveIntensity = active ? 0.45 : 0;
      });
      lamps.forEach((lamp, i) => {
        const lit = (current.leds & (1 << i)) !== 0;
        lamp.material.emissiveIntensity = lit ? 2.8 : 0.02;
        lamp.material.color.set(lit ? "#82ebff" : "#39576a");
        lamp.light.intensity = lit ? 0.085 : 0;
      });
      const selected = parts.find((p) => p.id === current.selectedPart);
      selectionRing.visible = !!selected;
      if (selected) {
        selectionRing.position
          .copy(selected.group.getWorldPosition(new THREE.Vector3()))
          .add(new THREE.Vector3(0, 0.005, 0));
        selectionRing.scale.setScalar(
          selected.id === "cpu" ? 12 : selected.id === "ram" ? 8.5 : 6,
        );
      }
      if (movingGeometry) renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(frameLoop);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibilityObserver.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>(helperMaterials);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textureList.forEach((texture) => texture.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [props.compact]);

  return (
    <div
      ref={host}
      className={`board-scene${props.compact ? " board-scene--compact" : ""}`}
    >
      {unavailable ? (
        <div className="scene-fallback">
          <span className="scene-fallback-chip">RV</span>
          <h3>The workbench needs WebGL 2</h3>
          <p>
            Enable hardware acceleration or try a recent browser. The assembly
            editor, processor simulation, lessons, and component list remain
            available.
          </p>
        </div>
      ) : (
        <div className="scene-labels" aria-label="Board components">
          {PARTS.map((part, index) => (
            <button
              key={part.id}
              type="button"
              className="scene-part-label"
              tabIndex={props.labels || props.assemblyMode ? 0 : -1}
              aria-hidden={!props.labels && !props.assemblyMode}
              ref={(el) => {
                labelRefs.current[index] = el;
              }}
              onClick={() =>
                props.assemblyMode
                  ? props.onPlacePart?.(part.id)
                  : props.onSelectPart(
                      props.selectedPart === part.id ? null : part.id,
                    )
              }
              aria-label={`${part.name}${props.assemblyMode && !(props.assemblyPlaced ?? []).includes(part.id) ? " — place component" : ""}`}
            >
              <span>{part.number}</span>
              {part.name}
              <i />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { assemble, disassemble, createSimulator } from "./simulator.mjs";
import { root } from "./platform.mjs";

const production = process.argv.includes("--production");
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set(
  [...allowedHosts].map((host) => `http://${host}`),
);
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: 400000 });
const sessions = new Set();
let vite,
  assemblies = 0,
  shuttingDown = false;

function localRequest(request) {
  return (
    allowedHosts.has(request.headers.host) &&
    (!request.headers.origin || allowedOrigins.has(request.headers.origin))
  );
}

function respond(response, code, body) {
  response.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJSON(request, limit = 200000) {
  let size = 0,
    chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit)
      throw new Error("Request is too large. Maximum program size is 64 KiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

if (!production) {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
} else {
  try {
    await stat(path.join(root, "dist/index.html"));
  } catch {
    throw new Error("Production files are missing. Run npm run build first.");
  }
}

server.on("request", async (request, response) => {
  if (!localRequest(request))
    return respond(response, 403, {
      error: "This lab accepts requests from its local browser origin only.",
    });
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/api/health") {
    let simulator = true;
    try {
      await stat(path.join(root, "build/picorv32-sim"));
    } catch {
      simulator = false;
    }
    return respond(response, 200, {
      ok: true,
      simulator,
      core: "PicoRV32",
      configuration: "RV32IM",
      commit: "ef203c2b0a3fb793280f5114941416c425c5b461",
    });
  }
  if (url.pathname === "/api/assemble" || url.pathname === "/api/disassemble") {
    if (request.method !== "POST")
      return respond(response, 405, {
        ok: false,
        diagnostics: [{ line: 1, message: "Use POST with a program." }],
      });
    if (!request.headers["content-type"]?.includes("application/json"))
      return respond(response, 415, {
        ok: false,
        diagnostics: [{ line: 1, message: "Program requests must use JSON." }],
      });
    if (assemblies >= 2)
      return respond(response, 429, {
        ok: false,
        diagnostics: [
          {
            line: 1,
            message: "The program tools are busy. Try again in a moment.",
          },
        ],
      });
    assemblies++;
    try {
      const binary = url.pathname === "/api/disassemble";
      const body = await readJSON(request, binary ? 400000 : 200000);
      const result = binary
        ? await disassemble(body.image)
        : await assemble(body.source);
      return respond(response, result.ok ? 200 : 400, result);
    } catch (error) {
      return respond(response, 400, {
        ok: false,
        diagnostics: [{ line: 1, message: error.message }],
      });
    } finally {
      assemblies--;
    }
  }
  if (url.pathname.startsWith("/api/"))
    return respond(response, 404, { error: "Unknown lab endpoint." });
  if (vite)
    return vite.middlewares(request, response, () =>
      respond(response, 404, { error: "Not found." }),
    );
  if (request.method !== "GET" && request.method !== "HEAD")
    return respond(response, 405, { error: "Use GET or HEAD." });
  try {
    const distribution = path.join(root, "dist");
    let filename = path.resolve(
      distribution,
      "." + decodeURIComponent(url.pathname),
    );
    if (
      filename !== distribution &&
      !filename.startsWith(distribution + path.sep)
    )
      return respond(response, 403, { error: "Invalid asset path." });
    try {
      if (!(await stat(filename)).isFile())
        filename = path.join(distribution, "index.html");
    } catch {
      filename = path.join(distribution, "index.html");
    }
    const content = await readFile(filename);
    response.writeHead(200, {
      "Content-Type":
        mime[path.extname(filename)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": filename.includes(path.sep + "assets" + path.sep)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    respond(response, 404, { error: "Could not load this page." });
  }
});

server.on("upgrade", (request, socket, head) => {
  if (
    new URL(request.url, `http://127.0.0.1:${port}`).pathname !==
    "/api/simulation"
  )
    return;
  if (!localRequest(request) || sessions.size >= 8) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) =>
    wss.emit("connection", ws, request),
  );
});

wss.on("connection", (ws) => {
  const session = {
    simulator: null,
    running: false,
    timer: null,
    generation: 0,
    speed: 1000,
    breakpoints: [],
    last: null,
    closed: false,
  };
  sessions.add(session);
  let queue = Promise.resolve(),
    queued = 0;
  const send = (data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  const sendSnapshot = (snapshot) => {
    session.last = snapshot;
    send({
      type: "snapshot",
      snapshot: {
        ...snapshot,
        status: snapshot.halted
          ? snapshot.status
          : session.running
            ? "running"
            : "paused",
      },
    });
  };
  const pause = () => {
    session.running = false;
    session.generation++;
    clearTimeout(session.timer);
  };
  const pump = async (generation, resume = false) => {
    if (!session.running || session.closed || generation !== session.generation)
      return;
    try {
      const cycles = Math.max(
        1,
        Math.min(2000, Math.floor(session.speed / 30)),
      );
      const snapshot = await session.simulator.request({
        type: "tick",
        cycles,
        breakpoints: session.breakpoints,
        resume,
      });
      if (session.closed || generation !== session.generation) return;
      if (snapshot.halted || snapshot.message?.startsWith("Breakpoint reached"))
        pause();
      sendSnapshot(snapshot);
      if (session.running)
        session.timer = setTimeout(
          () => pump(generation),
          session.speed < 30 ? 1000 / session.speed : 33,
        );
    } catch (error) {
      pause();
      send({ type: "error", message: error.message });
    }
  };
  const ready = createSimulator()
    .then(async (simulator) => {
      session.simulator = simulator;
      if (session.closed) return simulator.close();
      sendSnapshot(await simulator.request({ type: "snapshot" }));
    })
    .catch((error) => {
      send({ type: "error", message: error.message });
    });

  ws.on("message", (raw) => {
    if (queued >= 32)
      return send({
        type: "error",
        message: "Too many queued commands. Wait for the processor to respond.",
      });
    queued++;
    queue = queue
      .then(async () => {
        await ready;
        if (session.closed) return;
        if (!session.simulator)
          throw new Error(
            "The hardware simulator is unavailable. Run npm run setup:sim, then reload.",
          );
        const command = JSON.parse(raw.toString());
        if (!command || typeof command !== "object" || Array.isArray(command))
          throw new Error("Invalid simulator command.");
        const allowed = [
          "load",
          "reset",
          "stepCycle",
          "stepInstruction",
          "run",
          "pause",
          "setInputs",
          "readMemory",
        ];
        if (!allowed.includes(command.type))
          throw new Error("Unknown simulator command.");
        if (command.type === "run") {
          if (
            !Number.isFinite(command.speed) ||
            command.speed < 1 ||
            command.speed > 1000000
          )
            throw new Error(
              "Execution speed must be between 1 and 1,000,000 cycles per second.",
            );
          if (
            command.breakpoints !== undefined &&
            (!Array.isArray(command.breakpoints) ||
              command.breakpoints.length > 128 ||
              command.breakpoints.some(
                (address) =>
                  !Number.isInteger(address) ||
                  address < 0 ||
                  address >= 65536 ||
                  address % 4,
              ))
          )
            throw new Error(
              "Breakpoints must be aligned addresses inside RAM.",
            );
          pause();
          session.running = true;
          session.speed = command.speed;
          session.breakpoints = command.breakpoints || [];
          const generation = session.generation;
          sendSnapshot(session.last);
          pump(
            generation,
            Boolean(session.last?.message?.startsWith("Breakpoint reached")),
          );
          return;
        }
        if (command.type === "load") {
          if (
            !Array.isArray(command.image) ||
            !command.image.length ||
            command.image.length > 65536 ||
            command.image.some(
              (value) => !Number.isInteger(value) || value < 0 || value > 255,
            )
          )
            throw new Error(
              "Program must contain 1–65536 bytes with values from 0 to 255.",
            );
        }
        if (
          command.type === "setInputs" &&
          (!Number.isInteger(command.value) ||
            command.value < 0 ||
            command.value > 255)
        )
          throw new Error("Input switch value must be from 0 to 255.");
        if (
          command.type === "readMemory" &&
          (!Number.isInteger(command.address) ||
            command.address < 0 ||
            command.address >= 65536)
        )
          throw new Error(
            "Memory address must be within 0x00000000–0x0000ffff.",
          );
        if (!["setInputs", "readMemory"].includes(command.type)) pause();
        sendSnapshot(await session.simulator.request(command));
      })
      .catch((error) => send({ type: "error", message: error.message }))
      .finally(() => queued--);
  });
  ws.on("error", () => {});
  ws.on("close", () => {
    session.closed = true;
    pause();
    sessions.delete(session);
    session.simulator?.close().catch(() => {});
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
console.log(
  `\n  PicoRV32 Lab · original RV32IM hardware\n  Local: http://127.0.0.1:${port}\n`,
);
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const ws of wss.clients) ws.close(1001, "Local lab shutting down");
  for (const session of sessions) {
    clearTimeout(session.timer);
    session.running = false;
    await session.simulator?.close();
  }
  await vite?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
if (process.channel) process.on("disconnect", shutdown);

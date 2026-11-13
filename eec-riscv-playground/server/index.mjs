import http from "node:http";
import { isIP } from "node:net";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { assemble, disassemble, createSimulator } from "./simulator.mjs";
import { root } from "./platform.mjs";

const production = process.argv.includes("--production");
const port = Number(process.env.PORT || 5174);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
const host = process.env.HOST || "127.0.0.1";
if (!isIP(host) && host !== "localhost")
  throw new Error("HOST must be a bind IP address or localhost.");
const publicURL = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
let publicOrigin;
if (publicURL) {
  try {
    const url = new URL(publicURL);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash
    ) throw new Error("Invalid public origin");
    publicOrigin = url.origin;
  } catch {
    throw new Error(
      "PUBLIC_ORIGIN or RENDER_EXTERNAL_URL must be an HTTPS origin without a path, credentials, query, or fragment. HTTP is permitted for loopback smoke tests only.",
    );
  }
}
const maxSessions = Number(process.env.MAX_SIM_SESSIONS || 8);
if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 64)
  throw new Error("MAX_SIM_SESSIONS must be an integer between 1 and 64.");
const sessionIdleMs = Number(process.env.SESSION_IDLE_MS || 15 * 60 * 1000);
if (!Number.isInteger(sessionIdleMs) || sessionIdleMs < 1000 || sessionIdleMs > 60 * 60 * 1000)
  throw new Error("SESSION_IDLE_MS must be between 1000 and 3600000 milliseconds.");
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
const allowedOrigins = new Set(
  [...allowedHosts].map((host) => `http://${host}`),
);
if (publicOrigin) {
  allowedHosts.add(new URL(publicOrigin).host);
  allowedOrigins.add(publicOrigin);
}
const server = http.createServer({ requestTimeout: 15000, headersTimeout: 10000 });
const wss = new WebSocketServer({ noServer: true, maxPayload: 400000 });
const sessions = new Set();
let vite,
  assemblies = 0,
  shuttingDown = false;

function trustedRequest(request) {
  return (
    typeof request.headers.host === "string" &&
    allowedHosts.has(request.headers.host.toLowerCase()) &&
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
  if (!trustedRequest(request))
    return respond(response, 403, {
      error: "This lab accepts requests from its configured browser origins only.",
    });
  let url;
  try { url = new URL(request.url, `http://127.0.0.1:${port}`); }
  catch { return respond(response, 400, { error: "Invalid request URL." }); }
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
  let url;
  try { url = new URL(request.url, `http://127.0.0.1:${port}`); }
  catch { socket.destroy(); return; }
  if (url.pathname !== "/api/simulation") {
    if (!vite) socket.destroy();
    return;
  }
  const reject = (status, message) => {
    socket.end(
      `HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
    );
  };
  if (!trustedRequest(request)) {
    reject("403 Forbidden", "This browser origin is not allowed to use the simulator.");
    return;
  }
  if (shuttingDown || sessions.size >= maxSessions) {
    reject("503 Service Unavailable", "All hardware simulator sessions are busy. Try again in a moment.");
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
    idleTimer: null,
  };
  sessions.add(session);
  let queue = Promise.resolve(),
    queued = 0;
  const send = (data) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    // A stalled browser must not accumulate an unbounded snapshot buffer.
    if (ws.bufferedAmount > 2 * 1024 * 1024) return ws.terminate();
    ws.send(JSON.stringify(data));
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
  const release = () => {
    if (session.closed) return;
    session.closed = true;
    pause();
    clearTimeout(session.idleTimer);
    // Keep the slot occupied until its native process has actually stopped.
    Promise.resolve().then(() => ready).catch(() => {})
      .then(() => session.simulator?.close()).catch(() => {})
      .finally(() => sessions.delete(session));
  };
  const touch = () => {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      send({ type: "error", message: "This simulator session expired after inactivity. Reload the page to start a fresh processor." });
      release();
      ws.close(1000, "Simulator session expired after inactivity");
      setTimeout(() => ws.terminate(), 1000).unref();
    }, sessionIdleMs);
    session.idleTimer.unref();
  };
  touch();
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
      release();
      ws.close(1011, "The hardware simulator could not start");
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
        touch();
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
  ws.on("error", release);
  ws.on("close", release);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});
console.log(
  `\n  EEC RISC-V Playground · guided project\n  Listening: ${host}:${port}\n  Open: ${publicOrigin || `http://127.0.0.1:${port}`}\n`,
);
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const ws of wss.clients) ws.close(1001, "Hardware lab shutting down");
  for (const session of sessions) {
    clearTimeout(session.timer);
    clearTimeout(session.idleTimer);
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

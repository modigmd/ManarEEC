import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { fork } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import { assemble } from "../server/simulator.mjs";

const publicOrigin = "https://playground.example.test";
const cleanEnv = () => ({
  ...process.env,
  HOST: "127.0.0.1",
  PUBLIC_ORIGIN: "",
  RENDER_EXTERNAL_URL: "",
  MAX_SIM_SESSIONS: "1",
  SESSION_IDLE_MS: "3000",
});
const children = [];
let local, hosted;

async function start(extra = {}) {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = fork(new URL("../server/index.mjs", import.meta.url), [], {
    silent: true, env: { ...cleanEnv(), PORT: String(port), ...extra },
  });
  const server = { child, port, base: `http://127.0.0.1:${port}`, output: "", exited: false };
  children.push(server);
  child.stdout.on("data", (chunk) => server.output += chunk);
  child.stderr.on("data", (chunk) => server.output += chunk);
  child.once("exit", () => server.exited = true);
  for (let i = 0; i < 100; i++) {
    if (server.exited) throw new Error(server.output);
    try {
      if ((await fetch(`${server.base}/api/health`)).ok) return server;
    } catch {}
    await delay(100);
  }
  throw new Error(`Server did not start: ${server.output}`);
}

async function stop(server) {
  if (server.exited) return;
  const closed = once(server.child, "exit");
  server.child.disconnect();
  if (!(await Promise.race([closed.then(() => true), delay(5000).then(() => false)]))) {
    server.child.kill();
    throw new Error(`Server did not cleanly stop: ${server.output}`);
  }
}

before(async () => {
  [local, hosted] = await Promise.all([
    start(),
    start({ HOST: "0.0.0.0", RENDER_EXTERNAL_URL: publicOrigin }),
  ]);
}, { timeout: 20000 });

after(async () => {
  await Promise.all(children.map(stop));
});

function request(server, { path = "/api/health", host, origin } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (host) headers.Host = host;
    if (origin) headers.Origin = origin;
    const req = http.get({ hostname: "127.0.0.1", port: server.port, path, headers }, (res) => {
      let text = "";
      res.on("data", (chunk) => text += chunk);
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
  });
}

function rejectedSocket(server, origin = publicOrigin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/simulation`, {
      origin, headers: { Host: "playground.example.test" },
    });
    ws.on("error", () => {});
    ws.once("open", () => { ws.terminate(); reject(new Error("Rejected connection was accepted.")); });
    ws.once("unexpected-response", (_req, res) => {
      let text = "";
      res.on("data", (chunk) => text += chunk);
      res.on("end", () => { ws.terminate(); resolve({ status: res.statusCode, text }); });
    });
  });
}

async function connect(server) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/simulation`, {
    origin: publicOrigin, headers: { Host: "playground.example.test" },
  });
  const messages = [], waiters = [];
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.predicate(message));
    if (index < 0) messages.push(message);
    else {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  const next = (predicate = (message) => message.type === "snapshot") => {
    const index = messages.findIndex(predicate);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => reject(new Error("No simulator update.")), 10000) };
      waiters.push(waiter);
    });
  };
  await once(ws, "open");
  const initial = await next();
  return { ws, next, initial, send(command) { messages.length = 0; ws.send(JSON.stringify(command)); } };
}

test("public hosting accepts the exact configured host and HTTPS origin, retaining local health checks", async () => {
  const allowed = await request(hosted, { host: "playground.example.test", origin: publicOrigin });
  assert.equal(allowed.status, 200);
  assert.equal(JSON.parse(allowed.text).simulator, true);
  assert.equal(JSON.parse(allowed.text).configuration, "RV32IM");
  assert.equal((await request(hosted)).status, 200);
  for (const [host, origin] of [
    ["playground.example.test.evil.test", publicOrigin],
    ["evil.test", publicOrigin],
    ["playground.example.test", "https://evil.test"],
    ["playground.example.test", "http://playground.example.test"],
  ]) assert.equal((await request(hosted, { host, origin })).status, 403);
  assert.equal((await request(hosted, { path: "http://[invalid" })).status, 400);
  assert.equal((await request(hosted)).status, 200);
});

test("local defaults do not allow an unconfigured public host or cross-site browser origin", async () => {
  assert.equal((await request(local)).status, 200);
  assert.equal((await request(local, { host: "playground.example.test", origin: publicOrigin })).status, 403);
  assert.equal((await request(local, { origin: publicOrigin })).status, 403);
  assert.equal((await rejectedSocket(local)).status, 403);
  assert.equal((await rejectedSocket(hosted, "https://evil.test")).status, 403);
});

test("native sessions are bounded, pause responsively, expire, release their process, and shut down", { timeout: 20000 }, async () => {
  const first = await connect(hosted);
  assert.equal(first.initial.snapshot.cycle, 0);
  const capacity = await rejectedSocket(hosted);
  assert.equal(capacity.status, 503);
  assert.match(capacity.text, /sessions are busy.*Try again/);
  first.send({ type: "load", image: [0x6f, 0, 0, 0] }); // jal zero, 0
  await first.next();
  first.send({ type: "run", speed: 1000000 });
  await first.next((m) => m.type === "snapshot" && m.snapshot.cycle > 0);
  first.send({ type: "pause" });
  const paused = await first.next();
  assert.equal(paused.snapshot.status, "paused");
  const closed = once(first.ws, "close");
  const expiration = await first.next((m) => m.type === "error");
  assert.match(expiration.message, /expired after inactivity/);
  assert.equal((await closed)[0], 1000);
  await delay(100); // The replacement slot opens after native process exit.
  const replacement = await connect(hosted);
  assert.equal(replacement.initial.snapshot.cycle, 0);
  const shuttingDown = once(replacement.ws, "close");
  await stop(hosted);
  assert.equal((await shuttingDown)[0], 1001);
});

test("unsafe file inputs cannot hide after labels, separators, or generated assembler macros", async () => {
  for (const source of [
    '.text\n_start: .include "/etc/passwd"',
    '.text; .incbin "/etc/passwd"',
    '.macro read name\n.\\name "/etc/passwd"\n.endm\nread incbin',
    '.irp name,incbin\n.\\name "/etc/passwd"\n.endr',
    '.inc\\\nbin "/etc/passwd"',
  ]) {
    const result = await assemble(source);
    assert.equal(result.ok, false);
    assert.match(result.diagnostics[0].message, /unavailable/);
  }
});

test("GNU assembler file limits bound oversized data before it can fill the host disk", { timeout: 15000 }, async () => {
  const result = await assemble(".global _start\n_start: .space 8388608\n");
  assert.equal(result.ok, false);
  assert.match(result.diagnostics[0].message, /resource limit/);
});

test("invalid public origins fail at startup, including insecure external hosts and URL paths", { timeout: 15000 }, async () => {
  for (const origin of ["http://playground.example.test", "https://user:password@playground.example.test", "https://playground.example.test/path", "not a URL"]) {
    const child = fork(new URL("../server/index.mjs", import.meta.url), [], {
      silent: true, env: { ...cleanEnv(), PUBLIC_ORIGIN: origin },
    });
    let output = "";
    child.stderr.on("data", (chunk) => output += chunk);
    const [code] = await once(child, "exit");
    assert.notEqual(code, 0);
    assert.match(output, /must be an HTTPS origin/);
  }
});

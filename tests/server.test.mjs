import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { fork } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

let server,
  base,
  websocketURL,
  output = "",
  exited = false;

before(
  async () => {
    const reservation = net.createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    base = `http://127.0.0.1:${port}`;
    websocketURL = `ws://127.0.0.1:${port}/api/simulation`;
    server = fork(new URL("../server/index.mjs", import.meta.url), [], {
      silent: true,
      env: { ...process.env, PORT: String(port) },
    });
    server.stdout.on("data", (chunk) => (output += chunk));
    server.stderr.on("data", (chunk) => (output += chunk));
    server.once("exit", () => {
      exited = true;
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) return;
      } catch {}
      if (exited) throw new Error(`Test server stopped: ${output}`);
      await delay(100);
    }
    throw new Error(`Test server did not start: ${output}`);
  },
  { timeout: 20000 },
);

after(async () => {
  if (!exited) {
    const stopped = once(server, "exit");
    if (server.connected) server.disconnect();
    const result = await Promise.race([stopped, delay(5000).then(() => null)]);
    if (!result) {
      server.kill();
      throw new Error(
        "The server did not shut down its simulator connections.",
      );
    }
  }
});

async function connect() {
  const ws = new WebSocket(websocketURL, { origin: base });
  const messages = [],
    waiters = [];
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else messages.push(message);
  });
  const next = (predicate = (message) => message.type === "snapshot") => {
    const index = messages.findIndex(predicate);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Timed out waiting for a simulation update."));
        }, 10000),
      };
      waiters.push(waiter);
    });
  };
  await once(ws, "open");
  await next();
  return {
    ws,
    next,
    send(command) {
      messages.length = 0;
      ws.send(JSON.stringify(command));
    },
    async command(command) {
      messages.length = 0;
      ws.send(JSON.stringify(command));
      return (await next()).snapshot;
    },
    async close() {
      if (ws.readyState === WebSocket.CLOSED) return;
      const closed = once(ws, "close");
      ws.close();
      await closed;
      for (const waiter of waiters) clearTimeout(waiter.timer);
    },
  };
}

async function binary(source) {
  const response = await fetch(`${base}/api/assemble`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ source }),
  });
  const result = await response.json();
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.image;
}

test(
  "local HTTP and WebSocket endpoints reject external origins",
  { timeout: 15000 },
  async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.configuration, "RV32IM");
    assert.equal(health.simulator, true);
    const external = await fetch(`${base}/api/health`, {
      headers: { Origin: "https://unrelated.example" },
    });
    assert.equal(external.status, 403);
    const rejected = new WebSocket(websocketURL, {
      origin: "https://unrelated.example",
    });
    const status = await new Promise((resolve, reject) => {
      rejected.once("unexpected-response", (_request, response) => {
        response.resume();
        rejected.terminate();
        resolve(response.statusCode);
      });
      rejected.on("error", () => {});
      rejected.once("open", () =>
        reject(new Error("External WebSocket origin was accepted.")),
      );
    });
    assert.equal(status, 403);
  },
);

test(
  "binary imports use GNU disassembly and reject malformed program bytes",
  { timeout: 20000 },
  async () => {
    const image = await binary(
      ".text\n.globl _start\n_start:\naddi a0,zero,7\nmul a1,a0,a0\nebreak\n",
    );
    const request = (image) =>
      fetch(`${base}/api/disassemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({ image }),
      });
    const response = await request(image);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.disassembly[0].address, 0);
    assert.match(result.disassembly[0].text, /^addi\b/);
    assert.match(result.disassembly[1].text, /^mul\b/);
    assert.equal(result.disassembly[1].address, 4);
    assert.equal(
      result.disassembly[0].line,
      undefined,
      "raw binaries have no source line map",
    );
    for (const invalid of [
      [],
      [256],
      [-1],
      [1.5],
      [null],
      "not bytes",
      Array(65537).fill(0),
    ]) {
      const bad = await request(invalid);
      assert.equal(bad.status, 400);
      const result = await bad.json();
      assert.equal(result.ok, false);
      assert.match(result.diagnostics[0].message, /bytes|program/i);
    }
    const full = await request(Array(65536).fill(255));
    assert.equal(
      full.status,
      200,
      "the JSON parser accepts the maximum binary size",
    );
  },
);

test(
  "running and pausing the actual core leaves a stable paused snapshot",
  { timeout: 20000 },
  async () => {
    const client = await connect();
    try {
      await client.command({
        type: "load",
        image: await binary(
          ".text\n.globl _start\n_start:\naddi a0,a0,1\nj _start\n",
        ),
      });
      client.send({ type: "run", speed: 1000000, breakpoints: [] });
      const running = (
        await client.next(
          (message) =>
            message.type === "snapshot" &&
            message.snapshot.status === "running" &&
            message.snapshot.cycle > 0,
        )
      ).snapshot;
      assert.ok(running.regs[10] > 0);
      client.send({ type: "pause" });
      const paused = (
        await client.next(
          (message) =>
            message.type === "snapshot" &&
            message.snapshot.status === "paused" &&
            message.snapshot.cycle >= running.cycle,
        )
      ).snapshot;
      await delay(100);
      const memory = await client.command({ type: "readMemory", address: 0 });
      assert.equal(memory.cycle, paused.cycle);
      assert.equal(memory.retired, paused.retired);
    } finally {
      await client.close();
    }
  },
);

test(
  "breakpoints stop before execution and resume advances past the current address once",
  { timeout: 20000 },
  async () => {
    const client = await connect();
    const run = () =>
      client.send({ type: "run", speed: 100000, breakpoints: [0, 4] });
    const breakpoint = () =>
      client.next(
        (message) =>
          message.type === "snapshot" &&
          message.snapshot.message?.startsWith("Breakpoint reached") &&
          message.snapshot.status === "paused",
      );
    try {
      await client.command({
        type: "load",
        image: await binary(
          ".text\n.globl _start\n_start:\naddi a0,zero,7\naddi a1,zero,9\nj _start\n",
        ),
      });
      run();
      let snapshot = (await breakpoint()).snapshot;
      assert.equal(snapshot.pc, 0);
      assert.equal(snapshot.cycle, 0);
      assert.equal(snapshot.regs[10], 0);
      run();
      snapshot = (await breakpoint()).snapshot;
      assert.equal(snapshot.pc, 4);
      assert.equal(snapshot.retired, 1);
      assert.equal(snapshot.regs[10], 7);
      assert.equal(
        snapshot.regs[11],
        0,
        "the instruction at the breakpoint has not executed",
      );
      run();
      snapshot = (await breakpoint()).snapshot;
      assert.equal(snapshot.pc, 0);
      assert.equal(snapshot.regs[11], 9);
      assert.ok(snapshot.retired > 1);
      const step = await client.command({ type: "stepInstruction" });
      assert.equal(step.retired, snapshot.retired + 1);
      assert.equal(step.message, "");
    } finally {
      await client.close();
    }
  },
);

test(
  "server shutdown closes an active simulation connection cleanly",
  { timeout: 15000 },
  async () => {
    const client = await connect();
    const disconnected = once(client.ws, "close");
    const stopped = once(server, "exit");
    server.disconnect();
    const [code] = await disconnected;
    assert.equal(code, 1001);
    const [exitCode] = await stopped;
    assert.equal(exitCode, 0, output);
  },
);

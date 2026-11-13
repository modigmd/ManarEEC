import assert from "node:assert/strict";
import WebSocket from "ws";

const base = new URL(process.argv[2] || "http://127.0.0.1:10000");
const request = (pathname, options = {}) =>
  fetch(new URL(pathname, base), {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
const health = await request("/api/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).simulator, true);
const page = await request("/");
assert.equal(page.status, 200);
assert.match(await page.text(), /ManarEEC/);
const source = `.section .text
.globl _start
_start:
  li t0, 7
  li t1, 35
  add t2, t0, t1
  li a0, 0x10000004
  sw t2, 0(a0)
  ebreak
`;
const assembly = await request("/api/assemble", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base.origin },
  body: JSON.stringify({ source }),
});
assert.equal(assembly.status, 200);
const program = await assembly.json();
assert.equal(program.ok, true, JSON.stringify(program.diagnostics));
assert.ok(program.image.length > 0);

const socketURL = new URL("/api/simulation", base);
socketURL.protocol = base.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(socketURL, { origin: base.origin });
function snapshotWhere(predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error("Simulator response timed out")),
      20000,
    );
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "error") finish(new Error(message.message));
      else if (message.type === "snapshot" && predicate(message.snapshot))
        finish(null, message.snapshot);
    };
    const onClose = () => finish(new Error("Simulator closed unexpectedly"));
    const onError = (error) => finish(error);
    function finish(error, snapshot) {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
      socket.off("error", onError);
      error ? reject(error) : resolve(snapshot);
    }
    socket.on("message", onMessage);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}
try {
  await snapshotWhere();
  let response = snapshotWhere();
  socket.send(JSON.stringify({ type: "load", image: program.image }));
  await response;
  response = snapshotWhere((snapshot) => snapshot.halted || snapshot.trap);
  socket.send(JSON.stringify({ type: "run", speed: 10000, breakpoints: [] }));
  const result = await response;
  assert.equal(result.regs[7], 42);
  assert.equal(result.leds, 42);
  assert.equal(result.halted, true);
  response = snapshotWhere();
  socket.send(JSON.stringify({ type: "reset" }));
  const reset = await response;
  assert.equal(reset.cycle, 0);
  assert.equal(reset.leds, 0);
  console.log(
    "Hosted smoke check passed: HTML, health, GNU assembly, WebSocket, native ADD, LEDs, reset.",
  );
} finally {
  socket.close();
}

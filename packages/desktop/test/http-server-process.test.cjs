const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const { HttpServerProcess, formatHost } = require("../src/http-server-process.cjs");

class FakeServerProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
  }

  kill(signal) {
    this.killed = signal || true;
    this.exitCode = 0;
    queueMicrotask(() => this.emit("exit", 0, signal));
  }
}

test("waits for Nest ready message and exposes the API base URL", async () => {
  const child = new FakeServerProcess();
  let forkOptions;
  const server = new HttpServerProcess({
    fork: (_modulePath, _args, options) => {
      forkOptions = options;
      queueMicrotask(() =>
        child.emit("message", {
          type: "moxu-server-ready",
          ready: true,
          host: "127.0.0.1",
          port: 43123,
        }),
      );
      return child;
    },
    modulePath: "/tmp/server.js",
    startupTimeoutMs: 1000,
  });

  assert.equal(await server.start(), "http://127.0.0.1:43123/api");
  assert.equal(server.baseUrl, "http://127.0.0.1:43123/api");
  assert.equal(server.ready, true);
  assert.equal(forkOptions.env.ELECTRON_RUN_AS_NODE, "1");
  await server.shutdown();
  assert.equal(child.killed, "SIGTERM");
});

test("rejects a server that reports an invalid bound port", async () => {
  const child = new FakeServerProcess();
  const server = new HttpServerProcess({
    fork: () => {
      queueMicrotask(() => child.emit("message", { ready: true, port: 0 }));
      return child;
    },
    modulePath: "/tmp/server.js",
    startupTimeoutMs: 1000,
  });

  await assert.rejects(server.start(), /invalid port/i);
  assert.equal(child.killed, true);
});

test("formats IPv6 loopback URLs safely", () => {
  assert.equal(formatHost("::1"), "[::1]");
  assert.equal(formatHost("127.0.0.1"), "127.0.0.1");
});

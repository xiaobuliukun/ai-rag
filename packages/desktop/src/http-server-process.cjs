/**
 * Starts the compiled Nest application as a child process and waits until it
 * has bound its loopback HTTP socket. Keeping this transport in a separate
 * process means the Electron main process remains responsible for windows and
 * IPC while Nest continues to expose the same HTTP controllers used by web
 * and mobile clients.
 */
class HttpServerProcess {
  constructor({
    fork,
    modulePath,
    cwd,
    env,
    host = "127.0.0.1",
    port = 0,
    startupTimeoutMs = 45_000,
    shutdownTimeoutMs = 5_000,
  }) {
    if (typeof fork !== "function") {
      throw new TypeError("A child-process fork function is required");
    }
    this.fork = fork;
    this.modulePath = modulePath;
    this.cwd = cwd;
    this.env = env;
    this.host = host;
    this.port = port;
    this.startupTimeoutMs = startupTimeoutMs;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.process = undefined;
    this.startPromise = undefined;
    this.baseUrl = undefined;
    this.ready = false;
  }

  start() {
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error("Timed out waiting for the Nest HTTP server.");
        reject(error);
        this.kill();
      }, this.startupTimeoutMs);
      timer.unref?.();

      try {
        this.process = this.fork(this.modulePath, [], {
          cwd: this.cwd,
          // child_process.fork inherits Electron's executable as execPath.
          // Mark the child explicitly as a Node process so the compiled Nest
          // entry point does not try to boot a second Electron application.
          env: {
            ...this.env,
            ELECTRON_RUN_AS_NODE: "1",
          },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
      } catch (error) {
        clearTimeout(timer);
        settled = true;
        reject(error);
        return;
      }

      this.process.stdout?.on("data", (chunk) => {
        // Preserve useful server diagnostics in the desktop log without
        // making startup depend on stdout parsing.
        const text = String(chunk).trimEnd();
        if (text) console.log(`[nest] ${text}`);
      });
      this.process.stderr?.on("data", (chunk) => {
        const text = String(chunk).trimEnd();
        if (text) console.error(`[nest] ${text}`);
      });

      this.process.on("message", (message) => {
        if (!message || typeof message !== "object") return;
        if (message.ready === false && !settled) {
          settled = true;
          clearTimeout(timer);
          const error = new Error(
            message.error?.message || "Nest HTTP server failed to initialize.",
          );
          reject(error);
          this.kill();
          return;
        }
        if (!message.ready || settled) return;

        const port = Number(message.port);
        const host = typeof message.host === "string" ? message.host : this.host;
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("Nest HTTP server reported an invalid port."));
          this.kill();
          return;
        }

        settled = true;
        clearTimeout(timer);
        this.ready = true;
        this.host = host;
        this.port = port;
        this.baseUrl = `http://${formatHost(host)}:${port}/api`;
        resolve(this.baseUrl);
      });
      this.process.on("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      });
      this.process.on("exit", (code, signal) => {
        this.ready = false;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new Error(`Nest HTTP server exited before startup (${signal || code || "unknown"}).`),
          );
        }
      });
    });

    return this.startPromise;
  }

  async shutdown() {
    const child = this.process;
    if (!child) return;
    this.ready = false;

    if (child.exitCode !== null || child.signalCode) {
      this.process = undefined;
      return;
    }

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.kill();
        finish();
      }, this.shutdownTimeoutMs);
      timer.unref?.();
      child.once?.("exit", finish);

      try {
        child.kill?.("SIGTERM");
      } catch {
        finish();
      }
    });
    this.process = undefined;
  }

  kill() {
    try {
      this.process?.kill?.();
    } catch {
      // The child may have exited between the startup/shutdown check and kill.
    }
  }
}

function formatHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

module.exports = { HttpServerProcess, formatHost };

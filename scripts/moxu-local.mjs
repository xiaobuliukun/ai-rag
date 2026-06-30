import { spawn } from "node:child_process";

const commands = [
  {
    name: "server",
    args: ["run", "dev:server"],
  },
  {
    name: "web",
    args: ["run", "dev:web"],
  },
];

let isShuttingDown = false;

const children = commands.map(({ name, args }) => {
  const child = spawn("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      HOST: process.env.HOST ?? "127.0.0.1",
    },
  });

  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    console.error(
      `[moxu] ${name} exited${signal ? ` with signal ${signal}` : ` with code ${code}`}`,
    );
    shutdown(code ?? 1);
  });

  return child;
});

console.log("[moxu] Local server: http://127.0.0.1:3001/api");
console.log("[moxu] Web app:      http://127.0.0.1:3000");
console.log("[moxu] Press Ctrl+C to stop both processes.");

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  windowlessExit(code);
}

function windowlessExit(code) {
  setTimeout(() => process.exit(code), 250);
}

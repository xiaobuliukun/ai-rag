import { spawn } from 'node:child_process';

const HOST = '127.0.0.1';
const PORT = 3210;
const BASE_URL = `http://${HOST}:${PORT}`;
const ROUTES = ['/', '/search', '/management', '/settings'];

const server = spawn(
  'npm',
  [
    'run',
    'start',
    '-w',
    'packages/web',
    '--',
    '--hostname',
    HOST,
    '--port',
    String(PORT),
  ],
  {
    cwd: new URL('../../..', import.meta.url),
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL:
        process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

const shutdown = () => {
  if (!server.killed) {
    server.kill('SIGTERM');
  }
};

process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

try {
  await waitForServer();

  for (const route of ROUTES) {
    const response = await fetch(`${BASE_URL}${route}`);
    if (!response.ok) {
      throw new Error(`${route} returned ${response.status}`);
    }

    const html = await response.text();
    if (!html.includes('Juejin Flow')) {
      throw new Error(`${route} did not render the app shell`);
    }
  }

  console.log(`Smoke checked ${ROUTES.length} web routes`);
} finally {
  shutdown();
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early:\n${output}`);
    }

    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until next start is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for next start:\n${output}`);
}

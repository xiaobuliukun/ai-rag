import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const BOOK_COUNT = Number(process.env.MOXU_LARGE_BOOKS || 18);
const CHAPTERS_PER_BOOK = Number(process.env.MOXU_LARGE_CHAPTERS || 28);
const PORT = Number(process.env.MOXU_LARGE_API_PORT || 3191);
const HOST = "127.0.0.1";
const API_BASE_URL = `http://${HOST}:${PORT}/api`;
const KEEP_FIXTURE = process.argv.includes("--keep");

const root = await mkdtemp(path.join(os.tmpdir(), "moxu-large-library-"));
const libraryPath = path.join(root, "books");
const dbPath = path.join(root, "large-smoke.db");
let server;
let shuttingDown = false;

try {
  await generateLibrary(libraryPath, BOOK_COUNT, CHAPTERS_PER_BOOK);
  await applySqliteMigrations(dbPath);
  server = spawn("npm", ["run", "start:prod", "-w", "packages/server"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
      HOST,
      PORT: String(PORT),
      AI_CONFIG_SECRET: "large-library-smoke-secret",
      ALLOW_REMOTE_API: "false",
      SCAN_JOBS_FILE: path.join(root, "scan-jobs.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

  await waitForApi();

  const startedAt = Date.now();
  const scan = await postJson("/scan/jobs", { path: libraryPath });
  const job = await waitForScan(scan.job.id);
  const scanMs = Date.now() - startedAt;

  if (job.phase !== "completed") {
    throw new Error(`Scan did not complete: ${job.phase} ${job.message}`);
  }

  const books = await getJson("/books");
  const stats = await getJson("/books/stats");
  const indexStatus = await getJson("/search/index-status");
  const searchResults = await getJson(
    `/search?q=${encodeURIComponent("reactive notebook hydration")}&type=content`,
  );
  const firstBook = books[0];
  const firstChapter = firstBook?.chapters?.[0];
  if (!firstBook || !firstChapter) {
    throw new Error("Large library scan returned no chapters");
  }

  await fetchJson(
    `/books/${firstBook.id}/chapters/${firstChapter.id}/progress`,
    {
      method: "PUT",
      body: JSON.stringify({
        progress: 42,
        scrollPosition: 128,
        readingSecondsDelta: 35,
      }),
    },
  );

  const aiResponse = await postJson("/ai/chat", {
    message: "Summarize the notes about reactive notebooks and hydration.",
    context: {
      bookId: firstBook.id,
    },
    config: {
      mode: "local",
      ragSourceCount: 4,
    },
  });

  assertCondition(books.length === BOOK_COUNT, `Expected ${BOOK_COUNT} books, got ${books.length}`);
  assertCondition(
    stats.totalChapters === BOOK_COUNT * CHAPTERS_PER_BOOK,
    `Expected ${BOOK_COUNT * CHAPTERS_PER_BOOK} chapters, got ${stats.totalChapters}`,
  );
  assertCondition(indexStatus.isFtsReady, "FTS index is not ready");
  assertCondition(indexStatus.isVectorReady, "Vector index is not ready");
  assertCondition(searchResults.length > 0, "Search returned no content results");
  assertCondition(aiResponse.sources?.length > 0, "AI local response returned no sources");

  console.log("");
  console.log("[large-smoke] PASS");
  console.log(`[large-smoke] fixture: ${libraryPath}`);
  console.log(`[large-smoke] books: ${books.length}`);
  console.log(`[large-smoke] chapters: ${stats.totalChapters}`);
  console.log(`[large-smoke] chunks: ${indexStatus.totalChunks}`);
  console.log(`[large-smoke] scan: ${(scanMs / 1000).toFixed(1)}s`);
  console.log(`[large-smoke] search results: ${searchResults.length}`);
  console.log(`[large-smoke] AI sources: ${aiResponse.sources.length}`);
} finally {
  if (server && server.exitCode === null && !shuttingDown) {
    shuttingDown = true;
    if (process.platform === "win32") {
      const taskkill = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      taskkill.unref();
    } else {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  if (!KEEP_FIXTURE) {
    await rm(root, { recursive: true, force: true });
  } else {
    console.log(`[large-smoke] kept fixture root: ${root}`);
  }
}

async function generateLibrary(basePath, bookCount, chaptersPerBook) {
  await mkdir(basePath, { recursive: true });

  for (let bookIndex = 1; bookIndex <= bookCount; bookIndex += 1) {
    const bookPath = path.join(basePath, `Book ${pad(bookIndex)} Reactive Systems`);
    for (let chapterIndex = 1; chapterIndex <= chaptersPerBook; chapterIndex += 1) {
      const section = `part-${pad(Math.ceil(chapterIndex / 7))}`;
      const chapterPath = path.join(
        bookPath,
        section,
        `${pad(chapterIndex)}-reactive-notebook-${pad(bookIndex)}.md`,
      );
      await mkdir(path.dirname(chapterPath), { recursive: true });
      await writeFile(
        chapterPath,
        buildChapter(bookIndex, chapterIndex),
        "utf-8",
      );
    }
  }
}

function buildChapter(bookIndex, chapterIndex) {
  const title = `Reactive Notebook ${bookIndex}.${chapterIndex}`;
  const repeated = Array.from({ length: 14 }, (_, index) => {
    const marker = index % 3 === 0 ? "hydration" : index % 3 === 1 ? "semantic chunking" : "bookmark review";
    return `Paragraph ${index + 1}: A reactive notebook keeps local Markdown notes searchable while preserving reading progress. The ${marker} workflow connects scan jobs, SQLite FTS, vector fallback, AI sources, and calm reader preferences for long study sessions.`;
  }).join("\n\n");

  return `---\ntitle: ${title}\ntags:\n  - reactive\n  - notebook\n---\n\n# ${title}\n\n${repeated}\n\n## Checklist\n\n- [x] scanned markdown\n- [x] indexed chunks\n- [ ] review generated summaries\n`;
}

async function waitForApi() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    try {
      const health = await getJson("/health");
      if (health.status === "ok") {
        return;
      }
    } catch {
      await delay(350);
    }
  }

  throw new Error("Timed out waiting for API");
}

async function waitForScan(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180_000) {
    const { job } = await getJson(`/scan/jobs/${jobId}`);
    process.stdout.write(
      `\r[large-smoke] ${job.phase} ${job.booksScanned}/${job.booksTotal || "?"} books, ${job.chaptersScanned} chapters`,
    );
    if (["completed", "failed", "cancelled"].includes(job.phase)) {
      process.stdout.write("\n");
      return job;
    }
    await delay(600);
  }

  throw new Error("Timed out waiting for scan job");
}

async function getJson(pathname) {
  return fetchJson(pathname);
}

async function postJson(pathname, body) {
  return fetchJson(pathname, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function fetchJson(pathname, init = {}) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${pathname} failed with ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function applySqliteMigrations(databasePath) {
  const migrationsPath = path.join(process.cwd(), "packages/server/prisma/migrations");
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const migrationDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const db = new Database(databasePath);

  try {
    for (const migrationDir of migrationDirs) {
      const sql = await readFile(
        path.join(migrationsPath, migrationDir, "migration.sql"),
        "utf-8",
      );
      db.exec(sql);
    }
  } finally {
    db.close();
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

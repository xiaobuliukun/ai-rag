const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

async function main() {
  const executable = process.argv[2];
  if (!executable) {
    throw new Error("Pass the packaged application executable as the first argument.");
  }
  const executablePath = path.resolve(executable);
  await fs.access(executablePath);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "moxu-packaged-e2e-"));
  // Keep automatic update checks local and deterministic during the smoke test.
  const feed = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  let app;
  let page;
  let output = "";
  try {
    await new Promise((resolve, reject) => {
      feed.once("error", reject);
      feed.listen(0, "127.0.0.1", resolve);
    });
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(AI_|OPENAI_|EMBEDDING_|UPDATE_|MOXU_|DATABASE_URL$|SCAN_JOBS_FILE$|ELECTRON_RUN_AS_NODE$)/.test(key)) {
        delete env[key];
      }
    }
    env.MOXU_USER_DATA_DIR = path.join(root, "user-data");
    env.MOXU_API_PORT = "0";
    env.UPDATE_URL = `http://127.0.0.1:${feed.address().port}`;
    app = await electron.launch({
      executablePath,
      cwd: root,
      env,
      timeout: 60_000,
    });
    for (const stream of [app.process().stdout, app.process().stderr]) {
      stream?.on("data", chunk => { output = (output + chunk).slice(-16000); });
    }
    page = await app.firstWindow({ timeout: 60_000 });
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.getByRole("heading", { name: "书库", level: 2, exact: true }).waitFor();
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    const state = await page.evaluate(async () => ({
      baseUrl: window.moxuDesktop.apiBaseUrl,
      health: await (await fetch(window.moxuDesktop.apiBaseUrl + "/health")).json(),
      books: await (await fetch(window.moxuDesktop.apiBaseUrl + "/books")).json(),
      nodeGlobals: [typeof window.require, typeof window.process],
    }));
    assert.match(state.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/api$/);
    assert.deepEqual(state.health, { status: "ok" });
    assert.deepEqual(state.books, []);
    assert.deepEqual(state.nodeGlobals, ["undefined", "undefined"]);
    await page.locator('a[href="#/management"]').first().click();
    await page.getByRole("heading", { name: "书籍管理", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await app.close();
    app = undefined;
    await assert.rejects(fetch(state.baseUrl + "/health", { signal: AbortSignal.timeout(2000) }));
    console.log("[packaged-e2e] packaged executable, fresh migrations, renderer, preload, Nest HTTP and shutdown passed");
  } catch (error) {
    if (page && !page.isClosed()) {
      const artifacts = path.resolve(__dirname, "../../../../.moxu/e2e-results");
      await fs.mkdir(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, "packaged-failure.png") }).catch(() => {});
    }
    console.error(output);
    throw error;
  } finally {
    await app?.close().catch(() => {});
    feed.closeAllConnections();
    await new Promise(resolve => feed.close(resolve));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

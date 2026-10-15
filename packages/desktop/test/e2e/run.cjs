const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

const desktopRoot = path.resolve(__dirname, "../..");
const projectRoot = path.resolve(desktopRoot, "../..");

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "moxu-electron-e2e-"));
  let app;
  let page;
  let output = "";
  let baseUrl;
  const errors = [];
  try {
    const library = path.join(root, "books");
    const bookDir = path.join(library, "Electron Handbook");
    await fs.mkdir(bookDir, { recursive: true });
    await fs.writeFile(path.join(bookDir, "01-intro.md"),
      "# Electron testing\n\nQuasar desktop reading fixture. Electron renders React while Nest serves APIs.\n\n![Test asset](cover.png)\n");
    const png = path.join(bookDir, "cover.png");
    await fs.copyFile(path.join(desktopRoot, "build/icon.png"), png);
    const backup = path.join(root, "backup.json");
    const invalidBackup = path.join(root, "invalid.json");
    await fs.writeFile(invalidBackup, "{invalid");
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(AI_|OPENAI_|EMBEDDING_|UPDATE_|MOXU_|DATABASE_URL$|SCAN_JOBS_FILE$|ELECTRON_RUN_AS_NODE$)/.test(key)) delete env[key];
    }
    env.MOXU_USER_DATA_DIR = path.join(root, "user-data");
    env.MOXU_API_PORT = "0";
    app = await electron.launch({
      executablePath: require("electron"),
      args: [path.join(__dirname, "launcher.cjs")],
      cwd: projectRoot,
      env,
      timeout: 60_000,
    });
    for (const stream of [app.process().stdout, app.process().stderr]) {
      stream?.on("data", chunk => { output = (output + chunk).slice(-16000); });
    }
    page = await app.firstWindow({ timeout: 60_000 });
    page.setDefaultTimeout(15_000);
    page.on("pageerror", error => errors.push(error.message));
    await page.getByRole("heading", { name: "书库", level: 2, exact: true }).waitFor();
    baseUrl = await page.evaluate(() => window.moxuDesktop.apiBaseUrl);
    assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/api$/);
    assert.deepEqual(await api("/health"), { status: "ok" });
    assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process]), ["undefined", "undefined"]);
    console.log("[desktop-e2e] real Electron, sandboxed preload, migrations and Nest ready");

    await navigate("/management", "书籍管理");
    await queue("openReplies", { canceled: false, filePaths: [library] });
    await page.getByRole("button", { name: "选择目录", exact: true }).click();
    await page.waitForFunction(value => document.querySelector('input[placeholder="/Users/me/books"]')?.value === value, library);
    await page.getByRole("button", { name: "扫描", exact: true }).click();
    await page.locator("main").getByRole("button", { name: /Electron Handbook/ }).waitFor();
    const [book] = await api("/books");
    assert.equal(book.chapters.length, 1);
    const chapter = book.chapters[0];

    // Cancellation must stay cancelled: no second HTML file picker.
    let htmlPickerCount = 0;
    page.on("filechooser", () => htmlPickerCount++);
    await page.getByRole("button", { name: "选择图片", exact: true }).click();
    await queue("openReplies", { canceled: false, filePaths: [png] });
    await page.getByRole("button", { name: "选择图片", exact: true }).click();
    await page.getByText("封面图片已选择，保存后生效", { exact: true }).waitFor();
    await page.getByRole("button", { name: "保存信息", exact: true }).click();
    await page.getByText("书籍信息已保存", { exact: true }).waitFor();
    assert.equal(htmlPickerCount, 0);
    assert.match((await api("/books/" + book.id)).coverImage, /^data:image\/png;base64,/);

    await page.evaluate(route => { location.hash = route; }, "/book/" + book.id + "/" + chapter.id);
    await page.getByRole("heading", { name: "Electron testing", exact: true }).first().waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="Test asset"]');
      return img?.complete && img.naturalWidth > 0;
    });
    await page.getByRole("button", { name: "标记已读", exact: true }).click();
    await poll(async () => (await api("/books/" + book.id + "/chapters/" + chapter.id)).isRead);
    await page.getByPlaceholder("写一句书签备注...").fill("Desktop bookmark");
    await page.getByRole("button", { name: "添加书签", exact: true }).click();
    await page.getByText("Desktop bookmark", { exact: true }).waitFor();
    console.log("[desktop-e2e] native selection, scan, cover, reader asset, progress and bookmark passed");

    await navigate("/search", "搜索");
    await page.getByPlaceholder("搜索你的书库...").fill("Quasar");
    await page.locator("main").getByRole("link", { name: /Electron testing/ }).first().waitFor();
    await page.getByRole("button", { name: "AI 助手", exact: true }).click();
    await page.getByPlaceholder("提问", { exact: true }).fill("Quasar desktop");
    const streamResponse = page.waitForResponse(response => response.url().endsWith("/ai/chat/stream"));
    await page.getByRole("button", { name: "发送", exact: true }).click();
    const response = await streamResponse;
    assert.equal(response.ok(), true);
    const stream = await response.text();
    assert.match(stream, /data:/);
    assert.match(stream, /"type":"done"/);
    await page.locator(".ai-message-bubble:not(.is-user)").getByText("引用来源", { exact: true }).waitFor();
    await page.getByRole("button", { name: "关闭 AI 面板", exact: true }).click();

    await navigate("/management", "书籍管理");
    await queue("saveReplies", { canceled: false, filePath: backup });
    await page.getByRole("button", { name: "导出备份", exact: true }).click();
    await page.getByText("备份已导出", { exact: true }).waitFor();
    const payload = JSON.parse(await fs.readFile(backup, "utf8"));
    assert.equal(payload.books.length, 1);
    assert.equal(payload.bookmarks.length, 1);
    await queue("openReplies", { canceled: false, filePaths: [invalidBackup] });
    await page.getByRole("button", { name: "导入备份", exact: true }).click();
    await page.getByText(/JSON/).first().waitFor();
    await queue("messageReplies", 1);
    await page.getByRole("button", { name: "删除书籍", exact: true }).click();
    await page.getByText("书籍已删除", { exact: true }).waitFor();
    assert.equal((await api("/books")).length, 0);
    await queue("openReplies", { canceled: false, filePaths: [backup] });
    await page.getByRole("button", { name: "导入备份", exact: true }).click();
    await page.locator("main").getByRole("button", { name: /Electron Handbook/ }).waitFor();
    assert.equal((await api("/bookmarks")).length, 1);
    console.log("[desktop-e2e] search, AI SSE, native backup export/import and data restoration passed");

    // Verify real crash recovery twice: exactly one prompt per exit, new preload URL, persistent data.
    for (let index = 0; index < 2; index++) {
      const previousUrl = baseUrl;
      await app.evaluate(() => {
        globalThis.desktopE2e.messageReplies.push(0);
        globalThis.desktopE2e.children.at(-1).kill("SIGKILL");
      });
      await page.waitForFunction(old => window.moxuDesktop?.apiBaseUrl && window.moxuDesktop.apiBaseUrl !== old, previousUrl, { timeout: 45_000 });
      await page.getByRole("heading", { name: "书籍管理", exact: true }).waitFor();
      baseUrl = await page.evaluate(() => window.moxuDesktop.apiBaseUrl);
      assert.equal((await api("/books")).length, 1);
      assert.equal((await api("/bookmarks")).length, 1);
    }
    const prompts = await app.evaluate(() =>
      globalThis.desktopE2e.dialogs.filter(item => item.options.message === "墨序服务已退出").length);
    assert.equal(prompts, 2);
    const directives = await page.evaluate(async () => {
      const violations = [];
      const listener = event => violations.push(event.effectiveDirective);
      document.addEventListener("securitypolicyviolation", listener);
      const script = document.createElement("script");
      script.textContent = "window.__inlineScriptExecuted = true";
      document.head.append(script);
      await fetch("data:text/plain,blocked-by-csp").catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 50));
      document.removeEventListener("securitypolicyviolation", listener);
      if (window.__inlineScriptExecuted) throw new Error("CSP allowed inline script execution");
      return violations;
    });
    assert.ok(directives.includes("connect-src"));
    assert.ok(directives.includes("script-src-elem"));
    assert.deepEqual(errors, []);
    const artifactDir = path.join(projectRoot, ".moxu/e2e-results");
    await fs.mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "desktop.png") });
    await app.close();
    app = undefined;
    await assert.rejects(fetch(baseUrl + "/health", { signal: AbortSignal.timeout(2000) }));
    console.log("[desktop-e2e] repeated Nest recovery, CSP and graceful shutdown passed");
  } catch (error) {
    if (page && !page.isClosed()) {
      const artifactDir = path.join(projectRoot, ".moxu/e2e-results");
      await fs.mkdir(artifactDir, { recursive: true });
      await page.screenshot({ path: path.join(artifactDir, "failure.png") }).catch(() => {});
      console.error((await page.locator("body").innerText().catch(() => "")).slice(-5000));
    }
    console.error(output);
    throw error;
  } finally {
    await app?.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  async function queue(name, reply) {
    await app.evaluate((_electron, { name, reply }) => { globalThis.desktopE2e[name].push(reply); }, { name, reply });
  }
  async function navigate(route, title) {
    await page.locator('a[href="#' + route + '"]').first().click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
  }
  async function api(route) {
    return page.evaluate(async route => {
      const response = await fetch(window.moxuDesktop.apiBaseUrl + route);
      if (!response.ok) throw new Error(route + ": " + response.status);
      return response.json();
    }, route);
  }
}

async function poll(check) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for persisted data");
}

main().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

test("preload exposes only scoped operations, including cancellation and errors", async () => {
  let bridge;
  const calls = [];
  let reply = null;
  const ipcRenderer = {
    sendSync(channel) {
      assert.equal(channel, "moxu:api-base-url");
      return "http://127.0.0.1:43123/api";
    },
    invoke(channel, ...args) {
      calls.push([channel, ...args]);
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/preload.cjs"), "utf8"), {
    require(name) {
      assert.equal(name, "electron");
      return { ipcRenderer, contextBridge: { exposeInMainWorld(name, value) {
        assert.equal(name, "moxuDesktop");
        bridge = value;
      } } };
    },
    process: { platform: "darwin" },
  });
  assert.deepEqual(Object.keys(bridge).sort(), [
    "apiBaseUrl", "chooseBackup", "chooseImage", "confirm", "platform", "saveBackup", "selectDirectory",
  ]);
  assert.equal(bridge.apiBaseUrl, "http://127.0.0.1:43123/api");
  assert.equal(await bridge.chooseImage(), null);
  assert.equal(calls.at(-1)[0], "moxu:choose-image");
  reply = "/books";
  assert.equal(await bridge.selectDirectory(), "/books");
  assert.equal(calls.at(-1)[0], "moxu:select-directory");
  reply = { version: 1, books: [] };
  assert.equal(await bridge.chooseBackup(), reply);
  assert.equal(calls.at(-1)[0], "moxu:choose-backup");
  await bridge.saveBackup(reply, "backup.json");
  assert.equal(calls.at(-1)[0], "moxu:save-backup");
  assert.equal(calls.at(-1)[1].payload, reply);
  assert.equal(calls.at(-1)[1].filename, "backup.json");
  await bridge.confirm("Delete?");
  assert.deepEqual(calls.at(-1), ["moxu:confirm", "Delete?"]);
  reply = new Error("Read failed");
  await assert.rejects(bridge.chooseImage(), /Read failed/);
});

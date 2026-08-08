import {
  CLIENT_PREFERENCES_STORAGE_VERSION,
  createPersistedPreferenceState,
  mergePersistedPreferenceState,
  sanitizeClientPreferences,
} from "./client-preferences";

describe("client preference safety", () => {
  it("does not persist the runtime AI API key", () => {
    const persisted = createPersistedPreferenceState({
      isSidebarOpen: true,
      aiPanelWidth: 384,
      fontSize: 17,
      lineHeight: 1.8,
      colorTemperature: 52,
      pageBrightness: 100,
      autoBrightness: false,
      paperTexture: true,
      readingReminderMinutes: 30,
      autoSaveIntervalSeconds: 30,
      smoothScrollRestore: false,
      locale: "zh-CN",
      aiConfig: {
        mode: "openai-compatible",
        baseUrl: "https://example.test/v1",
        model: "test-model",
        apiKey: "super-secret",
      },
    });

    expect(persisted.aiConfig).toMatchObject({
      mode: "openai-compatible",
      baseUrl: "https://example.test/v1",
      model: "test-model",
    });
    expect(persisted.aiConfig).not.toHaveProperty("apiKey");
    expect(JSON.stringify(persisted)).not.toContain("super-secret");
  });

  it("sanitizes legacy preference backups and whitelists their state", () => {
    const sanitized = sanitizeClientPreferences({
      moxuPreferences: {
        state: {
          fontSize: 999,
          locale: "zh-CN",
          unknownSetting: "ignored",
          aiConfig: {
            mode: "openai-compatible",
            apiKey: "legacy-secret",
            baseUrl: "https://example.test/v1",
          },
        },
        version: 0,
      },
      theme: "dark",
    });

    expect(sanitized).toEqual({
      moxuPreferences: {
        state: {
          fontSize: 22,
          locale: "zh-CN",
          aiConfig: {
            mode: "openai-compatible",
            baseUrl: "https://example.test/v1",
          },
        },
        version: CLIENT_PREFERENCES_STORAGE_VERSION,
      },
      theme: "dark",
    });
    expect(JSON.stringify(sanitized)).not.toContain("legacy-secret");
    expect(JSON.stringify(sanitized)).not.toContain("unknownSetting");
  });

  it("keeps the in-memory API key while applying persisted preferences", () => {
    const current = {
      fontSize: 17,
      aiConfig: {
        mode: "local" as const,
        apiKey: "runtime-only",
      },
    };

    const merged = mergePersistedPreferenceState(current, {
      fontSize: 20,
      aiConfig: {
        mode: "openai-compatible",
        apiKey: "imported-secret",
      },
    });

    expect(merged.fontSize).toBe(20);
    expect(merged.aiConfig).toEqual({
      mode: "openai-compatible",
      apiKey: "runtime-only",
    });
  });
});

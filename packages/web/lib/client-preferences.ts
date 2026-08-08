import type { AiRuntimeConfig, ClientPreferencesBackup } from "@/types";
import type { Locale } from "@/lib/i18n";

export const CLIENT_PREFERENCES_STORAGE_VERSION = 1;

type PersistedAIConfig = Partial<Omit<AiRuntimeConfig, "apiKey">>;

export interface PersistedPreferenceState {
  isSidebarOpen?: boolean;
  aiPanelWidth?: number;
  fontSize?: number;
  lineHeight?: number;
  colorTemperature?: number;
  pageBrightness?: number;
  autoBrightness?: boolean;
  paperTexture?: boolean;
  readingReminderMinutes?: number;
  autoSaveIntervalSeconds?: number;
  smoothScrollRestore?: boolean;
  locale?: Locale;
  aiConfig?: PersistedAIConfig;
}

interface PreferenceStateSource {
  isSidebarOpen: boolean;
  aiPanelWidth: number;
  fontSize: number;
  lineHeight: number;
  colorTemperature: number;
  pageBrightness: number;
  autoBrightness: boolean;
  paperTexture: boolean;
  readingReminderMinutes: number;
  autoSaveIntervalSeconds: number;
  smoothScrollRestore: boolean;
  locale: Locale;
  aiConfig: AiRuntimeConfig;
}

interface StoredPreferences {
  state: PersistedPreferenceState;
  version: number;
}

export function createPersistedPreferenceState(
  state: PreferenceStateSource,
): PersistedPreferenceState {
  return {
    isSidebarOpen: state.isSidebarOpen,
    aiPanelWidth: state.aiPanelWidth,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    colorTemperature: state.colorTemperature,
    pageBrightness: state.pageBrightness,
    autoBrightness: state.autoBrightness,
    paperTexture: state.paperTexture,
    readingReminderMinutes: state.readingReminderMinutes,
    autoSaveIntervalSeconds: state.autoSaveIntervalSeconds,
    smoothScrollRestore: state.smoothScrollRestore,
    locale: state.locale,
    aiConfig: sanitizeAIConfig(state.aiConfig),
  };
}

export function sanitizePersistedPreferenceState(
  value: unknown,
): PersistedPreferenceState {
  if (!isRecord(value)) {
    return {};
  }

  const state: PersistedPreferenceState = {};
  copyBoolean(value, state, "isSidebarOpen");
  copyNumber(value, state, "aiPanelWidth", 320, 640);
  copyNumber(value, state, "fontSize", 14, 22);
  copyNumber(value, state, "lineHeight", 1.4, 2.2);
  copyNumber(value, state, "colorTemperature", 0, 100);
  copyNumber(value, state, "pageBrightness", 82, 108);
  copyBoolean(value, state, "autoBrightness");
  copyBoolean(value, state, "paperTexture");
  copyNumber(value, state, "readingReminderMinutes", 0, 90);
  copyNumber(value, state, "autoSaveIntervalSeconds", 5, 60);
  copyBoolean(value, state, "smoothScrollRestore");

  if (value.locale === "zh-CN" || value.locale === "en-US") {
    state.locale = value.locale;
  }

  const aiConfig = sanitizeAIConfig(value.aiConfig);
  if (Object.keys(aiConfig).length > 0) {
    state.aiConfig = aiConfig;
  }

  return state;
}

export function mergePersistedPreferenceState<
  T extends { aiConfig: AiRuntimeConfig },
>(currentState: T, persistedState: unknown): T {
  const preferences = sanitizePersistedPreferenceState(persistedState);

  return {
    ...currentState,
    ...preferences,
    aiConfig: preferences.aiConfig
      ? {
          ...currentState.aiConfig,
          ...preferences.aiConfig,
          apiKey: currentState.aiConfig.apiKey,
        }
      : currentState.aiConfig,
  } as T;
}

export function sanitizeStoredPreferences(value: unknown): StoredPreferences | null {
  if (!isRecord(value)) {
    return null;
  }

  const state = sanitizePersistedPreferenceState(value.state);
  if (Object.keys(state).length === 0) {
    return null;
  }

  return {
    state,
    version: CLIENT_PREFERENCES_STORAGE_VERSION,
  };
}

export function sanitizeClientPreferences(
  value: ClientPreferencesBackup | null | undefined,
): ClientPreferencesBackup | null {
  if (!isRecord(value)) {
    return null;
  }

  const preferences: ClientPreferencesBackup = {};
  const moxuPreferences = sanitizeStoredPreferences(value.moxuPreferences);
  if (moxuPreferences) {
    preferences.moxuPreferences = moxuPreferences;
  }

  if (
    value.theme === "light" ||
    value.theme === "dark" ||
    value.theme === "system"
  ) {
    preferences.theme = value.theme;
  }

  return Object.keys(preferences).length > 0 ? preferences : null;
}

export function parseStoredPreferences(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function sanitizeAIConfig(value: unknown): PersistedAIConfig {
  if (!isRecord(value)) {
    return {};
  }

  const config: PersistedAIConfig = {};
  if (value.mode === "local" || value.mode === "openai-compatible") {
    config.mode = value.mode;
  }
  copyString(value, config, "baseUrl");
  copyString(value, config, "model");
  if (
    value.embeddingProvider === "local" ||
    value.embeddingProvider === "openai-compatible"
  ) {
    config.embeddingProvider = value.embeddingProvider;
  }
  copyString(value, config, "embeddingModel");
  copyNumber(value, config, "ragSourceCount", 2, 10);
  copyNumber(value, config, "ragContextChars", 4000, 24000);
  copyNumber(value, config, "ragExcerptChars", 240, 900);

  return config;
}

function copyBoolean<
  Target extends object,
  Key extends keyof Target,
>(source: Record<string, unknown>, target: Target, key: Key) {
  const value = source[String(key)];
  if (typeof value === "boolean") {
    target[key] = value as Target[Key];
  }
}

function copyNumber<
  Target extends object,
  Key extends keyof Target,
>(
  source: Record<string, unknown>,
  target: Target,
  key: Key,
  min: number,
  max: number,
) {
  const value = source[String(key)];
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = Math.min(max, Math.max(min, value)) as Target[Key];
  }
}

function copyString<
  Target extends object,
  Key extends keyof Target,
>(source: Record<string, unknown>, target: Target, key: Key) {
  const value = source[String(key)];
  if (typeof value === "string") {
    target[key] = value as Target[Key];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

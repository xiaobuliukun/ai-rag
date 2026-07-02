import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { Platform } from "react-native";
import type { AiContext, AiRuntimeConfig } from "@moxu/shared";

const SETTINGS_KEY = "moxu.mobile.settings.v1";

export type AppSettings = {
  apiBaseUrl: string;
  aiConfig: AiRuntimeConfig;
};

type SettingsContextValue = {
  settings: AppSettings;
  isSettingsReady: boolean;
  readingContext?: AiContext;
  setApiBaseUrl: (value: string) => Promise<void>;
  setAiConfig: (value: Partial<AiRuntimeConfig>) => Promise<void>;
  setReadingContext: (context?: AiContext) => void;
  resetSettings: () => Promise<void>;
};

const defaultAiConfig: AiRuntimeConfig = {
  mode: "local",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
  embeddingProvider: "local",
  embeddingModel: "text-embedding-3-small",
  ragSourceCount: 5,
  ragContextChars: 12000,
  ragExcerptChars: 520
};

function defaultApiBaseUrl() {
  const configured = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:3001/api";
  }

  return "http://127.0.0.1:3001/api";
}

const defaultSettings: AppSettings = {
  apiBaseUrl: defaultApiBaseUrl(),
  aiConfig: defaultAiConfig
};

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined
);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [readingContext, setReadingContext] = useState<AiContext | undefined>();
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    SecureStore.getItemAsync(SETTINGS_KEY)
      .then((value) => {
        if (!value || cancelled) {
          return;
        }
        const parsed = JSON.parse(value) as Partial<AppSettings>;
        setSettings({
          apiBaseUrl: parsed.apiBaseUrl?.trim() || defaultSettings.apiBaseUrl,
          aiConfig: {
            ...defaultAiConfig,
            ...(parsed.aiConfig ?? {})
          }
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setIsSettingsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (nextSettings: AppSettings) => {
    setSettings(nextSettings);
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(nextSettings));
  }, []);

  const setApiBaseUrl = useCallback(
    async (value: string) => {
      const next = value.trim().replace(/\/$/, "");
      await persist({
        ...settings,
        apiBaseUrl: next || defaultSettings.apiBaseUrl
      });
    },
    [persist, settings]
  );

  const setAiConfig = useCallback(
    async (value: Partial<AiRuntimeConfig>) => {
      await persist({
        ...settings,
        aiConfig: {
          ...settings.aiConfig,
          ...value
        }
      });
    },
    [persist, settings]
  );

  const resetSettings = useCallback(async () => {
    await SecureStore.deleteItemAsync(SETTINGS_KEY);
    setSettings(defaultSettings);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isSettingsReady,
      readingContext,
      setApiBaseUrl,
      setAiConfig,
      setReadingContext,
      resetSettings
    }),
    [
      isSettingsReady,
      readingContext,
      resetSettings,
      setAiConfig,
      setApiBaseUrl,
      settings
    ]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used inside SettingsProvider");
  }

  return context;
}

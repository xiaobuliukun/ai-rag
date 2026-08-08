import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { Platform } from "react-native";
import type {
  AiContext,
  AiRuntimeConfig,
  ApiConnectionConfig
} from "@moxu/shared";

const SETTINGS_KEY = "moxu.mobile.settings.v1";

export type AppSettings = ApiConnectionConfig & {
  aiConfig: AiRuntimeConfig;
};

type SettingsContextValue = {
  settings: AppSettings;
  isSettingsReady: boolean;
  readingContext?: AiContext;
  setApiBaseUrl: (value: string) => Promise<void>;
  setApiAccessToken: (value: string) => Promise<void>;
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

function defaultApiAccessToken() {
  const configured = Constants.expoConfig?.extra?.apiAccessToken;
  return typeof configured === "string" ? configured.trim() : "";
}

const defaultSettings: AppSettings = {
  apiBaseUrl: defaultApiBaseUrl(),
  apiAccessToken: defaultApiAccessToken(),
  aiConfig: defaultAiConfig
};

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined
);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const settingsRef = useRef<AppSettings>(defaultSettings);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
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
        const nextSettings = {
          apiBaseUrl: parsed.apiBaseUrl?.trim() || defaultSettings.apiBaseUrl,
          apiAccessToken:
            parsed.apiAccessToken?.trim() || defaultSettings.apiAccessToken,
          aiConfig: {
            ...defaultAiConfig,
            ...(parsed.aiConfig ?? {})
          }
        };
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
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

  const enqueueWrite = useCallback(async (write: () => Promise<void>) => {
    const pending = writeQueueRef.current.catch(() => undefined).then(write);
    writeQueueRef.current = pending;
    await pending;
  }, []);

  const persist = useCallback(async (nextSettings: AppSettings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    await enqueueWrite(() =>
      SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(nextSettings))
    );
  }, [enqueueWrite]);

  const setApiBaseUrl = useCallback(
    async (value: string) => {
      const next = value.trim().replace(/\/$/, "");
      await persist({
        ...settingsRef.current,
        apiBaseUrl: next || defaultSettings.apiBaseUrl
      });
    },
    [persist]
  );

  const setAiConfig = useCallback(
    async (value: Partial<AiRuntimeConfig>) => {
      await persist({
        ...settingsRef.current,
        aiConfig: {
          ...settingsRef.current.aiConfig,
          ...value
        }
      });
    },
    [persist]
  );

  const setApiAccessToken = useCallback(
    async (value: string) => {
      await persist({
        ...settingsRef.current,
        apiAccessToken: value.trim()
      });
    },
    [persist]
  );

  const resetSettings = useCallback(async () => {
    settingsRef.current = defaultSettings;
    setSettings(defaultSettings);
    await enqueueWrite(() => SecureStore.deleteItemAsync(SETTINGS_KEY));
  }, [enqueueWrite]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isSettingsReady,
      readingContext,
      setApiBaseUrl,
      setApiAccessToken,
      setAiConfig,
      setReadingContext,
      resetSettings
    }),
    [
      isSettingsReady,
      readingContext,
      resetSettings,
      setAiConfig,
      setApiAccessToken,
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

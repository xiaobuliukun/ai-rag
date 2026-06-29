"use client";

import * as React from "react";
import {
  Bell,
  Bot,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  Monitor,
  Moon,
  Save,
  SlidersHorizontal,
  Sun,
  Type,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { useI18n, type Locale } from "@/lib/i18n";
import { getAIConfig, saveAIConfig } from "@/lib/api";
import { getEffectiveBrightnessPercent } from "@/lib/reader-preferences";

const themeOptions = [
  { value: "system", labelKey: "settings.system", icon: Monitor },
  { value: "light", labelKey: "settings.light", icon: Sun },
  { value: "dark", labelKey: "settings.dark", icon: Moon },
] as const;

const localeOptions: Array<{
  value: Locale;
  labelKey: "settings.chinese" | "settings.english";
}> = [
  { value: "zh-CN", labelKey: "settings.chinese" },
  { value: "en-US", labelKey: "settings.english" },
];

export function SettingsView() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const fontSize = useStore((state) => state.fontSize);
  const setFontSize = useStore((state) => state.setFontSize);
  const lineHeight = useStore((state) => state.lineHeight);
  const setLineHeight = useStore((state) => state.setLineHeight);
  const colorTemperature = useStore((state) => state.colorTemperature);
  const setColorTemperature = useStore((state) => state.setColorTemperature);
  const pageBrightness = useStore((state) => state.pageBrightness);
  const setPageBrightness = useStore((state) => state.setPageBrightness);
  const autoBrightness = useStore((state) => state.autoBrightness);
  const setAutoBrightness = useStore((state) => state.setAutoBrightness);
  const paperTexture = useStore((state) => state.paperTexture);
  const setPaperTexture = useStore((state) => state.setPaperTexture);
  const readingReminderMinutes = useStore(
    (state) => state.readingReminderMinutes,
  );
  const setReadingReminderMinutes = useStore(
    (state) => state.setReadingReminderMinutes,
  );
  const locale = useStore((state) => state.locale);
  const setLocale = useStore((state) => state.setLocale);
  const aiConfig = useStore((state) => state.aiConfig);
  const setAIConfig = useStore((state) => state.setAIConfig);
  const [isSavingAI, setIsSavingAI] = React.useState(false);
  const [aiStatus, setAIStatus] = React.useState<string | null>(null);
  const [aiError, setAIError] = React.useState<string | null>(null);
  const [brightnessClock, setBrightnessClock] = React.useState(() => new Date());

  const effectiveBrightness = React.useMemo(
    () =>
      getEffectiveBrightnessPercent(
        pageBrightness,
        autoBrightness,
        brightnessClock,
      ),
    [autoBrightness, brightnessClock, pageBrightness],
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!autoBrightness) {
      return;
    }

    const timer = window.setInterval(() => setBrightnessClock(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, [autoBrightness]);

  React.useEffect(() => {
    let isCancelled = false;

    getAIConfig()
      .then((config) => {
        if (!isCancelled) {
          setAIConfig({
            mode: config.mode,
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
            embeddingProvider: config.embeddingProvider,
            embeddingModel: config.embeddingModel,
            ragSourceCount: config.ragSourceCount,
            ragContextChars: config.ragContextChars,
            ragExcerptChars: config.ragExcerptChars,
          });
        }
      })
      .catch(() => {
        // Keep local preferences if the server has not been migrated yet.
      });

    return () => {
      isCancelled = true;
    };
  }, [setAIConfig]);

  const handleSaveAI = async () => {
    setIsSavingAI(true);
    setAIStatus(null);
    setAIError(null);

    try {
      const saved = await saveAIConfig(aiConfig);
      setAIConfig({
        mode: saved.mode,
        baseUrl: saved.baseUrl,
        model: saved.model,
        apiKey: saved.apiKey,
        embeddingProvider: saved.embeddingProvider,
        embeddingModel: saved.embeddingModel,
        ragSourceCount: saved.ragSourceCount,
        ragContextChars: saved.ragContextChars,
        ragExcerptChars: saved.ragExcerptChars,
      });
      setAIStatus(t("settings.aiSaved"));
    } catch (err) {
      setAIError(err instanceof Error ? err.message : t("settings.aiSaveFailed"));
    } finally {
      setIsSavingAI(false);
    }
  };

  return (
    <div className="settings-view mx-auto grid min-h-full max-w-6xl gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("settings.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <section className="settings-panel space-y-4 rounded-lg border p-5">
        <div>
          <h2 className="font-semibold">{t("settings.language")}</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {localeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setLocale(option.value)}
              className={cn(
                "flex h-14 items-center justify-center rounded-md border bg-background px-4 font-medium transition-all hover:border-accent hover:text-accent",
                locale === option.value &&
                  "border-primary text-primary ring-2 ring-primary/20",
              )}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-panel space-y-4 rounded-lg border p-5">
        <div>
          <h2 className="font-semibold">{t("settings.theme")}</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const selected = mounted && (theme ?? "system") === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex h-20 items-center justify-center gap-3 rounded-md border bg-background px-4 font-medium transition-all hover:border-accent hover:text-accent",
                  selected && "border-primary text-primary ring-2 ring-primary/20",
                )}
              >
                <Icon className="h-5 w-5" />
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-panel space-y-6 rounded-lg border p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
            <Type className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{t("settings.reader")}</h2>
          </div>
        </div>

        <div className="space-y-5">
          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("settings.fontSize")}</span>
              <span className="text-muted-foreground">{fontSize}px</span>
            </div>
            <input
              type="range"
              min="14"
              max="22"
              step="1"
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("settings.lineHeight")}</span>
              <span className="text-muted-foreground">
                {lineHeight.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="1.4"
              max="2.2"
              step="0.1"
              value={lineHeight}
              onChange={(event) => setLineHeight(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <Eye className="h-4 w-4" />
                {t("settings.colorTemperature")}
              </span>
              <span className="text-muted-foreground">{colorTemperature}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={colorTemperature}
              onChange={(event) =>
                setColorTemperature(Number(event.target.value))
              }
              className="w-full accent-primary"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("settings.brightness")}</span>
              <span className="text-muted-foreground">
                {autoBrightness
                  ? t("settings.effectiveBrightness", {
                      brightness: effectiveBrightness,
                    })
                  : `${pageBrightness}%`}
              </span>
            </div>
            <input
              type="range"
              min="82"
              max="108"
              step="1"
              value={pageBrightness}
              onChange={(event) => setPageBrightness(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-md border bg-background px-4 py-3 text-sm">
            <span className="font-medium">{t("settings.autoBrightness")}</span>
            <input
              type="checkbox"
              checked={autoBrightness}
              onChange={(event) => setAutoBrightness(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <Bell className="h-4 w-4" />
                {t("settings.readingReminder")}
              </span>
              <span className="text-muted-foreground">
                {readingReminderMinutes > 0
                  ? t("settings.minutesValue", {
                      minutes: readingReminderMinutes,
                    })
                  : t("settings.off")}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={readingReminderMinutes}
              onChange={(event) =>
                setReadingReminderMinutes(Number(event.target.value))
              }
              className="w-full accent-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-md border bg-background px-4 py-3 text-sm">
            <span className="font-medium">{t("settings.paperTexture")}</span>
            <input
              type="checkbox"
              checked={paperTexture}
              onChange={(event) => setPaperTexture(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>

        <div
          className="reader-paper rounded-md border bg-background p-5 text-foreground"
          style={{
            fontSize,
            lineHeight,
            "--reader-warmth": `${colorTemperature / 100}`,
            "--reader-brightness": `${effectiveBrightness / 100}`,
            "--paper-texture-opacity": paperTexture ? "0.22" : "0",
          } as React.CSSProperties}
        >
          <p className="font-semibold">{t("settings.preview")}</p>
          <p className="mt-2 text-muted-foreground">
            {t("settings.previewText")}
          </p>
        </div>
      </section>

      <section className="settings-panel space-y-6 rounded-lg border p-5 lg:row-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{t("settings.ai")}</h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAIConfig({ mode: "local" })}
            className={cn(
              "flex h-14 items-center justify-center rounded-md border bg-background px-4 font-medium transition-all hover:border-accent hover:text-accent",
              aiConfig.mode === "local" &&
                "border-primary text-primary ring-2 ring-primary/20",
            )}
          >
            {t("settings.local")}
          </button>
          <button
            type="button"
            onClick={() => setAIConfig({ mode: "openai-compatible" })}
            className={cn(
              "flex h-14 items-center justify-center rounded-md border bg-background px-4 font-medium transition-all hover:border-accent hover:text-accent",
              aiConfig.mode === "openai-compatible" &&
                "border-primary text-primary ring-2 ring-primary/20",
            )}
          >
            {t("settings.openaiCompatible")}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" />
              {t("settings.baseUrl")}
            </div>
            <input
              value={aiConfig.baseUrl ?? ""}
              onChange={(event) => setAIConfig({ baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-medium">{t("settings.model")}</div>
            <input
              value={aiConfig.model ?? ""}
              onChange={(event) => setAIConfig({ model: event.target.value })}
              placeholder="gpt-4o-mini"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
            />
          </label>
        </div>

        <label className="block">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            {t("settings.apiKey")}
          </div>
          <input
            type="password"
            value={aiConfig.apiKey ?? ""}
            onChange={(event) => setAIConfig({ apiKey: event.target.value })}
            placeholder="sk-..."
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-2 text-sm font-medium">
              {t("settings.embeddingProvider")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAIConfig({ embeddingProvider: "local" })}
                className={cn(
                  "h-10 rounded-md border bg-background px-3 text-sm font-medium transition-all hover:border-accent hover:text-accent",
                  (aiConfig.embeddingProvider ?? "local") === "local" &&
                    "border-primary text-primary ring-2 ring-primary/20",
                )}
              >
                {t("settings.localEmbedding")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setAIConfig({ embeddingProvider: "openai-compatible" })
                }
                className={cn(
                  "h-10 rounded-md border bg-background px-3 text-sm font-medium transition-all hover:border-accent hover:text-accent",
                  aiConfig.embeddingProvider === "openai-compatible" &&
                    "border-primary text-primary ring-2 ring-primary/20",
                )}
              >
                {t("settings.openaiEmbedding")}
              </button>
            </div>
          </div>

          <label className="block">
            <div className="mb-2 text-sm font-medium">
              {t("settings.embeddingModel")}
            </div>
            <input
              value={aiConfig.embeddingModel ?? ""}
              onChange={(event) =>
                setAIConfig({ embeddingModel: event.target.value })
              }
              placeholder="text-embedding-3-small"
              disabled={(aiConfig.embeddingProvider ?? "local") === "local"}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        </div>

        <div className="space-y-5 rounded-md border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4" />
            {t("settings.rag")}
          </div>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("settings.ragSourceCount")}</span>
              <span className="text-muted-foreground">
                {aiConfig.ragSourceCount ?? 5}
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="10"
              step="1"
              value={aiConfig.ragSourceCount ?? 5}
              onChange={(event) =>
                setAIConfig({ ragSourceCount: Number(event.target.value) })
              }
              className="w-full accent-primary"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("settings.ragContextChars")}</span>
              <span className="text-muted-foreground">
                {formatChars(aiConfig.ragContextChars ?? 12000)}
              </span>
            </div>
            <input
              type="range"
              min="4000"
              max="24000"
              step="1000"
              value={aiConfig.ragContextChars ?? 12000}
              onChange={(event) =>
                setAIConfig({ ragContextChars: Number(event.target.value) })
              }
              className="w-full accent-primary"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{t("settings.ragExcerptChars")}</span>
              <span className="text-muted-foreground">
                {aiConfig.ragExcerptChars ?? 520}
              </span>
            </div>
            <input
              type="range"
              min="240"
              max="900"
              step="20"
              value={aiConfig.ragExcerptChars ?? 520}
              onChange={(event) =>
                setAIConfig({ ragExcerptChars: Number(event.target.value) })
              }
              className="w-full accent-primary"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveAI}
            disabled={isSavingAI}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingAI ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("settings.saveAI")}
          </button>
          {(aiStatus || aiError) && (
            <span
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                aiError
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {aiError ?? aiStatus}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function formatChars(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }

  return String(value);
}

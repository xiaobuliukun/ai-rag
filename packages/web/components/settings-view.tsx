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
  Sun,
  Type,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { useI18n, type Locale } from "@/lib/i18n";
import { getAIConfig, saveAIConfig } from "@/lib/api";

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

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
      });
      setAIStatus(t("settings.aiSaved"));
    } catch (err) {
      setAIError(err instanceof Error ? err.message : t("settings.aiSaveFailed"));
    } finally {
      setIsSavingAI(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
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

      <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
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

      <section className="space-y-6 rounded-lg border bg-card p-5 shadow-sm">
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
              <span className="text-muted-foreground">{pageBrightness}%</span>
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
            "--reader-brightness": `${pageBrightness / 100}`,
            "--paper-texture-opacity": paperTexture ? "0.22" : "0",
          } as React.CSSProperties}
        >
          <p className="font-semibold">{t("settings.preview")}</p>
          <p className="mt-2 text-muted-foreground">
            {t("settings.previewText")}
          </p>
        </div>
      </section>

      <section className="space-y-6 rounded-lg border bg-card p-5 shadow-sm">
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
                "text-sm",
                aiError ? "text-destructive" : "text-muted-foreground",
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

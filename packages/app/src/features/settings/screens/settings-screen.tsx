import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from "react-native";
import { CheckCircle2, RotateCcw, Save, Server, SlidersHorizontal } from "lucide-react-native";
import type { AiRuntimeConfig } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { AppText, Button, Card, Field, Screen, SectionHeader } from "@/design-system/ui/primitives";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";

export function SettingsScreen() {
  const { colors } = useAppTheme();
  const { settings, setApiBaseUrl, setApiAccessToken, setAiConfig, resetSettings } = useAppSettings();
  const api = useMemo(
    () => createMoxuApi(settings.apiBaseUrl, settings.apiAccessToken),
    [settings.apiAccessToken, settings.apiBaseUrl]
  );
  const [apiBaseUrl, setApiBaseUrlDraft] = useState(settings.apiBaseUrl);
  const [apiAccessToken, setApiAccessTokenDraft] = useState(settings.apiAccessToken ?? "");
  const [aiConfig, setAiConfigDraft] = useState<AiRuntimeConfig>(settings.aiConfig);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState<string | undefined>();
  const [clearApiKey, setClearApiKey] = useState(false);

  useEffect(() => {
    setApiBaseUrlDraft(settings.apiBaseUrl);
    setApiAccessTokenDraft(settings.apiAccessToken ?? "");
    setAiConfigDraft(settings.aiConfig);
  }, [settings.aiConfig, settings.apiAccessToken, settings.apiBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    api
      .getAIConfig()
      .then((config) => {
        if (!cancelled) {
          setAiConfigDraft({
            mode: config.mode,
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.hasApiKey ? "" : settings.aiConfig.apiKey,
            embeddingProvider: config.embeddingProvider,
            embeddingModel: config.embeddingModel,
            ragSourceCount: config.ragSourceCount,
            ragContextChars: config.ragContextChars,
            ragExcerptChars: config.ragExcerptChars
          });
          setHasStoredApiKey(config.hasApiKey);
          setMaskedApiKey(config.maskedApiKey);
          setClearApiKey(false);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [api, settings.aiConfig.apiKey]);

  const patchAiConfig = (patch: Partial<AiRuntimeConfig>) => {
    setAiConfigDraft((current) => ({
      ...current,
      ...patch
    }));
  };

  const handleTest = async () => {
    setIsTesting(true);
    setStatus(null);
    setError(null);
    try {
      await createMoxuApi(apiBaseUrl, apiAccessToken).getStatus();
      setStatus("连接成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "连接失败");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    setError(null);

    try {
      await setApiBaseUrl(apiBaseUrl);
      await setApiAccessToken(apiAccessToken);
      const saved = await createMoxuApi(apiBaseUrl, apiAccessToken).saveAIConfig({
        ...aiConfig,
        apiKey: clearApiKey ? undefined : aiConfig.apiKey?.trim() || undefined,
        clearApiKey
      });
      await setAiConfig({
        mode: saved.mode,
        baseUrl: saved.baseUrl,
        model: saved.model,
        apiKey: "",
        embeddingProvider: saved.embeddingProvider,
        embeddingModel: saved.embeddingModel,
        ragSourceCount: saved.ragSourceCount,
        ragContextChars: saved.ragContextChars,
        ragExcerptChars: saved.ragExcerptChars
      });
      setAiConfigDraft((current) => ({ ...current, apiKey: "" }));
      setHasStoredApiKey(saved.hasApiKey);
      setMaskedApiKey(saved.maskedApiKey);
      setClearApiKey(false);
      setStatus("设置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionHeader title="设置" subtitle="连接本地服务，调整移动端 AI 与 RAG 参数" />

          <Card style={styles.section}>
            <View style={styles.sectionTitle}>
              <Server color={colors.primary} size={20} />
              <AppText variant="subtitle">本地 API</AppText>
            </View>
            <AppText variant="caption" tone="muted">
              真机调试时请填写电脑的局域网 IP，例如 http://192.168.1.8:3001/api。
            </AppText>
            <Field
              value={apiBaseUrl}
              onChangeText={setApiBaseUrlDraft}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://127.0.0.1:3001/api"
            />
            <LabeledField
              label="API 访问令牌（可选）"
              value={apiAccessToken}
              onChangeText={setApiAccessTokenDraft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="与服务端 API_ACCESS_TOKEN 一致"
            />
            <View style={styles.buttonRow}>
              <Button title="测试连接" variant="secondary" loading={isTesting} onPress={handleTest} />
              <Button
                title="恢复默认"
                variant="ghost"
                icon={<RotateCcw color={colors.primary} size={16} />}
                onPress={() => {
                  void resetSettings();
                  setStatus("已恢复默认设置");
                }}
              />
            </View>
          </Card>

          <Card style={styles.section}>
            <View style={styles.sectionTitle}>
              <SlidersHorizontal color={colors.primary} size={20} />
              <AppText variant="subtitle">AI 模型</AppText>
            </View>
            <View style={styles.modeRow}>
              <Button
                title="本地抽取"
                variant={aiConfig.mode === "local" ? "primary" : "secondary"}
                onPress={() => patchAiConfig({ mode: "local" })}
                style={styles.modeButton}
              />
              <Button
                title="OpenAI 兼容"
                variant={aiConfig.mode === "openai-compatible" ? "primary" : "secondary"}
                onPress={() => patchAiConfig({ mode: "openai-compatible" })}
                style={styles.modeButton}
              />
            </View>
            <LabeledField
              label="Base URL"
              value={aiConfig.baseUrl ?? ""}
              placeholder="https://api.openai.com/v1"
              onChangeText={(value) => patchAiConfig({ baseUrl: value })}
            />
            <LabeledField
              label="模型"
              value={aiConfig.model ?? ""}
              placeholder="gpt-4o-mini"
              onChangeText={(value) => patchAiConfig({ model: value })}
            />
            <LabeledField
              label="API Key"
              value={aiConfig.apiKey ?? ""}
              placeholder={hasStoredApiKey ? (maskedApiKey ?? "••••••••") : "sk-..."}
              secureTextEntry
              editable={!clearApiKey}
              onChangeText={(value) => {
                patchAiConfig({ apiKey: value });
                if (value) {
                  setClearApiKey(false);
                }
              }}
            />
            <AppText variant="caption" tone="muted">
              {hasStoredApiKey ? "API Key 已保存在服务端，留空会保留现有密钥。" : "服务端尚未保存 API Key。"}
            </AppText>
            {hasStoredApiKey ? (
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <AppText variant="label">清除服务端 API Key</AppText>
                  <AppText variant="caption" tone="muted">
                    只有显式开启后保存才会删除。
                  </AppText>
                </View>
                <Switch
                  value={clearApiKey}
                  onValueChange={(enabled) => {
                    setClearApiKey(enabled);
                    if (enabled) {
                      patchAiConfig({ apiKey: "" });
                    }
                  }}
                  trackColor={{
                    false: colors.surfaceMuted,
                    true: colors.danger
                  }}
                  thumbColor={colors.surface}
                />
              </View>
            ) : null}
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <AppText variant="label">远程 Embedding</AppText>
                <AppText variant="caption" tone="muted">
                  关闭时使用本地 hash 向量。
                </AppText>
              </View>
              <Switch
                value={aiConfig.embeddingProvider === "openai-compatible"}
                onValueChange={(enabled) =>
                  patchAiConfig({
                    embeddingProvider: enabled ? "openai-compatible" : "local"
                  })
                }
                trackColor={{
                  false: colors.surfaceMuted,
                  true: colors.primary
                }}
                thumbColor={colors.surface}
              />
            </View>
            <LabeledField
              label="Embedding 模型"
              value={aiConfig.embeddingModel ?? ""}
              placeholder="text-embedding-3-small"
              onChangeText={(value) => patchAiConfig({ embeddingModel: value })}
            />
          </Card>

          <Card style={styles.section}>
            <AppText variant="subtitle">RAG 参数</AppText>
            <Stepper
              label="引用数量"
              value={aiConfig.ragSourceCount ?? 5}
              min={2}
              max={10}
              step={1}
              onChange={(value) => patchAiConfig({ ragSourceCount: value })}
            />
            <Stepper
              label="上下文字数"
              value={aiConfig.ragContextChars ?? 12000}
              min={4000}
              max={24000}
              step={1000}
              onChange={(value) => patchAiConfig({ ragContextChars: value })}
            />
            <Stepper
              label="摘录长度"
              value={aiConfig.ragExcerptChars ?? 520}
              min={240}
              max={900}
              step={20}
              onChange={(value) => patchAiConfig({ ragExcerptChars: value })}
            />
          </Card>

          {status || error ? (
            <Card>
              <View style={styles.feedback}>
                {status ? <CheckCircle2 color={colors.success} size={18} /> : null}
                <AppText tone={error ? "danger" : "primary"}>{error ?? status}</AppText>
              </View>
            </Card>
          ) : null}

          <Button
            title="保存设置"
            loading={isSaving}
            icon={<Save color={colors.primaryForeground} size={18} />}
            onPress={handleSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function LabeledField({ label, ...props }: { label: string } & React.ComponentProps<typeof Field>) {
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="label">{label}</AppText>
      <Field {...props} />
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const decrease = () => onChange(Math.max(min, value - step));
  const increase = () => onChange(Math.min(max, value + step));

  return (
    <View style={styles.stepper}>
      <View style={styles.switchText}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" tone="muted">
          {value}
        </AppText>
      </View>
      <View style={styles.stepperButtons}>
        <Button title="-" variant="secondary" onPress={decrease} />
        <Button title="+" variant="secondary" onPress={increase} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1
  },
  content: {
    padding: 18,
    gap: 16
  },
  section: {
    gap: 14
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  modeRow: {
    flexDirection: "row",
    gap: 10
  },
  modeButton: {
    flex: 1
  },
  fieldGroup: {
    gap: 8
  },
  switchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  switchText: {
    flex: 1,
    minWidth: 0
  },
  stepper: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  stepperButtons: {
    flexDirection: "row",
    gap: 8
  },
  feedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  }
});

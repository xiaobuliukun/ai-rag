import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { Bot, ExternalLink, Send, User } from "lucide-react-native";
import type { AiChatHistoryMessage, AiChatResponse, AiSource } from "@moxu/shared";
import { useAppTheme } from "@/application/providers/root-providers";
import { useAppSettings } from "@/application/settings/settings-provider";
import { AppText, Button, Card, Field, Screen, SectionHeader } from "@/design-system/ui/primitives";
import { createMoxuApi } from "@/infrastructure/api/moxu-api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AiChatResponse;
};

const prompts = ["总结当前章节", "解释核心概念", "给我出三道复习题"];

export function AssistantScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { settings, readingContext } = useAppSettings();
  const api = useMemo(
    () => createMoxuApi(settings.apiBaseUrl, settings.apiAccessToken),
    [settings.apiAccessToken, settings.apiBaseUrl]
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const submit = async (value: string) => {
    const message = value.trim();
    if (!message || isLoading) {
      return;
    }

    const history = messages
      .filter((item) => item.content.trim())
      .map<AiChatHistoryMessage>((item) => ({
        role: item.role,
        content: item.content
      }))
      .slice(-12);
    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      content: message
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await api.chatWithAI({
        message,
        context: readingContext,
        config: settings.aiConfig,
        history
      });
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: response.answer,
          response
        }
      ]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 请求失败");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader
            title="AI 助手"
            subtitle={
              readingContext?.chapterTitle
                ? `上下文：${readingContext.chapterTitle}`
                : "默认从全库检索资料"
            }
          />

          <Card style={styles.promptCard}>
            <AppText variant="label">快捷提问</AppText>
            <View style={styles.promptRow}>
              {prompts.map((prompt) => (
                <Button
                  key={prompt}
                  title={prompt}
                  variant="secondary"
                  onPress={() => void submit(prompt)}
                  disabled={isLoading}
                  style={styles.promptButton}
                />
              ))}
            </View>
          </Card>

          {messages.length === 0 ? (
            <Card style={styles.empty}>
              <Bot color={colors.primary} size={28} />
              <AppText variant="subtitle">可以问书库里的任何内容</AppText>
              <AppText tone="muted" style={styles.emptyText}>
                本地模式会抽取资料原文回答；配置模型后会基于检索片段综合回答。
              </AppText>
            </Card>
          ) : (
            <View style={styles.messageList}>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onOpenSource={(source) =>
                    router.push({
                      pathname: "/chapter/[bookId]/[chapterId]",
                      params: { bookId: source.bookId, chapterId: source.chapterId }
                    })
                  }
                />
              ))}
            </View>
          )}

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <AppText tone="muted">正在整理资料</AppText>
            </View>
          ) : null}

          {error ? (
            <Card>
              <AppText tone="danger">{error}</AppText>
            </Card>
          ) : null}
        </ScrollView>

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Field
            value={input}
            onChangeText={setInput}
            placeholder="向墨序提问"
            multiline
            style={styles.input}
          />
          <Button
            title=""
            disabled={!input.trim() || isLoading}
            onPress={() => void submit(input)}
            icon={<Send color={colors.primaryForeground} size={19} />}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MessageBubble({
  message,
  onOpenSource
}: {
  message: Message;
  onOpenSource: (source: AiSource) => void;
}) {
  const { colors } = useAppTheme();
  const isUser = message.role === "user";
  const sources = message.response?.sources ?? [];

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser ? (
        <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted }]}>
          <Bot color={colors.primary} size={16} />
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.primary : colors.surface,
            borderColor: isUser ? colors.primary : colors.border
          }
        ]}
      >
        <AppText tone={isUser ? "default" : "default"} style={isUser ? { color: colors.primaryForeground } : undefined}>
          {message.content}
        </AppText>
        {message.response?.notice ? (
          <AppText variant="caption" tone="danger" style={styles.notice}>
            {message.response.notice}
          </AppText>
        ) : null}
        {sources.length > 0 ? (
          <View style={[styles.sourceList, { borderTopColor: colors.border }]}>
            <AppText variant="caption" tone="muted">
              来源
            </AppText>
            {sources.map((source, index) => (
              <Button
                key={source.id}
                title={`[${index + 1}] ${source.chapterTitle}`}
                variant="secondary"
                onPress={() => onOpenSource(source)}
                icon={<ExternalLink color={colors.foreground} size={14} />}
                style={styles.sourceButton}
              />
            ))}
          </View>
        ) : null}
      </View>
      {isUser ? (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <User color={colors.primaryForeground} size={16} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: 18,
    gap: 16
  },
  promptCard: {
    gap: 12
  },
  promptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  promptButton: {
    flexGrow: 1
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 32
  },
  emptyText: {
    textAlign: "center"
  },
  messageList: {
    gap: 12
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9
  },
  messageRowUser: {
    justifyContent: "flex-end"
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  bubble: {
    maxWidth: "84%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12
  },
  notice: {
    marginTop: 8
  },
  sourceList: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10
  },
  sourceButton: {
    alignSelf: "stretch"
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 14
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: 10
  }
});

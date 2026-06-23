import * as React from "react";
import { useStore } from "@/store/useStore";

export const dictionaries = {
  "zh-CN": {
    nav: {
      home: "首页",
      search: "搜索",
      settings: "设置",
      library: "书库",
      localUser: "本地用户",
      aiAssistant: "AI 助手",
    },
    library: {
      title: "书库",
      count: "{count} 本本地书籍",
      emptyHint: "扫描本地文件夹，生成你的阅读书库",
      searchPlaceholder: "搜索书籍...",
      scanTitle: "扫描书库",
      scanPlaceholder: "/Users/me/books",
      scanning: "扫描中",
      scan: "扫描",
      noMatches: "没有匹配的书籍。",
      noBooks: "还没有扫描书籍。",
      loadFailed: "加载书籍失败",
      scanFailed: "扫描失败",
      pathRequired: "请输入本地书籍根目录路径",
    },
    book: {
      chaptersRead: "已读 {read}/{total} 章",
      noChapters: "这本书还没有章节。",
      notStarted: "未开始",
      chapters: "章",
    },
    reader: {
      progress: "阅读进度",
      save: "保存",
      markRead: "标记已读",
      progressSaved: "进度已保存",
      saveFailed: "保存进度失败",
      noContent: "这一章没有保存正文。",
      previous: "上一章",
      next: "下一章",
    },
    search: {
      title: "搜索",
      subtitle: "标题、章节、Markdown 正文",
      placeholder: "搜索你的书库...",
      failed: "搜索失败",
      noMatches: "没有找到匹配结果。",
      noQuery: "还没有输入关键词。",
      inBook: "来自 {book}",
    },
    settings: {
      title: "设置",
      subtitle: "阅读界面",
      theme: "主题",
      system: "跟随系统",
      light: "浅色",
      dark: "深色",
      reader: "阅读器",
      fontSize: "字号",
      lineHeight: "行高",
      preview: "预览",
      previewText: "密集笔记也需要稳定的节奏、清晰的层次和舒展的行距。",
      ai: "AI",
      local: "本地",
      openaiCompatible: "OpenAI 兼容",
      baseUrl: "Base URL",
      model: "模型",
      apiKey: "API Key",
      language: "语言",
      chinese: "中文",
      english: "English",
    },
    ai: {
      title: "AI 助手",
      libraryContext: "书库上下文",
      noChapter: "未打开章节。",
      currentChapterReady: "当前章节已就绪。",
      selectionCaptured: "已捕获选中文本。",
      summarize: "总结",
      explain: "解释",
      quizMe: "考考我",
      thinking: "思考中",
      ask: "提问",
      closePanel: "关闭 AI 面板",
      send: "发送",
      requestFailed: "AI 请求失败",
    },
  },
  "en-US": {
    nav: {
      home: "Home",
      search: "Search",
      settings: "Settings",
      library: "Library",
      localUser: "Local User",
      aiAssistant: "AI Assistant",
    },
    library: {
      title: "Library",
      count: "{count} books in your local collection",
      emptyHint: "Scan a local folder to build your reading library",
      searchPlaceholder: "Search books...",
      scanTitle: "Scan Library",
      scanPlaceholder: "/Users/me/books",
      scanning: "Scanning",
      scan: "Scan",
      noMatches: "No books match your search.",
      noBooks: "No books scanned yet.",
      loadFailed: "Failed to load books",
      scanFailed: "Scan failed",
      pathRequired: "Please enter a local library root path",
    },
    book: {
      chaptersRead: "{read}/{total} chapters read",
      noChapters: "No chapters found for this book.",
      notStarted: "Not started",
      chapters: "chapters",
    },
    reader: {
      progress: "Reading progress",
      save: "Save",
      markRead: "Mark read",
      progressSaved: "Progress saved",
      saveFailed: "Failed to save progress",
      noContent: "This chapter has no saved content.",
      previous: "Previous Chapter",
      next: "Next Chapter",
    },
    search: {
      title: "Search",
      subtitle: "Titles, chapters, Markdown",
      placeholder: "Search your library...",
      failed: "Search failed",
      noMatches: "No matches found.",
      noQuery: "No query yet.",
      inBook: "in {book}",
    },
    settings: {
      title: "Settings",
      subtitle: "Reading surface",
      theme: "Theme",
      system: "System",
      light: "Light",
      dark: "Dark",
      reader: "Reader",
      fontSize: "Font size",
      lineHeight: "Line height",
      preview: "Preview",
      previewText: "Dense notes stay readable with steady spacing and a calm line rhythm.",
      ai: "AI",
      local: "Local",
      openaiCompatible: "OpenAI-compatible",
      baseUrl: "Base URL",
      model: "Model",
      apiKey: "API Key",
      language: "Language",
      chinese: "中文",
      english: "English",
    },
    ai: {
      title: "AI Assistant",
      libraryContext: "Library context",
      noChapter: "No chapter open.",
      currentChapterReady: "Current chapter ready.",
      selectionCaptured: "Selection captured.",
      summarize: "Summarize",
      explain: "Explain",
      quizMe: "Quiz me",
      thinking: "Thinking",
      ask: "Ask",
      closePanel: "Close AI panel",
      send: "Send",
      requestFailed: "AI request failed",
    },
  },
} as const;

export type Locale = keyof typeof dictionaries;
export type Dictionary = (typeof dictionaries)["zh-CN"];

type NestedKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : `${K}.${NestedKey<T[K]>}`;
}[keyof T & string];

export type TranslationKey = NestedKey<Dictionary>;

function readPath(source: unknown, key: TranslationKey) {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: Record<string, string | number>,
) {
  const template = readPath(dictionaries[locale], key);
  const fallback = readPath(dictionaries["zh-CN"], key);
  const text =
    typeof template === "string"
      ? template
      : typeof fallback === "string"
        ? fallback
        : key;

  return Object.entries(values ?? {}).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    text,
  );
}

export function useI18n() {
  const locale = useStore((state) => state.locale);
  const t = React.useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );

  return {
    locale,
    t,
  };
}

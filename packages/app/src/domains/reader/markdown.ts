export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; language?: string; text: string }
  | { type: "image"; alt: string; src: string };

const imagePattern = /^!\[([^\]]*)\]\(([^)]+)\)$/;

export function parseMarkdown(content = ""): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let codeLanguage: string | undefined;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (code) {
      if (trimmed.startsWith("```")) {
        blocks.push({ type: "code", language: codeLanguage, text: code.join("\n") });
        code = null;
        codeLanguage = undefined;
      } else {
        code.push(rawLine);
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      code = [];
      codeLanguage = trimmed.slice(3).trim() || undefined;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const image = trimmed.match(imagePattern);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push({ type: "image", alt: image[1] ?? "", src: image[2] ?? "" });
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1]?.length ?? 1,
        text: heading[2] ?? ""
      });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      list.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: trimmed.replace(/^>\s?/, "") });
      continue;
    }

    paragraph.push(trimmed);
  }

  if (code) {
    blocks.push({ type: "code", language: codeLanguage, text: code.join("\n") });
  }
  flushParagraph();
  flushList();

  return blocks;
}

export function resolveMarkdownImageSrc(
  src: string,
  apiBaseUrl: string,
  bookId?: string,
  chapterFileName?: string
) {
  const normalized = src.trim().replace(/^<|>$/g, "");
  if (!normalized) {
    return "";
  }

  if (/^(https?:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  if (!bookId) {
    return "";
  }

  const path = normalized.startsWith("/")
    ? normalized.slice(1)
    : normalizeRelativePath(
        [...(chapterFileName?.split("/").slice(0, -1) ?? []), ...normalized.split("/")].join("/")
      );
  const params = new URLSearchParams({ path });

  return `${apiBaseUrl.replace(/\/$/, "")}/assets/books/${bookId}/files?${params.toString()}`;
}

function normalizeRelativePath(filePath: string) {
  const parts: string[] = [];
  for (const part of filePath.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

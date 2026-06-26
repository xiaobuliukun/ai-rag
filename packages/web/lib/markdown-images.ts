import { getBookAssetUrl } from "@/lib/api";

export function resolveMarkdownImageSrc(
  src: string,
  bookId?: string,
  chapterFileName?: string,
) {
  const normalizedSrc = normalizeMarkdownImageSrc(src);

  if (!normalizedSrc) {
    return "";
  }

  if (/^(https?:|data:|blob:)/i.test(normalizedSrc)) {
    return normalizedSrc;
  }

  if (!bookId) {
    return normalizedSrc;
  }

  const rootRelativePath = normalizedSrc.startsWith("/")
    ? normalizeRelativePath(normalizedSrc.slice(1))
    : normalizeRelativePath(
        [
          ...(chapterFileName?.split("/").slice(0, -1) ?? []),
          ...normalizedSrc.split("/"),
        ].join("/"),
      );

  return getBookAssetUrl(bookId, rootRelativePath);
}

export function normalizeMarkdownImageSrc(src: string) {
  const trimmed = src.trim().replace(/^<|>$/g, "");
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  return safeDecodeLocalPath(trimmed.split("#")[0].split("?")[0]);
}

function safeDecodeLocalPath(path: string) {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
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

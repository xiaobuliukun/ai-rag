import type { ImageURISource } from "react-native";

export function resolveBookCoverSource({
  apiBaseUrl,
  apiAccessToken,
  bookId,
  coverImage
}: {
  apiBaseUrl: string;
  apiAccessToken?: string;
  bookId: string;
  coverImage?: string | null;
}): ImageURISource | undefined {
  const normalizedCover = coverImage?.trim();
  if (!normalizedCover) {
    return undefined;
  }

  const apiRoot = apiBaseUrl.replace(/\/$/, "");
  const isDirectImage = /^(https?:|data:|blob:)/i.test(normalizedCover);
  const uri = isDirectImage
    ? normalizedCover
    : apiRoot +
      "/assets/books/" +
      encodeURIComponent(bookId) +
      "/files?" +
      new URLSearchParams({ path: normalizedCover }).toString();
  const accessToken = apiAccessToken?.trim();
  const isApiAsset = uri.startsWith(apiRoot + "/assets/");

  return {
    uri,
    ...(accessToken && isApiAsset
      ? { headers: { Authorization: "Bearer " + accessToken } }
      : {})
  };
}

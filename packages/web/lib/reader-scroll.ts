export const APP_SCROLL_CONTAINER_ATTRIBUTE = "data-app-scroll-container";
export const APP_SCROLL_CONTAINER_SELECTOR =
  `[${APP_SCROLL_CONTAINER_ATTRIBUTE}]`;

interface ReadingProgressMetrics {
  contentTop: number;
  contentHeight: number;
  viewportTop: number;
  viewportHeight: number;
}

interface ScrollPercentageMetrics {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

export function findAppScrollContainer(
  root: ParentNode = document,
): HTMLElement | null {
  return root.querySelector<HTMLElement>(APP_SCROLL_CONTAINER_SELECTOR);
}

export function calculateReadingProgress({
  contentTop,
  contentHeight,
  viewportTop,
  viewportHeight,
}: ReadingProgressMetrics) {
  const boundedViewportHeight = Math.max(1, viewportHeight);
  const readableHeight = Math.max(
    1,
    contentHeight - boundedViewportHeight * 0.35,
  );
  const readDistance = Math.min(
    readableHeight,
    Math.max(
      0,
      viewportTop + boundedViewportHeight * 0.55 - contentTop,
    ),
  );

  return Math.round((readDistance / readableHeight) * 100);
}

export function calculateScrollPercentage({
  scrollTop,
  scrollHeight,
  viewportHeight,
}: ScrollPercentageMetrics) {
  const scrollableHeight = Math.max(0, scrollHeight - viewportHeight);
  if (scrollableHeight === 0) {
    return 0;
  }

  return Math.round(
    (Math.min(scrollableHeight, Math.max(0, scrollTop)) / scrollableHeight) *
      100,
  );
}

export function calculateScrollTopFromPercentage({
  position,
  scrollHeight,
  viewportHeight,
}: Omit<ScrollPercentageMetrics, "scrollTop"> & { position: number }) {
  const boundedPosition = Math.min(100, Math.max(0, position));
  return (
    (boundedPosition / 100) * Math.max(0, scrollHeight - viewportHeight)
  );
}

export function parseBookmarkPosition(
  value: string | string[] | number | null | undefined,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    candidate === null ||
    candidate === undefined ||
    (typeof candidate === "string" && !candidate.trim())
  ) {
    return undefined;
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(0, Math.round(parsed)))
    : undefined;
}

export function buildBookmarkReaderHref(
  bookId: string,
  chapterId: string,
  position: number,
) {
  const boundedPosition = parseBookmarkPosition(position) ?? 0;
  return `/book/${encodeURIComponent(bookId)}/${encodeURIComponent(
    chapterId,
  )}?position=${boundedPosition}`;
}

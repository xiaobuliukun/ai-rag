const MAX_REMOTE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_REMOTE_REQUEST_TIMEOUT_MS = 1000;

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_EMBEDDING_REQUEST_TIMEOUT_MS = 30_000;

export function normalizeRemoteBaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Base URL must be an absolute http:// or https:// URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL must be an absolute http:// or https:// URL');
  }
  if (url.search || url.hash) {
    throw new Error('Base URL must not include a query string or fragment');
  }

  return url.toString().replace(/\/+$/, '');
}

export function buildRemoteRequestUrl(baseUrl: string, endpoint: string) {
  const normalizedBaseUrl = normalizeRemoteBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/${endpoint.replace(/^\/+/, '')}`;
}

export function createRemoteRequestSignal(
  configuredTimeout: string | undefined,
  fallbackTimeout: number,
) {
  return AbortSignal.timeout(
    parseRemoteRequestTimeout(configuredTimeout, fallbackTimeout),
  );
}

export function parseRemoteRequestTimeout(
  value: string | undefined,
  fallback: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_REMOTE_REQUEST_TIMEOUT_MS) {
    return fallback;
  }

  return Math.min(Math.round(parsed), MAX_REMOTE_REQUEST_TIMEOUT_MS);
}

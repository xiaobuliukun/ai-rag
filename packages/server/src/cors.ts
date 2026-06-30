import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { RequestHandler } from 'express';

const DEFAULT_CORS_ORIGINS = ['http://127.0.0.1:3000', 'http://localhost:3000'];
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function parseCorsOrigins(value?: string) {
  const origins = (value ?? process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN)
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins?.length ? origins : DEFAULT_CORS_ORIGINS;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins = parseCorsOrigins(),
) {
  return (
    !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)
  );
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = parseCorsOrigins();

  return {
    origin(origin, callback) {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    },
  };
}

export function isRemoteApiAllowed(value = process.env.ALLOW_REMOTE_API) {
  return value === 'true' || value === '1';
}

export function isRequestHostAllowed(hostHeader?: string) {
  if (isRemoteApiAllowed()) {
    return true;
  }

  if (!hostHeader) {
    return true;
  }

  return LOCAL_HOSTNAMES.has(extractHostname(hostHeader));
}

export function createLocalAccessGuard(): RequestHandler {
  return (request, response, next) => {
    if (isRequestHostAllowed(request.headers.host)) {
      next();
      return;
    }

    response.status(403).json({
      statusCode: 403,
      message:
        'Remote API access is disabled. Set ALLOW_REMOTE_API=true to allow non-local hosts.',
    });
  };
}

function extractHostname(hostHeader: string) {
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  }

  return trimmed.split(':')[0] ?? trimmed;
}

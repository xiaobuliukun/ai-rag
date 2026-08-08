import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';

const DEFAULT_CORS_ORIGINS = ['http://127.0.0.1:3000', 'http://localhost:3000'];
const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  // Android Emulator forwards this special host alias to the development
  // machine's loopback interface. The socket address must still be loopback,
  // so a remote client cannot gain access by forging this Host header.
  '10.0.2.2',
]);

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
  if (!hostHeader) {
    return false;
  }

  if (isRemoteApiAllowed()) {
    return true;
  }

  return LOCAL_HOSTNAMES.has(extractHostname(hostHeader));
}

export function isLocalRemoteAddress(remoteAddress?: string) {
  if (!remoteAddress) {
    return false;
  }

  let normalized = remoteAddress.trim().toLowerCase();
  const zoneIndex = normalized.indexOf('%');
  if (zoneIndex >= 0) {
    normalized = normalized.slice(0, zoneIndex);
  }
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.slice('::ffff:'.length);
  }

  return normalized === '::1' || normalized.startsWith('127.');
}

export function isLocalRequest(hostHeader?: string, remoteAddress?: string) {
  if (!hostHeader) {
    return false;
  }

  return (
    LOCAL_HOSTNAMES.has(extractHostname(hostHeader)) &&
    isLocalRemoteAddress(remoteAddress)
  );
}

export function isAccessTokenValid(
  authorizationHeader?: string,
  configuredToken = process.env.API_ACCESS_TOKEN,
) {
  const expected = configuredToken?.trim();
  if (!expected) {
    return false;
  }

  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const received = match?.[1]?.trim();
  if (!received) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function createLocalAccessGuard(): RequestHandler {
  return (request, response, next) => {
    const origin =
      typeof request.headers.origin === 'string'
        ? request.headers.origin
        : undefined;
    if (origin && !isCorsOriginAllowed(origin)) {
      response.status(403).json({
        statusCode: 403,
        message: 'Request origin is not allowed.',
      });
      return;
    }

    if (isLocalRequest(request.headers.host, request.socket.remoteAddress)) {
      next();
      return;
    }

    if (isRemoteApiAllowed()) {
      const configuredToken = process.env.API_ACCESS_TOKEN?.trim();
      if (!configuredToken) {
        response.status(403).json({
          statusCode: 403,
          message:
            'Remote API access requires API_ACCESS_TOKEN to be configured.',
        });
        return;
      }

      const authorization =
        typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : undefined;

      if (isAccessTokenValid(authorization, configuredToken)) {
        next();
        return;
      }

      response.setHeader('WWW-Authenticate', 'Bearer');
      response.status(401).json({
        statusCode: 401,
        message: 'A valid Bearer API access token is required.',
      });
      return;
    }

    response.status(403).json({
      statusCode: 403,
      message:
        'Remote API access is disabled. Set ALLOW_REMOTE_API=true to allow non-local requests.',
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

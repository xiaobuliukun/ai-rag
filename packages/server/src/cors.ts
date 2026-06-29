import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_CORS_ORIGINS = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];

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
  return !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = parseCorsOrigins();

  return {
    origin(origin, callback) {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    },
  };
}

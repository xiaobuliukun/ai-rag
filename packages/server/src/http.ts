import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { createCorsOptions, createLocalAccessGuard } from './cors';

export const DEFAULT_API_BODY_LIMIT = '50mb';

export function configureHttpApplication(app: INestApplication) {
  const bodyLimit =
    process.env.API_BODY_LIMIT?.trim() || DEFAULT_API_BODY_LIMIT;

  app.enableCors(createCorsOptions());
  app.use(createLocalAccessGuard());
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.setGlobalPrefix('api');
}

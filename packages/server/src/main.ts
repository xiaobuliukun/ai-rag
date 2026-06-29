import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createCorsOptions } from './cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(createCorsOptions());

  // Set global prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host); // Use 3001 to avoid conflict with Next.js 3000
}
void bootstrap();

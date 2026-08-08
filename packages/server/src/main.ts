import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttpApplication } from './http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttpApplication(app);

  const port = process.env.PORT ?? 3001;
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host); // Use 3001 to avoid conflict with Next.js 3000
}
void bootstrap();

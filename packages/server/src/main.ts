import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { AppModule } from './app.module';
import { configureHttpApplication } from './http';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttpApplication(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);

  const address = (app.getHttpServer() as Server).address();
  const boundPort =
    typeof address === 'object' && address ? Number(address.port) : port;

  // The desktop host forks this module and uses the structured message to
  // discover an ephemeral port. Running the server directly still emits a
  // human-readable line for command-line users.
  const readyMessage = {
    type: 'moxu-server-ready',
    ready: true,
    host,
    port: boundPort,
  };
  if (typeof process.send === 'function') {
    process.send(readyMessage);
  } else {
    console.log(`Moxu Nest API listening on http://${host}:${boundPort}/api`);
  }

  return app;
}

if (require.main === module) {
  void bootstrap().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof process.send === 'function') {
      process.send({
        type: 'moxu-server-ready',
        ready: false,
        error: { message },
      });
    }
    console.error(message);
    process.exitCode = 1;
  });
}

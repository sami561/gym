import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { env, envInt, loadEnv, serverTransport } from '@app/common';
import { AppModule } from './app.module';
import { RpcToHttpFilter } from './common/rpc-to-http.filter';
import { attachAgentSocketProxy } from './common/agent-proxy';
import { corsOrigins } from './common/cors';
import { DEFAULT_TRUST_PROXY, parseTrustProxy } from './common/trust-proxy';
import { createValidationPipe } from './common/validation';

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: { origin: corsOrigins(), credentials: true },
  });
  // Behind nginx every request comes from the proxy: read the client address from X-Forwarded-For
  // (only when sent by a trusted proxy) so rate limits are per client, not one shared bucket.
  try {
    app.set('trust proxy', parseTrustProxy(env('TRUST_PROXY', DEFAULT_TRUST_PROXY)));
  } catch (err) {
    throw new Error(`Invalid TRUST_PROXY: ${(err as Error).message}`, { cause: err });
  }
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new RpcToHttpFilter());
  app.enableShutdownHooks();

  // The gateway also listens on the bus (without a NATS queue group) to relay
  // access events to every connected back-office screen.
  app.connectMicroservice<MicroserviceOptions>(serverTransport('api-gateway', { broadcast: true }), {
    inheritAppConfig: true,
  });

  const docs = new DocumentBuilder()
    .setTitle('Meliora Gym API')
    .setDescription('API gateway of the Meliora Gym platform — see docs/API.md for the full contract.')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'automation')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, docs));

  await app.startAllMicroservices();
  const port = envInt('GATEWAY_PORT', 4000);
  const server = await app.listen(port);
  attachAgentSocketProxy(app, server);
  new Logger('Bootstrap').log(`API gateway on http://localhost:${port} (docs: /docs)`);
}

void bootstrap();

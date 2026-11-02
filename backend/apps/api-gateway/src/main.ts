import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { envInt, loadEnv, serverTransport } from '@app/common';
import { AppModule } from './app.module';
import { RpcToHttpFilter } from './common/rpc-to-http.filter';
import { attachAgentSocketProxy } from './common/agent-proxy';
import { corsOrigins } from './common/cors';

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create(AppModule, { cors: { origin: corsOrigins(), credentials: true } });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
  );
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

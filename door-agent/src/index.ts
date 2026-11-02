import * as fs from 'fs';
import * as path from 'path';
import { format } from 'util';
import * as dotenv from 'dotenv';
import { DoorAgent } from './agent';
import { ConfigError, parseConfig } from './config';
import { createLogger, errorMessage } from './logger';

dotenv.config();

function readVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function main(): void {
  let config;
  try {
    config = parseConfig(process.env, { isTTY: process.stdout.isTTY });
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\nCopy .env.example to .env and fill it in.\n`);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger({ level: config.logLevel, format: config.logFormat }, { service: 'door-agent' });
  // zkteco-js prints to the console (multi-line errors): keep stdout structured.
  const library = logger.child({ component: 'zkteco-js' });
  console.log = (...args: unknown[]) => library.debug(format(...args));
  console.error = (...args: unknown[]) => library.debug(format(...args));

  const agent = new DoorAgent(config, logger, readVersion());

  process.on('unhandledRejection', (reason) => logger.warn('unhandled rejection', { error: errorMessage(reason) }));
  process.on('uncaughtException', (err) => {
    logger.error('fatal error, exiting so the supervisor restarts the agent', { error: err });
    process.exit(1);
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    const force = setTimeout(() => process.exit(0), 5000);
    agent
      .stop()
      .catch((err) => logger.error('error while stopping', { error: errorMessage(err) }))
      .finally(() => {
        clearTimeout(force);
        process.exit(0);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  agent.start();
}

main();

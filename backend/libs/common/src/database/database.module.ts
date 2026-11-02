import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { env, envBool, envInt } from '../config/env';

/**
 * Database-per-service: each service connects to its own Postgres database
 * (meliora_auth, meliora_membership, ...). `<PREFIX>_DATABASE_URL` overrides everything,
 * otherwise DB_HOST/DB_PORT/DB_USER/DB_PASSWORD + `<PREFIX>_DB_NAME` (default meliora_<prefix>).
 */
export function databaseModule(prefix: string): DynamicModule {
  const key = prefix.toUpperCase();
  return TypeOrmModule.forRootAsync({
    useFactory: () => {
      const url = process.env[`${key}_DATABASE_URL`];
      return {
        type: 'postgres' as const,
        ...(url
          ? { url }
          : {
              host: env('DB_HOST', '127.0.0.1'),
              port: envInt('DB_PORT', 5432),
              username: env('DB_USER', 'postgres'),
              password: process.env.DB_PASSWORD ?? '',
              database: env(`${key}_DB_NAME`, `meliora_${prefix.toLowerCase()}`),
            }),
        autoLoadEntities: true,
        synchronize: envBool('DB_SYNCHRONIZE', true),
        logging: envBool('DB_LOGGING', false) ? ['query', 'error', 'warn'] : ['error'],
        retryAttempts: 20,
        retryDelay: 2000,
      };
    },
  });
}

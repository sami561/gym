import { env } from '@app/common';

export function corsOrigins(): string[] | boolean {
  const raw = env('CORS_ORIGINS', '*');
  return raw === '*' ? true : raw.split(',').map((o) => o.trim()).filter(Boolean);
}

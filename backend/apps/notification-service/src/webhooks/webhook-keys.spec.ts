import { webhookKeys } from './webhook-keys';

describe('webhookKeys', () => {
  const secret = 'a'.repeat(64);
  const authToken = 'b'.repeat(64);

  it('uses both keys in production', () => {
    expect(webhookKeys({ NODE_ENV: 'production', WEBHOOK_SECRET: secret, WEBHOOK_AUTH_TOKEN: authToken })).toEqual({
      keys: { secret, authToken },
      refusal: null,
      warnings: [],
    });
  });

  it('refuses to send unsigned webhooks in production', () => {
    const { refusal } = webhookKeys({ NODE_ENV: 'production', WEBHOOK_AUTH_TOKEN: authToken });
    expect(refusal).toBe('Envoi refusé en production : WEBHOOK_SECRET non configuré.');
  });

  it('never falls back to the signing key as bearer token in production', () => {
    const config = webhookKeys({ NODE_ENV: 'production', WEBHOOK_SECRET: secret, WEBHOOK_AUTH_TOKEN: '' });
    expect(config.refusal).toBe('Envoi refusé en production : WEBHOOK_AUTH_TOKEN non configuré.');
    expect(config.keys.authToken).toBe('');
  });

  it('lists every missing key in production', () => {
    expect(webhookKeys({ NODE_ENV: 'production' }).refusal).toBe(
      'Envoi refusé en production : WEBHOOK_SECRET et WEBHOOK_AUTH_TOKEN non configurés.',
    );
  });

  it.each([undefined, 'development', 'test'])('falls back to WEBHOOK_SECRET as bearer token when NODE_ENV is %p', (nodeEnv) => {
    const config = webhookKeys({ NODE_ENV: nodeEnv, WEBHOOK_SECRET: secret });
    expect(config.keys).toEqual({ secret, authToken: secret });
    expect(config.refusal).toBeNull();
    expect(config.warnings).toEqual([expect.stringContaining('WEBHOOK_AUTH_TOKEN is empty')]);
  });

  it('keeps distinct keys outside production without warnings', () => {
    expect(webhookKeys({ NODE_ENV: 'development', WEBHOOK_SECRET: secret, WEBHOOK_AUTH_TOKEN: authToken })).toEqual({
      keys: { secret, authToken },
      refusal: null,
      warnings: [],
    });
  });

  it('sends unsigned webhooks outside production when no secret is set, with a warning', () => {
    const config = webhookKeys({ NODE_ENV: 'development' });
    expect(config.keys).toEqual({ secret: '', authToken: '' });
    expect(config.refusal).toBeNull();
    expect(config.warnings).toEqual([expect.stringContaining('WEBHOOK_SECRET is empty')]);
  });
});

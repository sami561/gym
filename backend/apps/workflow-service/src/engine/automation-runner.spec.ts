import * as dns from 'dns';
import { TaskAutomation } from '@app/common';
import { AutomationInput, AutomationRunner, automationPolicy, isTextBody } from './automation-runner';

const INPUT: AutomationInput = {
  runId: 'run-1',
  runTitle: 'Onboarding — Amira',
  task: { id: 'task-1', title: 'Prévenir n8n' },
  context: { firstName: 'Amira', host: '169.254.169.254', port: 'abc' },
};

const hook = (url: string, extra: Partial<TaskAutomation> = {}): TaskAutomation => ({ kind: 'WEBHOOK', url, ...extra });

/** Replaces dns.promises.lookup (no real DNS in tests). */
function mockLookup(answer: string[] | Error) {
  return jest.spyOn(dns.promises, 'lookup').mockImplementation((async () => {
    if (answer instanceof Error) throw answer;
    return answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  }) as never);
}

const ENV_KEYS = ['N8N_WEBHOOK_URL', 'AUTOMATION_ALLOWED_HOSTS'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let fetchMock: jest.SpyInstance;
/** Every call answers a fresh Response built by `make` (a body can only be read once). */
const respond = (make: () => Response) => fetchMock.mockImplementation(async () => make());

beforeEach(() => {
  process.env.N8N_WEBHOOK_URL = 'http://n8n:5678/webhook/meliora-events';
  process.env.AUTOMATION_ALLOWED_HOSTS = 'relay.gym.lan, 192.168.1.20:8080';
  fetchMock = jest.spyOn(global, 'fetch');
  respond(() => new Response('{}', { headers: { 'content-type': 'application/json' } }));
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('automation runner', () => {
  it('trusts the n8n host of N8N_WEBHOOK_URL and the AUTOMATION_ALLOWED_HOSTS entries', () => {
    expect(automationPolicy()).toEqual({ allowHosts: ['n8n:5678', 'relay.gym.lan', '192.168.1.20:8080'] });
    process.env.N8N_WEBHOOK_URL = '';
    process.env.AUTOMATION_ALLOWED_HOSTS = '';
    expect(automationPolicy()).toEqual({ allowHosts: [] });
  });

  it('refuses the cloud metadata endpoint, loopback and internal services without calling them', async () => {
    const runner = new AutomationRunner();
    expect(await runner.run(hook('http://169.254.169.254/latest/meta-data/'), INPUT)).toEqual({
      ok: false,
      output: 'Destination interdite : 169.254.169.254',
    });
    expect(await runner.run(hook('http://127.0.0.1:4000/api/users'), INPUT)).toEqual({
      ok: false,
      output: 'Destination interdite : 127.0.0.1',
    });
    expect((await runner.run(hook('http://[::1]:5678/'), INPUT)).output).toBe('Destination interdite : [::1]');
    mockLookup(['10.0.0.12']);
    expect(await runner.run(hook('http://auth-service:3001/'), INPUT)).toEqual({
      ok: false,
      output: 'Destination interdite : auth-service',
    });
    // Another port of a trusted host is not trusted.
    expect((await runner.run(hook('http://n8n:5679/webhook/x'), INPUT)).output).toBe('Destination interdite : n8n');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the URL once its placeholders are filled', async () => {
    const runner = new AutomationRunner();
    expect(await runner.run(hook('http://{{host}}/latest/meta-data/'), INPUT)).toEqual({
      ok: false,
      output: 'Destination interdite : 169.254.169.254',
    });
    expect(await runner.run(hook('http://n8n:{{port}}/webhook/x'), INPUT)).toEqual({ ok: false, output: 'URL invalide.' });
    expect((await runner.run(hook('http://n8n:secret@n8n:5678/webhook/x'), INPUT)).output).toBe(
      "URL invalide : retirez l'identifiant et le mot de passe de l'URL.",
    );
    mockLookup(new Error('ENOTFOUND'));
    expect((await runner.run(hook('https://hooks.example.invalid/x'), INPUT)).output).toBe(
      'Destination introuvable : hooks.example.invalid',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls n8n and the allowed hosts without the address check, never following redirects', async () => {
    const lookup = mockLookup(['10.0.0.12']);
    respond(() => new Response('{"message":"Workflow was started"}', { headers: { 'content-type': 'application/json' } }));
    const runner = new AutomationRunner();
    expect(await runner.run(hook('http://n8n:5678/webhook/onboarding', { body: { member: '{{firstName}}' } }), INPUT)).toEqual({
      ok: true,
      output: 'HTTP 200 — {"message":"Workflow was started"}',
    });
    expect((await runner.run(hook('http://relay.gym.lan/open', { method: 'GET' }), INPUT)).ok).toBe(true);
    expect((await runner.run(hook('http://192.168.1.20:8080/hook'), INPUT)).ok).toBe(true);
    expect(lookup).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe('http://n8n:5678/webhook/onboarding');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(JSON.parse(init.body as string)).toMatchObject({ runId: 'run-1', task: { id: 'task-1' }, member: 'Amira' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET', body: undefined, redirect: 'manual' });
  });

  it('calls public destinations and treats a redirect as a failure', async () => {
    mockLookup(['93.184.216.34']);
    const runner = new AutomationRunner();
    expect(await runner.run(hook('https://hooks.example.com/x'), INPUT)).toEqual({ ok: true, output: 'HTTP 200 — {}' });
    respond(() => new Response('moved', { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    expect(await runner.run(hook('https://hooks.example.com/x'), INPUT)).toEqual({
      ok: false,
      output: 'Redirection refusée (HTTP 302)',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps at most 1000 characters of text or JSON bodies, and nothing of other bodies', async () => {
    mockLookup(['93.184.216.34']);
    const runner = new AutomationRunner();
    const run = () => runner.run(hook('https://hooks.example.com/x'), INPUT);

    respond(() => new Response('x'.repeat(50_000), { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    const { output } = await run();
    expect(output).toHaveLength(1001);
    expect(output).toBe(`HTTP 200 — ${'x'.repeat(1000 - 'HTTP 200 — '.length)}…`);

    respond(() => new Response('{"message":"Unknown webhook"}', { status: 404, headers: { 'content-type': 'application/json' } }));
    expect(await run()).toEqual({ ok: false, output: 'HTTP 404 — {"message":"Unknown webhook"}' });

    respond(() => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { 'content-type': 'image/png' } }));
    expect(await run()).toEqual({ ok: true, output: 'HTTP 200' });

    // No content type: unknown, so not kept either.
    respond(() => new Response(new TextEncoder().encode('{"token":"abc"}')));
    expect(await run()).toEqual({ ok: true, output: 'HTTP 200' });
  });

  it('reports network errors and timeouts in French', async () => {
    mockLookup(['93.184.216.34']);
    const runner = new AutomationRunner();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await runner.run(hook('https://hooks.example.com/x'), INPUT)).toEqual({ ok: false, output: "Échec de l'appel : fetch failed" });
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(await runner.run(hook('https://hooks.example.com/x'), INPUT)).toEqual({
      ok: false,
      output: "Échec de l'appel : délai dépassé (10 s)",
    });
  });

  it('recognises text and JSON bodies', () => {
    expect(isTextBody('application/json; charset=utf-8')).toBe(true);
    expect(isTextBody('application/problem+json')).toBe(true);
    expect(isTextBody('TEXT/HTML')).toBe(true);
    expect(isTextBody('image/png')).toBe(false);
    expect(isTextBody('application/octet-stream')).toBe(false);
    expect(isTextBody('')).toBe(false);
    expect(isTextBody(null)).toBe(false);
  });
});

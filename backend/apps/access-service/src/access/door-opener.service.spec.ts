import type { Socket } from 'socket.io';
import { DoorDriver, loadEnv } from '@app/common';
import { AgentRegistry } from '../agents/agent-registry.service';
import { Door } from '../doors/door.entity';
import { REASONS } from './access-decision';
import { DoorOpener } from './door-opener.service';

function relayDoor(config: Record<string, unknown>, agentId: string | null = null): Door {
  return {
    id: '7d3e9a10-2b4c-4d5e-8f60-718293a4b5c6',
    name: 'Entrée',
    location: null,
    driver: DoorDriver.HTTP_RELAY,
    config,
    unlockSeconds: 4,
    isActive: true,
    allowAppOpen: true,
    agentId,
    agent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('DoorOpener', () => {
  const realFetch = global.fetch;
  const savedNetworks = process.env.RELAY_ALLOWED_NETWORKS;
  let fetchMock: jest.Mock;

  function opener(networks?: string): { opener: DoorOpener; registry: AgentRegistry } {
    loadEnv(); // backend/.env first, so the value below wins
    if (networks === undefined) delete process.env.RELAY_ALLOWED_NETWORKS;
    else process.env.RELAY_ALLOWED_NETWORKS = networks;
    const registry = new AgentRegistry();
    return { opener: new DoorOpener(registry), registry };
  }

  function answer(status: number, body = '') {
    fetchMock.mockResolvedValueOnce(new Response(status === 204 || status === 304 ? null : body, { status }));
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = realFetch;
    if (savedNetworks === undefined) delete process.env.RELAY_ALLOWED_NETWORKS;
    else process.env.RELAY_ALLOWED_NETWORKS = savedNetworks;
  });

  describe('HTTP relay without an agent', () => {
    it('calls a relay on the gym LAN without following redirects', async () => {
      answer(200);
      const result = await opener().opener.open(
        relayDoor({ url: 'http://192.168.1.50/rpc?toggle_after={seconds}', basicAuth: { username: 'admin', password: 'pw' } }),
      );
      expect(result).toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.href).toBe('http://192.168.1.50/rpc?toggle_after=4');
      expect(init).toMatchObject({ method: 'GET', redirect: 'manual', headers: { Authorization: expect.stringMatching(/^Basic /) } });
    });

    it.each([
      ['loopback', 'http://127.0.0.1:4000/api/health'],
      ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
      ['IPv6 loopback', 'http://[::1]/'],
      ['an unlisted private network', 'http://172.17.0.1:5432/'],
    ])('never calls %s', async (_label, url) => {
      const result = await opener().opener.open(relayDoor({ url }));
      expect(result).toMatchObject({ ok: false, error: 'Adresse du relais non autorisée.' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('follows RELAY_ALLOWED_NETWORKS instead of the default ranges', async () => {
      const narrowed = opener('10.20.0.0/16').opener;
      expect(await narrowed.open(relayDoor({ url: 'http://192.168.1.50/open' }))).toMatchObject({ ok: false });
      answer(200);
      expect(await narrowed.open(relayDoor({ url: 'http://10.20.3.4/open' }))).toEqual({ ok: true });
    });

    it('treats a redirect as a failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/' } }));
      const result = await opener().opener.open(relayDoor({ url: 'http://192.168.1.50/open' }));
      expect(result).toMatchObject({ ok: false, error: 'Le relais a répondu 302.' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reports the status of an error answer, never its body', async () => {
      answer(500, 'internal secret: hunter2');
      const result = await opener().opener.open(relayDoor({ url: 'http://192.168.1.50/open' }));
      expect(result).toEqual({ ok: false, error: 'Le relais a répondu 500.' });
    });

    it('reports an unreachable relay and an invalid stored config', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      expect(await opener().opener.open(relayDoor({ url: 'http://192.168.1.50/open' }))).toMatchObject({
        ok: false,
        error: 'Relais de porte injoignable.',
      });
      expect(await opener().opener.open(relayDoor({ url: 'http://192.168.1.50/open', method: 'DELETE' }))).toMatchObject({
        ok: false,
        error: 'Configuration du relais invalide.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('door driven by an agent', () => {
    const AGENT_ID = '0f6b2c1e-4a5d-4e7f-8a9b-0c1d2e3f4a5b';

    function agentSocket(ack: unknown): Socket {
      return {
        id: 'socket-1',
        connected: true,
        timeout: () => ({ emitWithAck: async () => ack }),
        disconnect: () => undefined,
      } as unknown as Socket;
    }

    it('does not pass the relay answer quoted by the agent on to the caller', async () => {
      const { opener: doorOpener, registry } = opener();
      registry.attach(AGENT_ID, agentSocket({ ok: false, error: 'Relay answered HTTP 403: {"token":"abc"}' }));
      const result = await doorOpener.open(relayDoor({ url: 'http://192.168.1.50/open' }, AGENT_ID));
      expect(result.error).toBe('Le relais a répondu 403.');
      expect(result.detail).toContain('abc');
    });

    it('reports an offline agent', async () => {
      const result = await opener().opener.open(relayDoor({ url: 'http://192.168.1.50/open' }, AGENT_ID));
      expect(result).toEqual({ ok: false, error: REASONS.agentOffline });
    });
  });
});

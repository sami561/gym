import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PushToken } from './push-token.entity';
import { PushService } from './push.service';

describe('PushService.sendToUser', () => {
  const realFetch = global.fetch;
  const fetchMock = jest.fn();
  const message = { title: 'Meliora Gym', body: 'Votre cours commence bientôt.', data: { screen: 'classes' } };
  const tokens = {
    find: jest.fn().mockResolvedValue([{ token: 'ExponentPushToken[abc]' }]),
    delete: jest.fn(),
  };
  const service = () => new PushService(tokens as unknown as Repository<PushToken>);
  let warn: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('counts the tickets Expo accepted', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ status: 'ok', id: 't1' }] }));
    expect(await service().sendToUser('u1', message)).toBe(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual([
      { to: 'ExponentPushToken[abc]', sound: 'default', ...message },
    ]);
  });

  it('never follows a redirect: a 3xx is refused, nothing is sent', async () => {
    fetchMock.mockResolvedValue(new Response('moved', { status: 307, headers: { location: 'http://169.254.169.254/' } }));
    expect(await service().sendToUser('u1', message)).toBe(0);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].redirect).toBe('manual');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Expo push refused (HTTP 307)');
  });
});

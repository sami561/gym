import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { JwtPayload, Role } from '@app/common';
import { LiveGateway } from './live.gateway';

const SECRET = 'live-gateway-spec-secret';
const jwt = new JwtService({});
let seq = 0;

const sign = (payload: Partial<JwtPayload>, expiresIn = 900, secret = SECRET) =>
  jwt.sign({ sub: 'u1', email: 'staff@meliora.tn', name: 'Staff', role: Role.STAFF, type: 'access', ...payload }, { secret, expiresIn });

function socket(token: unknown) {
  return {
    id: `socket-${++seq}`,
    handshake: { auth: { token } },
    data: {} as Record<string, unknown>,
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}
const asSocket = (client: ReturnType<typeof socket>) => client as unknown as Socket;

describe('LiveGateway', () => {
  const saved = process.env.JWT_ACCESS_SECRET;
  let gateway: LiveGateway;

  beforeAll(() => (process.env.JWT_ACCESS_SECRET = SECRET));
  afterAll(() => (saved === undefined ? delete process.env.JWT_ACCESS_SECRET : (process.env.JWT_ACCESS_SECRET = saved)));
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.UTC(2026, 10, 2, 9, 0, 0) });
    gateway = new LiveGateway(jwt);
  });
  afterEach(() => jest.useRealTimers());

  it('disconnects a staff socket when its access token expires', () => {
    const client = socket(sign({}));
    gateway.handleConnection(asSocket(client));
    expect(client.data.userId).toBe('u1');
    jest.advanceTimersByTime(899_999);
    expect(client.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    gateway.handleDisconnect(asSocket(client));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer when the client leaves first', () => {
    const client = socket(sign({ role: Role.ADMIN }));
    gateway.handleConnection(asSocket(client));
    gateway.handleDisconnect(asSocket(client));
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(900_000);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('refuses refresh tokens, other roles, expired, forged or missing tokens', () => {
    const tokens = [
      sign({ type: 'refresh' }),
      sign({ role: Role.MEMBER }),
      sign({ role: Role.COACH }),
      sign({}, -10),
      sign({}, 900, 'another-secret'),
      '',
      undefined,
    ];
    for (const token of tokens) {
      const client = socket(token);
      gateway.handleConnection(asSocket(client));
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Authentification requise.' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.userId).toBeUndefined();
    }
    expect(jest.getTimerCount()).toBe(0);
  });
});

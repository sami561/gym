import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PATTERNS, Role, RpcClient, RpcError } from '@app/common';
import { PeopleService } from './people.service';

function setup() {
  const rpc = { send: jest.fn() };
  return { service: new PeopleService(rpc as unknown as RpcClient), rpc };
}

describe('PeopleService (names stored on programs and PT sessions)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('resolves member and coach names', async () => {
    const { service, rpc } = setup();
    rpc.send
      .mockResolvedValueOnce({ firstName: 'Amira', lastName: 'Ben Salah' })
      .mockResolvedValueOnce({ firstName: 'Karim', lastName: 'Jaziri', role: Role.COACH });
    expect(await service.memberName('m-1')).toBe('Amira Ben Salah');
    expect(await service.coachName('u-coach')).toBe('Karim Jaziri');
    expect(rpc.send).toHaveBeenNthCalledWith(1, PATTERNS.members.get, { id: 'm-1' }, 5_000);
    expect(rpc.send).toHaveBeenNthCalledWith(2, PATTERNS.users.get, { id: 'u-coach' }, 5_000);
  });

  it('rejects unknown or malformed ids', async () => {
    const { service, rpc } = setup();
    rpc.send.mockRejectedValueOnce(new RpcError(404, 'Membre introuvable.')).mockRejectedValueOnce({ statusCode: 400, message: 'Identifiant invalide.' });
    await expect(service.memberName('m-x')).rejects.toThrow(new NotFoundException('Membre introuvable.'));
    await expect(service.coachName('nope')).rejects.toThrow(new NotFoundException('Coach introuvable.'));
  });

  it('refuses a member account as coach', async () => {
    const { service, rpc } = setup();
    rpc.send.mockResolvedValue({ firstName: 'Amira', lastName: 'Ben Salah', role: Role.MEMBER });
    await expect(service.coachName('m-1')).rejects.toThrow(new BadRequestException("Ce compte n'est pas un coach."));
  });

  it('falls back to a placeholder name while the owning service is down', async () => {
    const { service, rpc } = setup();
    rpc.send.mockRejectedValue(new RpcError(503, 'Service indisponible (members.get)'));
    expect(await service.memberName('m-1')).toBe('Membre');
    expect(await service.coachName('u-coach')).toBe('Coach');
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(2);
  });
});

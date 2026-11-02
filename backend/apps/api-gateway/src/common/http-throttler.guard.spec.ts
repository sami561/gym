import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './http-throttler.guard';

class DoorsController {}
function openDoor() {}

function context(req: Record<string, unknown>, type = 'http'): ExecutionContext {
  const res = { header: jest.fn() };
  return {
    getType: () => type,
    getHandler: () => openDoor,
    getClass: () => DoorsController,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('HttpThrottlerGuard', () => {
  let guard: HttpThrottlerGuard;

  beforeEach(async () => {
    guard = new HttpThrottlerGuard([{ ttl: 60_000, limit: 2 }], new ThrottlerStorageService(), new Reflector());
    await guard.onModuleInit();
  });

  it('counts signed-in members separately even behind the same address', async () => {
    const alice = { ip: '203.0.113.7', user: { id: 'alice' } };
    await guard.canActivate(context(alice));
    await guard.canActivate(context(alice));
    await expect(guard.canActivate(context(alice))).rejects.toThrow(ThrottlerException);
    await expect(guard.canActivate(context({ ip: '203.0.113.7', user: { id: 'bob' } }))).resolves.toBe(true);
  });

  it('counts anonymous requests per client address', async () => {
    await guard.canActivate(context({ ip: '203.0.113.7' }));
    await guard.canActivate(context({ ip: '203.0.113.7' }));
    await expect(guard.canActivate(context({ ip: '203.0.113.7' }))).rejects.toThrow(ThrottlerException);
    await expect(guard.canActivate(context({ ip: '198.51.100.4' }))).resolves.toBe(true);
    // An anonymous flood does not use up the bucket of a member on that address.
    await expect(guard.canActivate(context({ ip: '203.0.113.7', user: { id: 'alice' } }))).resolves.toBe(true);
  });

  it('never limits the bus events the gateway listens to', async () => {
    for (let i = 0; i < 5; i++) await expect(guard.canActivate(context({}, 'rpc'))).resolves.toBe(true);
  });
});

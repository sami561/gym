import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PATTERNS, Recipient, RpcClient, RpcError } from '@app/common';
import { AutomationService } from './automation.service';
import { composeInactiveMembers } from './inactive-members';

const recipient = (memberId: string): Recipient => ({
  memberId,
  firstName: memberId.toUpperCase(),
  lastName: 'Test',
  email: `${memberId}@meliora.tn`,
  phone: null,
});

describe('inactive members', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');

  it('keeps members absent for at least N days and never-seen members first', () => {
    const result = composeInactiveMembers(
      [recipient('fresh'), recipient('old'), recipient('never'), recipient('older')],
      [
        { memberId: 'fresh', lastVisitAt: '2026-11-01T08:00:00.000Z' },
        { memberId: 'old', lastVisitAt: '2026-10-19T08:00:00.000Z' },
        { memberId: 'older', lastVisitAt: '2026-09-01T08:00:00.000Z' },
        { memberId: 'never', lastVisitAt: null },
      ],
      14,
      now,
    );
    expect(result.map((m) => m.memberId)).toEqual(['never', 'older', 'old']);
    expect(result[0]).toMatchObject({ lastVisitAt: null, daysSinceVisit: null, email: 'never@meliora.tn' });
    expect(result[2].daysSinceVisit).toBe(14);
  });

  it('treats members missing from access-service as never seen', () => {
    expect(composeInactiveMembers([recipient('ghost')], [], 7, now)[0].daysSinceVisit).toBeNull();
  });

  describe('AutomationService', () => {
    const rpc = { send: jest.fn() };
    const service = new AutomationService(rpc as unknown as RpcClient);

    beforeEach(() => rpc.send.mockReset());

    it('asks membership for active members then access for their last visits', async () => {
      rpc.send
        .mockResolvedValueOnce([recipient('a'), recipient('b')])
        .mockResolvedValueOnce([{ memberId: 'a', lastVisitAt: new Date().toISOString() }]);
      const result = await service.inactiveMembers({ days: 14 });
      expect(rpc.send).toHaveBeenNthCalledWith(1, PATTERNS.membershipAutomation.recipients, { segment: 'active' });
      expect(rpc.send).toHaveBeenNthCalledWith(2, PATTERNS.access.lastVisits, { memberIds: ['a', 'b'] });
      expect(result.map((m) => m.memberId)).toEqual(['b']);
    });

    it('defaults to 14 days and skips access-service when nobody is active', async () => {
      rpc.send.mockResolvedValueOnce([]);
      await expect(service.inactiveMembers({})).resolves.toEqual([]);
      expect(rpc.send).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid number of days', async () => {
      await expect(service.inactiveMembers({ days: 0 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.inactiveMembers({ days: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports an unavailable dependency as 503', async () => {
      rpc.send.mockRejectedValueOnce(new RpcError(503, 'Service indisponible (membership)'));
      await expect(service.inactiveMembers({ days: 14 })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});

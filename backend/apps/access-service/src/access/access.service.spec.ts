import { AccessMethod, AccessResult, DoorDriver, gymInfo, loadEnv, MemberStatus } from '@app/common';
import { AccessLogsService, RecordLogInput } from '../logs/access-logs.service';
import { AccessMember } from '../members/access-member.entity';
import { AccessMembersService } from '../members/access-members.service';
import { Door } from '../doors/door.entity';
import { DoorsService } from '../doors/doors.service';
import { REASONS } from './access-decision';
import { AccessService } from './access.service';
import { DoorOpener } from './door-opener.service';

const AGENT_ID = '0f6b2c1e-4a5d-4e7f-8a9b-0c1d2e3f4a5b';
const DOOR_ID = '7d3e9a10-2b4c-4d5e-8f60-718293a4b5c6';

function makeDoor(overrides: Partial<Door> = {}): Door {
  return {
    id: DOOR_ID,
    name: 'Entrée',
    location: null,
    driver: DoorDriver.SIMULATOR,
    config: {},
    unlockSeconds: 5,
    isActive: true,
    allowAppOpen: true,
    agentId: AGENT_ID,
    agent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMember(overrides: Partial<AccessMember> = {}): AccessMember {
  const today = new Date();
  const from = new Date(today.getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
  const until = new Date(today.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  return {
    memberId: 'member-1',
    memberCode: 'MEL-00001',
    firstName: 'Amira',
    lastName: 'Ben Salah',
    status: MemberStatus.ACTIVE,
    windows: [{ from, until }],
    accessSecret: 'a'.repeat(64),
    cardNumber: null,
    deviceUid: 12,
    lastQrStep: null,
    removedAt: null,
    syncedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function setup(options: { networks?: string; door?: Door; member?: AccessMember | null } = {}) {
  loadEnv(); // backend/.env first, so the values below win
  process.env.GEOFENCE_METERS = '150';
  if (options.networks === undefined) delete process.env.APP_OPEN_ALLOWED_NETWORKS;
  else process.env.APP_OPEN_ALLOWED_NETWORKS = options.networks;

  const door = options.door ?? makeDoor();
  const member = options.member === undefined ? makeMember() : options.member;
  const records: RecordLogInput[] = [];
  const seenKeys = new Set<string>();
  const members = {
    findById: jest.fn(async () => member),
    findByDeviceUid: jest.fn(async (uid: number) => (member && uid === member.deviceUid ? member : null)),
  };
  const doors = { mustFind: jest.fn(async () => door), findById: jest.fn(async () => door) };
  const logs = {
    record: jest.fn(async (input: RecordLogInput) => {
      if (input.deviceEventKey) {
        if (seenKeys.has(input.deviceEventKey)) return null;
        seenKeys.add(input.deviceEventKey);
      }
      records.push(input);
      return { id: `log-${records.length}`, createdAt: new Date().toISOString() };
    }),
  };
  const opener = { open: jest.fn(async () => ({ ok: true })) };
  const service = new AccessService(
    members as unknown as AccessMembersService,
    doors as unknown as DoorsService,
    logs as unknown as AccessLogsService,
    opener as unknown as DoorOpener,
  );
  return { service, opener, records };
}

describe('AccessService', () => {
  const saved = { networks: process.env.APP_OPEN_ALLOWED_NETWORKS, geofence: process.env.GEOFENCE_METERS };

  afterAll(() => {
    for (const [name, value] of [
      ['APP_OPEN_ALLOWED_NETWORKS', saved.networks],
      ['GEOFENCE_METERS', saved.geofence],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe('openByApp', () => {
    const atTheGym = () => ({ latitude: gymInfo().location.lat, longitude: gymInfo().location.lng, accuracy: 8 });

    it('refuses a door closed to the app, and logs where the request came from', async () => {
      const { service, opener, records } = setup({ door: makeDoor({ allowAppOpen: false }) });
      const decision = await service.openByApp({ memberId: 'member-1', doorId: DOOR_ID, ...atTheGym(), clientIp: '41.226.10.2' });
      expect(decision).toMatchObject({ granted: false, reason: REASONS.appOpenDisabled });
      expect(opener.open).not.toHaveBeenCalled();
      expect(records[0]).toMatchObject({
        method: AccessMethod.APP,
        result: AccessResult.DENIED,
        context: { distanceMeters: 0, accuracy: 8, clientIp: '41.226.10.2' },
      });
    });

    it('asks for the gym Wi-Fi when the address is outside APP_OPEN_ALLOWED_NETWORKS or missing', async () => {
      const outside = setup({ networks: '197.15.20.33, 192.168.1.0/24' });
      expect(
        await outside.service.openByApp({ memberId: 'member-1', doorId: DOOR_ID, ...atTheGym(), clientIp: '41.226.10.2' }),
      ).toMatchObject({ granted: false, reason: REASONS.network });
      expect(outside.opener.open).not.toHaveBeenCalled();

      const missing = setup({ networks: '197.15.20.33' });
      expect(await missing.service.openByApp({ memberId: 'member-1', doorId: DOOR_ID, ...atTheGym() })).toMatchObject({
        granted: false,
        reason: REASONS.network,
      });
    });

    it('opens from the gym network at the gym', async () => {
      const { service, opener, records } = setup({ networks: '197.15.20.33, 192.168.1.0/24' });
      const decision = await service.openByApp({ memberId: 'member-1', doorId: DOOR_ID, ...atTheGym(), clientIp: '::ffff:192.168.1.40' });
      expect(decision).toMatchObject({ granted: true });
      expect(opener.open).toHaveBeenCalledTimes(1);
      expect(records[0]).toMatchObject({ result: AccessResult.GRANTED, context: { clientIp: '::ffff:192.168.1.40' } });
    });

    it('still applies the geofence on the gym network', async () => {
      const { service, records } = setup({ networks: '192.168.1.0/24' });
      const far = { latitude: gymInfo().location.lat + 0.01, longitude: gymInfo().location.lng };
      const decision = await service.openByApp({ memberId: 'member-1', doorId: DOOR_ID, ...far, clientIp: '192.168.1.40' });
      expect(decision.granted).toBe(false);
      expect(decision.reason).toMatch(/trop loin/);
      expect(records[0].context?.distanceMeters).toBeGreaterThan(1000);
    });
  });

  describe('recordDeviceEvents', () => {
    const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

    it('logs the punches of the last 7 days and counts the others instead of failing the batch', async () => {
      const { service, records } = setup();
      const minuteAgo = at(-60_000);
      const hourAhead = at(3_600_000);
      const result = await service.recordDeviceEvents(AGENT_ID, {
        doorId: DOOR_ID,
        events: [
          { deviceUserId: '12', method: 'CARD', at: minuteAgo },
          { deviceUserId: '12', method: 'CARD', at: minuteAgo }, // re-sent
          { deviceUserId: '99', method: 'CARD', at: minuteAgo }, // unknown here, enrolled on the terminal
          { deviceUserId: '12', method: 'FINGERPRINT', at: at(-8 * 86_400_000) }, // too old
          { deviceUserId: '12', method: 'CARD', at: hourAhead }, // terminal clock an hour fast
          { deviceUserId: '12', method: 'CARD', at: hourAhead }, // the same punch re-sent
          { deviceUserId: 'x', method: 'CARD', at: at(0) },
        ],
      });
      expect(result).toEqual({ accepted: 3, duplicates: 2, rejected: 2 });
      expect(records).toHaveLength(3);
      expect(records[0]).toMatchObject({ result: AccessResult.GRANTED, method: AccessMethod.CARD, reason: null });
      // The door did open: the unknown terminal user stays in the log, without a member.
      expect(records[1]).toMatchObject({
        member: null,
        result: AccessResult.GRANTED,
        reason: 'Ouvert par le terminal : Utilisateur 99 inconnu du système.',
      });
      // Never dated in the future: logged at reception, de-duplicated on the terminal time.
      expect(records[2].createdAt!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(records[2].deviceEventKey).toBe(`${DOOR_ID}:12:${hourAhead}`);
    });

    it('rejects every punch sent for a door of another agent', async () => {
      const { service, records } = setup();
      const result = await service.recordDeviceEvents('another-agent', {
        doorId: DOOR_ID,
        events: [{ deviceUserId: '12', method: 'CARD', at: at(-60_000) }],
      });
      expect(result).toEqual({ accepted: 0, duplicates: 0, rejected: 1 });
      expect(records).toHaveLength(0);
    });

    it('keeps the entitlement problem in the reason of a punch the terminal let through', async () => {
      const { service, records } = setup({ member: makeMember({ status: MemberStatus.SUSPENDED }) });
      await service.recordDeviceEvents(AGENT_ID, {
        doorId: DOOR_ID,
        events: [{ deviceUserId: '12', method: 'CARD', at: at(-60_000) }],
      });
      expect(records[0]).toMatchObject({ result: AccessResult.GRANTED, reason: `Ouvert par le terminal : ${REASONS.suspended}` });
    });
  });
});

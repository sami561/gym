import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DOOR_SECRET_MASK, DoorDriver } from '@app/common';
import { AgentRegistry } from '../agents/agent-registry.service';
import { DoorAgent } from '../agents/door-agent.entity';
import { Door } from './door.entity';
import { DoorsService } from './doors.service';

const DOOR_ID = '2b7d9c41-5e3f-4a8b-9c6d-1e2f3a4b5c6d';
const AGENT_ID = '9a8b7c6d-5e4f-4321-8abc-def012345678';
const OTHER_AGENT = '1f2e3d4c-5b6a-4789-9abc-0123456789ab';

const relayConfig = () => ({
  url: 'http://192.168.1.50/relay/0?turn=on',
  method: 'POST',
  basicAuth: { username: 'admin', password: 'relay-pass' },
  headers: { 'X-Api-Key': 'relay-key' },
});

function door(overrides: Partial<Door> = {}): Door {
  return Object.assign(new Door(), {
    id: DOOR_ID,
    name: 'Entrée principale',
    location: 'Rez-de-chaussée',
    driver: DoorDriver.HTTP_RELAY,
    config: relayConfig(),
    unlockSeconds: 5,
    isActive: true,
    allowAppOpen: true,
    agentId: null,
    agent: null,
    ...overrides,
  });
}

function setup({
  stored = door(),
  doors = [],
  online = [],
  agentExists = true,
}: { stored?: Door | null; doors?: Door[]; online?: string[]; agentExists?: boolean } = {}) {
  const repo = {
    find: jest.fn().mockResolvedValue(doors),
    findOne: jest.fn().mockResolvedValue(stored),
    create: jest.fn((data: Partial<Door>) => Object.assign(new Door(), data)),
    save: jest.fn(async (row: Door) => Object.assign(row, { id: DOOR_ID })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const agents = { exists: jest.fn().mockResolvedValue(agentExists) };
  const registry = { isOnline: jest.fn((id: string) => online.includes(id)), emit: jest.fn() };
  const service = new DoorsService(
    repo as unknown as Repository<Door>,
    agents as unknown as Repository<DoorAgent>,
    registry as unknown as AgentRegistry,
  );
  return { service, repo, agents, registry };
}

describe('DoorsService', () => {
  describe('what callers see of a door config', () => {
    it('lists doors without any config by default', async () => {
      const { service } = setup({ doors: [door()] });
      const [dto] = await service.list();
      expect(dto.config).toEqual({});
      expect(JSON.stringify(dto)).not.toContain('relay-pass');
    });

    it('shows door editors the config with every secret masked', async () => {
      const { service } = setup({ doors: [door()] });
      const [dto] = await service.list({ includeConfig: true });
      expect(dto.config).toEqual({
        url: 'http://192.168.1.50/relay/0?turn=on',
        method: 'POST',
        basicAuth: { username: 'admin', password: DOOR_SECRET_MASK },
        headers: { 'X-Api-Key': DOOR_SECRET_MASK },
      });
    });

    it('gives members only the name and place of the doors they may open', async () => {
      const { service, repo } = setup({ doors: [door()] });
      expect(await service.listForMember()).toEqual([{ id: DOOR_ID, name: 'Entrée principale', location: 'Rez-de-chaussée' }]);
      expect(repo.find).toHaveBeenCalledWith({ where: { isActive: true, allowAppOpen: true }, order: { name: 'ASC' } });
    });

    it('sends the real config to the agent driving the door', async () => {
      const { service } = setup({ doors: [door({ agentId: AGENT_ID })] });
      expect(await service.configsForAgent(AGENT_ID)).toEqual([
        { id: DOOR_ID, name: 'Entrée principale', driver: DoorDriver.HTTP_RELAY, config: relayConfig(), unlockSeconds: 5, isActive: true },
      ]);
    });

    it('reports relay and simulator doors online, agent doors with their agent', () => {
      const { service } = setup({ online: [AGENT_ID] });
      expect(service.toDto(door()).online).toBe(true);
      expect(service.toDto(door({ driver: DoorDriver.ZKTECO, config: { ip: '192.168.1.201' } })).online).toBe(false);
      expect(service.toDto(door({ agentId: AGENT_ID, agent: Object.assign(new DoorAgent(), { name: 'Agent accueil' }) }))).toMatchObject({
        online: true,
        agentName: 'Agent accueil',
      });
      expect(service.toDto(door({ agentId: OTHER_AGENT })).online).toBe(false);
    });
  });

  describe('create', () => {
    it('defaults to an active simulator door opening 5 seconds', async () => {
      const { service, repo } = setup();
      await service.create({ name: '  Porte vestiaire  ', driver: undefined as unknown as DoorDriver });
      expect(repo.create).toHaveBeenCalledWith({
        name: 'Porte vestiaire',
        location: null,
        driver: DoorDriver.SIMULATOR,
        config: {},
        unlockSeconds: 5,
        isActive: true,
        allowAppOpen: true,
        agentId: null,
      });
    });

    it('clamps the unlock time to 1..60 seconds', async () => {
      const unlock = async (unlockSeconds: number) => {
        const { service, repo } = setup();
        await service.create({ name: 'Porte', driver: DoorDriver.SIMULATOR, unlockSeconds });
        return repo.create.mock.calls[0][0].unlockSeconds;
      };
      expect(await unlock(0)).toBe(1);
      expect(await unlock(2.6)).toBe(3);
      expect(await unlock(600)).toBe(60);
      expect(await unlock(Number.NaN)).toBe(5);
    });

    it('validates the name, the driver, the terminal address and the agent', async () => {
      const { service } = setup({ agentExists: false });
      await expect(service.create({ name: ' ', driver: DoorDriver.SIMULATOR })).rejects.toThrow(
        new BadRequestException('Le nom de la porte est requis.'),
      );
      await expect(service.create({ name: 'x'.repeat(121), driver: DoorDriver.SIMULATOR })).rejects.toThrow(
        'Nom de porte trop long (120 caractères max).',
      );
      await expect(service.create({ name: 'Porte', driver: 'MAGIC' as DoorDriver })).rejects.toThrow('Type de contrôleur inconnu.');
      await expect(service.create({ name: 'Porte', driver: DoorDriver.ZKTECO, config: { ip: '  ' } })).rejects.toThrow(
        'Adresse IP du terminal ZKTeco requise.',
      );
      await expect(service.create({ name: 'Porte', driver: DoorDriver.SIMULATOR, agentId: AGENT_ID })).rejects.toThrow(
        new NotFoundException('Agent de porte introuvable.'),
      );
      await expect(service.create({ name: 'Porte', driver: DoorDriver.SIMULATOR, agentId: 'agent-1' })).rejects.toThrow(
        'Agent de porte introuvable.',
      );
    });
  });

  describe('update', () => {
    it('keeps the stored secrets when the masked config comes back', async () => {
      const { service, repo } = setup();
      const masked = service.toDto(door(), true).config;
      await service.update({ id: DOOR_ID, data: { config: { ...masked, url: 'http://192.168.1.51/relay/0?turn=on' } } });
      expect(repo.update.mock.calls[0][1].config).toEqual({ ...relayConfig(), url: 'http://192.168.1.51/relay/0?turn=on' });
    });

    it('lets an old door be renamed without re-validating its config', async () => {
      const legacy = door({ config: { url: 'pas-une-url' } });
      const { service, repo } = setup({ stored: legacy });
      await service.update({ id: DOOR_ID, data: { name: 'Entrée' } });
      expect(repo.update.mock.calls[0][1]).toMatchObject({ name: 'Entrée', config: { url: 'pas-une-url' } });
    });

    it('re-validates the config when the driver changes', async () => {
      const { service } = setup({ stored: door({ driver: DoorDriver.SIMULATOR, config: {} }) });
      await expect(service.update({ id: DOOR_ID, data: { driver: DoorDriver.ZKTECO } })).rejects.toThrow(
        'Adresse IP du terminal ZKTeco requise.',
      );
    });

    it('pushes the new door list to the previous and the new agent, once each, when online', async () => {
      const { service, registry } = setup({ stored: door({ agentId: AGENT_ID }), online: [AGENT_ID, OTHER_AGENT], doors: [] });
      await service.update({ id: DOOR_ID, data: { agentId: OTHER_AGENT } });
      expect(registry.emit.mock.calls.map(([agentId, event]) => [agentId, event])).toEqual([
        [AGENT_ID, 'doors'],
        [OTHER_AGENT, 'doors'],
      ]);
    });

    it('answers 404 for an unknown or malformed door id', async () => {
      await expect(setup({ stored: null }).service.update({ id: DOOR_ID, data: {} })).rejects.toThrow(
        new NotFoundException('Porte introuvable.'),
      );
      const { service, repo } = setup();
      await expect(service.remove({ id: 'porte-1' })).rejects.toThrow('Porte introuvable.');
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('memberSyncScope (who answers members.sync)', () => {
    it('is on unless every active terminal of the agent opted out, none without terminals', async () => {
      const zk = (syncUsers?: boolean) => door({ driver: DoorDriver.ZKTECO, config: { ip: '192.168.1.201', ...(syncUsers === undefined ? {} : { syncUsers }) } });
      expect(await setup({ doors: [zk(false), zk()] }).service.memberSyncScope(AGENT_ID)).toBe('on');
      expect(await setup({ doors: [zk(false), zk(false)] }).service.memberSyncScope(AGENT_ID)).toBe('off');
      expect(await setup({ doors: [] }).service.memberSyncScope(AGENT_ID)).toBe('none');
      expect(await setup({ doors: [zk()] }).service.memberSyncScope('agent-1')).toBe('none');
    });
  });
});

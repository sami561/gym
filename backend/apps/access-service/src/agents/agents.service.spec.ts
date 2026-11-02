import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { sha256 } from '@app/common';
import { AgentRegistry } from './agent-registry.service';
import { AGENT_KEY_PREFIX, AgentsService } from './agents.service';
import { DoorAgent } from './door-agent.entity';

const AGENT_ID = '9a8b7c6d-5e4f-4321-8abc-def012345678';

function setup(found: DoorAgent | null = null) {
  const repo = {
    create: jest.fn((data: Partial<DoorAgent>) => Object.assign(new DoorAgent(), data)),
    save: jest.fn(async (row: DoorAgent) => Object.assign(row, { id: AGENT_ID, lastSeenAt: null, createdAt: new Date() })),
    findOne: jest.fn().mockResolvedValue(found),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const registry = { isOnline: jest.fn().mockReturnValue(false), disconnect: jest.fn() };
  return { service: new AgentsService(repo as unknown as Repository<DoorAgent>, registry as unknown as AgentRegistry), repo, registry };
}

describe('AgentsService (door agent keys)', () => {
  it('returns the API key once and stores only its hash', async () => {
    const { service, repo } = setup();
    const result = await service.create({ name: '  Agent accueil  ' });

    expect(result.apiKey).toMatch(new RegExp(`^${AGENT_KEY_PREFIX}[0-9a-f]{48}$`));
    const stored = repo.save.mock.calls[0][0];
    expect(stored).toMatchObject({ name: 'Agent accueil', keyHash: sha256(result.apiKey) });
    expect(JSON.stringify(stored)).not.toContain(result.apiKey);
    expect(result.agent).toEqual({ id: AGENT_ID, name: 'Agent accueil', online: false, lastSeenAt: null, doorCount: 0 });
    expect(result.agent).not.toHaveProperty('keyHash');
  });

  it('generates a different key for every agent', async () => {
    const first = await setup().service.create({ name: 'A' });
    const second = await setup().service.create({ name: 'B' });
    expect(first.apiKey).not.toBe(second.apiKey);
  });

  it('requires a name and keeps 120 characters of it', async () => {
    const { service, repo } = setup();
    await expect(service.create({ name: '   ' })).rejects.toThrow(new BadRequestException("Le nom de l'agent est requis."));
    await expect(service.create({})).rejects.toThrow("Le nom de l'agent est requis.");
    await service.create({ name: 'x'.repeat(130) });
    expect(repo.save.mock.calls[0][0].name).toHaveLength(120);
  });

  it('finds an agent by the hash of its key, never for a key without the prefix', async () => {
    const { service, repo } = setup();
    expect(await service.findByKey('not-an-agent-key')).toBeNull();
    expect(repo.findOne).not.toHaveBeenCalled();
    await service.findByKey(`${AGENT_KEY_PREFIX}abc`);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { keyHash: sha256(`${AGENT_KEY_PREFIX}abc`) } });
  });

  it('disconnects a deleted agent and answers 404 for unknown ones', async () => {
    const agent = Object.assign(new DoorAgent(), { id: AGENT_ID, name: 'Agent accueil', keyHash: 'h' });
    const { service, registry, repo } = setup(agent);
    expect(await service.remove({ id: AGENT_ID })).toEqual({ ok: true });
    expect(registry.disconnect).toHaveBeenCalledWith(AGENT_ID);
    expect(repo.delete).toHaveBeenCalledWith(AGENT_ID);

    const missing = setup(null);
    await expect(missing.service.remove({ id: 'agent-1' })).rejects.toThrow(new NotFoundException('Agent de porte introuvable.'));
    expect(missing.repo.findOne).not.toHaveBeenCalled();
  });

  it('shows the last contact time and the door count', () => {
    const { service, registry } = setup();
    registry.isOnline.mockReturnValue(true);
    const agent = Object.assign(new DoorAgent(), {
      id: AGENT_ID,
      name: 'Agent accueil',
      keyHash: 'secret-hash',
      lastSeenAt: new Date('2026-11-02T08:00:00.000Z'),
      doorCount: 3,
    });
    expect(service.toDto(agent)).toEqual({
      id: AGENT_ID,
      name: 'Agent accueil',
      online: true,
      lastSeenAt: '2026-11-02T08:00:00.000Z',
      doorCount: 3,
    });
  });
});

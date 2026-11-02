import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { AgentDto, CreateAgentResult, IdRequest, OkResult, sha256 } from '@app/common';
import { isUuid } from '../shared/validation';
import { AgentRegistry } from './agent-registry.service';
import { DoorAgent } from './door-agent.entity';

export const AGENT_KEY_PREFIX = 'mag_';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(DoorAgent) private readonly repo: Repository<DoorAgent>,
    private readonly registry: AgentRegistry,
  ) {}

  async list(): Promise<AgentDto[]> {
    const agents = await this.repo
      .createQueryBuilder('agent')
      .loadRelationCountAndMap('agent.doorCount', 'agent.doors')
      .orderBy('agent.name', 'ASC')
      .getMany();
    return agents.map((agent) => this.toDto(agent));
  }

  async create(request: { name?: string }): Promise<CreateAgentResult> {
    const name = typeof request?.name === 'string' ? request.name.trim() : '';
    if (!name) throw new BadRequestException("Le nom de l'agent est requis.");
    const apiKey = `${AGENT_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
    const agent = await this.repo.save(this.repo.create({ name: name.slice(0, 120), keyHash: sha256(apiKey) }));
    agent.doorCount = 0;
    return { agent: this.toDto(agent), apiKey };
  }

  async remove(request: IdRequest): Promise<OkResult> {
    const agent = isUuid(request?.id) ? await this.repo.findOne({ where: { id: request.id } }) : null;
    if (!agent) throw new NotFoundException('Agent de porte introuvable.');
    this.registry.disconnect(agent.id);
    // Doors keep existing; their agentId is set to NULL by the foreign key.
    await this.repo.delete(agent.id);
    return { ok: true };
  }

  findByKey(apiKey: string): Promise<DoorAgent | null> {
    if (!apiKey.startsWith(AGENT_KEY_PREFIX)) return Promise.resolve(null);
    return this.repo.findOne({ where: { keyHash: sha256(apiKey) } });
  }

  async touch(agentId: string): Promise<void> {
    await this.repo.update(agentId, { lastSeenAt: new Date() });
  }

  toDto(agent: DoorAgent): AgentDto {
    return {
      id: agent.id,
      name: agent.name,
      online: this.registry.isOnline(agent.id),
      lastSeenAt: agent.lastSeenAt ? agent.lastSeenAt.toISOString() : null,
      doorCount: agent.doorCount ?? 0,
    };
  }
}

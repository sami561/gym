import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  AgentDoorConfig,
  CreateDoorRequest,
  DoorDriver,
  DoorDto,
  IdRequest,
  MemberDoor,
  OkResult,
  UpdateDoorRequest,
} from '@app/common';
import { AgentRegistry } from '../agents/agent-registry.service';
import { DoorAgent } from '../agents/door-agent.entity';
import { isUuid } from '../shared/validation';
import { Door } from './door.entity';

type DoorFields = Pick<Door, 'name' | 'location' | 'driver' | 'config' | 'unlockSeconds' | 'isActive' | 'agentId'>;

@Injectable()
export class DoorsService {
  constructor(
    @InjectRepository(Door) private readonly repo: Repository<Door>,
    @InjectRepository(DoorAgent) private readonly agents: Repository<DoorAgent>,
    private readonly registry: AgentRegistry,
  ) {}

  findById(id?: string | null): Promise<Door | null> {
    if (!isUuid(id)) return Promise.resolve(null);
    return this.repo.findOne({ where: { id }, relations: { agent: true } });
  }

  async mustFind(id?: string | null): Promise<Door> {
    const door = await this.findById(id);
    if (!door) throw new NotFoundException('Porte introuvable.');
    return door;
  }

  async list(): Promise<DoorDto[]> {
    const doors = await this.repo.find({ relations: { agent: true }, order: { name: 'ASC' } });
    return doors.map((door) => this.toDto(door));
  }

  async listForMember(): Promise<MemberDoor[]> {
    const doors = await this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return doors.map((door) => ({ id: door.id, name: door.name, location: door.location }));
  }

  async create(request: CreateDoorRequest): Promise<DoorDto> {
    const fields = await this.normalize(request);
    const saved = await this.repo.save(this.repo.create(fields));
    await this.notifyAgents([saved.agentId]);
    return this.toDto(await this.mustFind(saved.id));
  }

  async update(request: UpdateDoorRequest): Promise<DoorDto> {
    const door = await this.mustFind(request?.id);
    const previousAgentId = door.agentId;
    const fields = await this.normalize({
      name: door.name,
      location: door.location,
      driver: door.driver,
      config: door.config,
      unlockSeconds: door.unlockSeconds,
      isActive: door.isActive,
      agentId: door.agentId,
      ...(request.data ?? {}),
    });
    // update() (not save()) so the loaded `agent` relation cannot override a new agentId.
    await this.repo.update(door.id, fields as QueryDeepPartialEntity<Door>);
    await this.notifyAgents([previousAgentId, fields.agentId]);
    return this.toDto(await this.mustFind(door.id));
  }

  async remove(request: IdRequest): Promise<OkResult> {
    const door = await this.mustFind(request?.id);
    await this.repo.delete(door.id);
    await this.notifyAgents([door.agentId]);
    return { ok: true };
  }

  /** Doors an agent drives, as pushed in the `doors` socket event. */
  async configsForAgent(agentId: string): Promise<AgentDoorConfig[]> {
    const doors = await this.repo.find({ where: { agentId }, order: { name: 'ASC' } });
    return doors.map((door) => ({
      id: door.id,
      name: door.name,
      driver: door.driver,
      config: door.config ?? {},
      unlockSeconds: door.unlockSeconds,
      isActive: door.isActive,
    }));
  }

  /** Pushes the fresh door list to every connected agent concerned by a change. */
  async notifyAgents(agentIds: (string | null | undefined)[]): Promise<void> {
    const unique = [...new Set(agentIds.filter((id): id is string => !!id))];
    for (const agentId of unique) {
      if (this.registry.isOnline(agentId)) this.registry.emit(agentId, 'doors', await this.configsForAgent(agentId));
    }
  }

  toDto(door: Door): DoorDto {
    return {
      id: door.id,
      name: door.name,
      location: door.location,
      driver: door.driver,
      config: door.config ?? {},
      unlockSeconds: door.unlockSeconds,
      isActive: door.isActive,
      agentId: door.agentId,
      agentName: door.agent?.name ?? null,
      // Simulator / HTTP relay doors driven by this service are always reachable.
      online: door.agentId ? this.registry.isOnline(door.agentId) : door.driver !== DoorDriver.ZKTECO,
    };
  }

  private async normalize(input: Partial<CreateDoorRequest>): Promise<DoorFields> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new BadRequestException('Le nom de la porte est requis.');
    if (name.length > 120) throw new BadRequestException('Nom de porte trop long (120 caractères max).');

    const driver = input.driver ?? DoorDriver.SIMULATOR;
    if (!Object.values(DoorDriver).includes(driver)) throw new BadRequestException('Type de contrôleur inconnu.');

    const config =
      input.config && typeof input.config === 'object' && !Array.isArray(input.config) ? input.config : {};
    if (driver === DoorDriver.HTTP_RELAY && !(typeof config.url === 'string' && /^https?:\/\//.test(config.url))) {
      throw new BadRequestException('URL du relais requise (http:// ou https://).');
    }
    if (driver === DoorDriver.ZKTECO && !(typeof config.ip === 'string' && config.ip.trim())) {
      throw new BadRequestException('Adresse IP du terminal ZKTeco requise.');
    }

    const unlock = Number(input.unlockSeconds ?? 5);
    const unlockSeconds = Number.isFinite(unlock) ? Math.min(60, Math.max(1, Math.round(unlock))) : 5;

    let agentId: string | null = null;
    if (input.agentId) {
      if (!isUuid(input.agentId) || !(await this.agents.exists({ where: { id: input.agentId } }))) {
        throw new NotFoundException('Agent de porte introuvable.');
      }
      agentId = input.agentId;
    }

    const location = typeof input.location === 'string' ? input.location.trim().slice(0, 200) || null : null;
    return { name, location, driver, config, unlockSeconds, isActive: input.isActive ?? true, agentId };
  }
}

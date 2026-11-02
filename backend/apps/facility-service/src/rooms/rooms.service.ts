import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateRoomRequest,
  EquipmentStatus,
  IdRequest,
  OkResult,
  RoomDto,
  RoomType,
  UpdateRoomRequest,
} from '@app/common';
import { Equipment } from '../equipment/equipment.entity';
import { toRoomDto } from '../mappers';
import { oneOf, optionalText, requiredText } from '../shared/inputs';
import { DEFAULT_ROOMS } from './default-rooms';
import { Room } from './room.entity';

/** rooms.list payload: active rooms only unless includeInactive (back-office). */
export interface ListRoomsRequest {
  includeInactive?: boolean;
}

const TYPE_ORDER = Object.values(RoomType);

@Injectable()
export class RoomsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(Equipment) private readonly equipment: Repository<Equipment>,
  ) {}

  /** First boot: seed Meliora's spaces so the website and the planning have rooms to show. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      if (await this.rooms.count()) return;
      await this.rooms.save(
        DEFAULT_ROOMS.map((room) =>
          this.rooms.create({
            name: room.name,
            type: room.type,
            capacity: room.capacity,
            floor: room.floor ?? null,
            description: room.description ?? null,
            isActive: true,
          }),
        ),
      );
      this.logger.log(`${DEFAULT_ROOMS.length} salles par défaut créées`);
    } catch (err) {
      this.logger.warn(`Salles par défaut non créées : ${(err as Error).message}`);
    }
  }

  async list(request: ListRoomsRequest): Promise<RoomDto[]> {
    const [rooms, counts] = await Promise.all([
      this.rooms.find({ where: request.includeInactive ? {} : { isActive: true } }),
      this.equipmentCounts(),
    ]);
    return rooms
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name, 'fr'))
      .map((room) => toRoomDto(room, counts.get(room.id) ?? 0));
  }

  async create(request: CreateRoomRequest): Promise<RoomDto> {
    const name = roomName(request.name);
    await this.assertNameFree(name);
    const room = await this.rooms.save(
      this.rooms.create({
        name,
        type: oneOf(request.type, RoomType, 'Type de salle'),
        capacity: capacity(request.capacity),
        floor: optionalText(request.floor) ?? null,
        description: optionalText(request.description) ?? null,
        isActive: request.isActive ?? true,
      }),
    );
    return toRoomDto(room, 0);
  }

  async update(request: UpdateRoomRequest): Promise<RoomDto> {
    const room = await this.findOrFail(request.id);
    const data = request.data ?? {};
    if (data.name !== undefined) {
      room.name = roomName(data.name);
      await this.assertNameFree(room.name, room.id);
    }
    if (data.type !== undefined) room.type = oneOf(data.type, RoomType, 'Type de salle');
    if (data.capacity !== undefined) room.capacity = capacity(data.capacity);
    if (data.floor !== undefined) room.floor = optionalText(data.floor) ?? null;
    if (data.description !== undefined) room.description = optionalText(data.description) ?? null;
    if (data.isActive !== undefined) room.isActive = Boolean(data.isActive);
    const saved = await this.rooms.save(room);
    return toRoomDto(saved, (await this.equipmentCounts()).get(saved.id) ?? 0);
  }

  /** Lockers and tickets keep their history (room set to null); equipment must be moved first. */
  async remove(request: IdRequest): Promise<OkResult> {
    const room = await this.findOrFail(request.id);
    const attached = await this.equipment
      .createQueryBuilder('e')
      .where('"e"."roomId" = :roomId', { roomId: room.id })
      .andWhere('"e"."status" <> :retired', { retired: EquipmentStatus.RETIRED })
      .getCount();
    if (attached) {
      throw new ConflictException(
        `${attached} équipement(s) encore rattaché(s) à cette salle : déplacez-les ou désactivez la salle.`,
      );
    }
    await this.rooms.delete(room.id);
    return { ok: true };
  }

  async findOrFail(id: string): Promise<Room> {
    const room = id ? await this.rooms.findOne({ where: { id } }) : null;
    if (!room) throw new NotFoundException('Salle introuvable.');
    return room;
  }

  /** Non-retired equipment per room. */
  private async equipmentCounts(): Promise<Map<string, number>> {
    const rows = await this.equipment
      .createQueryBuilder('e')
      .select('"e"."roomId"', 'roomId')
      .addSelect('COUNT(*)', 'count')
      .where('"e"."roomId" IS NOT NULL')
      .andWhere('"e"."status" <> :retired', { retired: EquipmentStatus.RETIRED })
      .groupBy('"e"."roomId"')
      .getRawMany<{ roomId: string; count: string }>();
    return new Map(rows.map((row) => [row.roomId, Number(row.count)]));
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const qb = this.rooms.createQueryBuilder('r').where('LOWER("r"."name") = LOWER(:name)', { name });
    if (exceptId) qb.andWhere('"r"."id" <> :exceptId', { exceptId });
    if (await qb.getExists()) throw new ConflictException('Une salle porte déjà ce nom.');
  }
}

function roomName(value: unknown): string {
  const name = requiredText(value, 'Le nom de la salle');
  if (name.length > 80) throw new BadRequestException('Nom de salle trop long (80 caractères maximum).');
  return name;
}

function capacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new BadRequestException('La capacité doit être un nombre entier positif.');
  }
  return value;
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Not, Repository } from 'typeorm';
import {
  CreateEquipmentRequest,
  EquipmentCategory,
  EquipmentDto,
  EquipmentStatus,
  IdRequest,
  ListEquipmentRequest,
  OkResult,
  UpdateEquipmentRequest,
} from '@app/common';
import { MaintenanceTicket } from '../maintenance/maintenance-ticket.entity';
import { toEquipmentDto } from '../mappers';
import { RoomsService } from '../rooms/rooms.service';
import { amount, oneOf, optionalDateOnly, optionalText, requiredText } from '../shared/inputs';
import { Equipment } from './equipment.entity';
import { isMaintenanceDue, nextMaintenanceAt } from './maintenance-schedule';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment) private readonly equipment: Repository<Equipment>,
    @InjectRepository(MaintenanceTicket) private readonly tickets: Repository<MaintenanceTicket>,
    private readonly rooms: RoomsService,
  ) {}

  /** Retired machines are hidden unless status=RETIRED is asked for explicitly. */
  async list(request: ListEquipmentRequest): Promise<EquipmentDto[]> {
    const qb = this.equipment.createQueryBuilder('e').leftJoinAndSelect('e.room', 'room').orderBy('e.name', 'ASC');
    if (request.roomId) qb.andWhere('"e"."roomId" = :roomId', { roomId: request.roomId });
    if (request.category) qb.andWhere('"e"."category" = :category', { category: request.category });
    if (request.status) qb.andWhere('"e"."status" = :status', { status: request.status });
    else qb.andWhere('"e"."status" <> :retired', { retired: EquipmentStatus.RETIRED });
    const terms = (request.search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
    terms.forEach((term, index) => {
      const key = `term${index}`;
      qb.andWhere(
        new Brackets((where) => {
          for (const column of ['name', 'brand', 'model', 'serialNumber']) {
            where.orWhere(`"e"."${column}" ILIKE :${key}`);
          }
        }),
        { [key]: `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%` },
      );
    });

    let items = await qb.getMany();
    if (request.dueWithinDays !== undefined && request.dueWithinDays !== null) {
      const days = Number(request.dueWithinDays);
      if (!Number.isInteger(days) || days < 0) throw new BadRequestException('dueWithinDays doit être un entier positif.');
      items = items
        .filter((e) => e.status !== EquipmentStatus.RETIRED && isMaintenanceDue(nextMaintenanceAt(e), days))
        .sort((a, b) => (nextMaintenanceAt(a) ?? '').localeCompare(nextMaintenanceAt(b) ?? ''));
    }
    return items.map(toEquipmentDto);
  }

  async get(request: IdRequest): Promise<EquipmentDto> {
    return toEquipmentDto(await this.findOrFail(request.id));
  }

  async create(request: CreateEquipmentRequest): Promise<EquipmentDto> {
    const room = request.roomId ? await this.rooms.findOrFail(request.roomId) : null;
    const serialNumber = optionalText(request.serialNumber) ?? null;
    if (serialNumber) await this.assertSerialFree(serialNumber);
    const equipment = this.equipment.create({
      name: equipmentName(request.name),
      category: oneOf(request.category, EquipmentCategory, 'Catégorie'),
      brand: optionalText(request.brand) ?? null,
      model: optionalText(request.model) ?? null,
      serialNumber,
      roomId: room?.id ?? null,
      purchaseDate: optionalDateOnly(request.purchaseDate, "Date d'achat") ?? null,
      purchasePrice: optionalAmount(request.purchasePrice, "Le prix d'achat") ?? null,
      warrantyUntil: optionalDateOnly(request.warrantyUntil, 'Fin de garantie') ?? null,
      status: request.status ? oneOf(request.status, EquipmentStatus, 'Statut') : EquipmentStatus.OPERATIONAL,
      maintenanceIntervalDays: interval(request.maintenanceIntervalDays) ?? null,
      lastMaintenanceAt: optionalDateOnly(request.lastMaintenanceAt, 'Dernière maintenance') ?? null,
      notes: optionalText(request.notes) ?? null,
    });
    const saved = await this.equipment.save(equipment);
    return toEquipmentDto({ ...saved, room });
  }

  async update(request: UpdateEquipmentRequest): Promise<EquipmentDto> {
    const equipment = await this.findOrFail(request.id);
    const data = request.data ?? {};
    if (data.name !== undefined) equipment.name = equipmentName(data.name);
    if (data.category !== undefined) equipment.category = oneOf(data.category, EquipmentCategory, 'Catégorie');
    if (data.brand !== undefined) equipment.brand = optionalText(data.brand) ?? null;
    if (data.model !== undefined) equipment.model = optionalText(data.model) ?? null;
    if (data.serialNumber !== undefined) {
      equipment.serialNumber = optionalText(data.serialNumber) ?? null;
      if (equipment.serialNumber) await this.assertSerialFree(equipment.serialNumber, equipment.id);
    }
    if (data.roomId !== undefined) {
      equipment.room = data.roomId ? await this.rooms.findOrFail(data.roomId) : null;
      equipment.roomId = equipment.room?.id ?? null;
    }
    if (data.purchaseDate !== undefined) {
      equipment.purchaseDate = optionalDateOnly(data.purchaseDate, "Date d'achat") ?? null;
    }
    if (data.purchasePrice !== undefined) {
      equipment.purchasePrice = optionalAmount(data.purchasePrice, "Le prix d'achat") ?? null;
    }
    if (data.warrantyUntil !== undefined) {
      equipment.warrantyUntil = optionalDateOnly(data.warrantyUntil, 'Fin de garantie') ?? null;
    }
    if (data.status !== undefined) equipment.status = oneOf(data.status, EquipmentStatus, 'Statut');
    if (data.maintenanceIntervalDays !== undefined) {
      equipment.maintenanceIntervalDays = interval(data.maintenanceIntervalDays) ?? null;
    }
    if (data.lastMaintenanceAt !== undefined) {
      equipment.lastMaintenanceAt = optionalDateOnly(data.lastMaintenanceAt, 'Dernière maintenance') ?? null;
    }
    if (data.notes !== undefined) equipment.notes = optionalText(data.notes) ?? null;
    return toEquipmentDto(await this.equipment.save(equipment));
  }

  /** Equipment with maintenance history is retired rather than deleted. */
  async remove(request: IdRequest): Promise<OkResult> {
    const equipment = await this.findOrFail(request.id);
    if (await this.tickets.count({ where: { equipmentId: equipment.id } })) {
      equipment.status = EquipmentStatus.RETIRED;
      await this.equipment.save(equipment);
    } else {
      await this.equipment.delete(equipment.id);
    }
    return { ok: true };
  }

  async findOrFail(id: string): Promise<Equipment> {
    const equipment = id ? await this.equipment.findOne({ where: { id }, relations: { room: true } }) : null;
    if (!equipment) throw new NotFoundException('Équipement introuvable.');
    return equipment;
  }

  private async assertSerialFree(serialNumber: string, exceptId?: string): Promise<void> {
    const existing = await this.equipment.findOne({
      where: exceptId ? { serialNumber, id: Not(exceptId) } : { serialNumber },
    });
    if (existing) throw new ConflictException('Ce numéro de série existe déjà.');
  }
}

function equipmentName(value: unknown): string {
  const name = requiredText(value, "Le nom de l'équipement");
  if (name.length > 120) throw new BadRequestException('Nom trop long (120 caractères maximum).');
  return name;
}

function optionalAmount(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return amount(value, field);
}

function interval(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3650) {
    throw new BadRequestException("L'intervalle de maintenance doit être un nombre de jours entre 1 et 3650.");
  }
  return value;
}
